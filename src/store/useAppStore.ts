import { loadAccount, type SaaSWorkspace } from '../lib/saas'
import { create } from 'zustand'
import {
  DEFAULT_SETTINGS,
  type AiPanelTab,
  type EngineState,
  type PrompterSettings,
  type Script,
  type View,
  type Workspace,
} from '../lib/types'
import { db, setContentScope, newScriptKey, getScripts, saveScript, deleteScript } from '../lib/db'
import { listWorkspaces } from '../lib/workspace'
import { readDrafts, journalDraft, clearDraft } from '../lib/drafts'
import type { CaptionUtterance } from '../lib/srt'

export interface RecordingData {
  blob: Blob
  url: string
  srt: string | null
  utterances: CaptionUtterance[]
}

export interface PrompterStatus {
  state: EngineState
  fraction: number
}

interface AppState {
  view: View
  saveStatus: 'saved' | 'pending' | 'saving' | 'error'
  saveError: string | null
  cloudWorkspace: SaaSWorkspace | null
  chooseCloudWorkspace: (workspace: SaaSWorkspace | null) => Promise<void>
  scripts: Script[]
  currentScript: Script | null
  settings: PrompterSettings
  loading: boolean
  loadError: string | null
  aiPanelTab: AiPanelTab | null
  recording: RecordingData | null
  prompterState: PrompterStatus | null
  workspaces: Workspace[]
  activeWorkspaceId: number | null
  loadScripts: () => Promise<void>
  setView: (view: View) => void
  selectScript: (script: Script | null) => void
  upsertScript: (script: Script) => Promise<number>
  removeScript: (id: number) => Promise<void>
  updateSettings: (patch: Partial<PrompterSettings>) => void
  resetSettings: () => void
  openAiPanel: (tab: AiPanelTab) => void
  closeAiPanel: () => void
  setRecording: (recording: RecordingData | null) => void
  setPrompterState: (state: PrompterStatus | null) => void
  loadWorkspaces: () => Promise<void>
  refreshWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: number | null) => void
}

const pendingSaves = new Map<string, ReturnType<typeof setTimeout>>()
let saveQueue: Promise<unknown> = Promise.resolve()

function savedSettings(): PrompterSettings {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('alvoprompter-settings') || '{}') } } catch { return DEFAULT_SETTINGS }
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'library',
  saveStatus: 'saved',
  saveError: null,
  cloudWorkspace: null,
  chooseCloudWorkspace: async (workspace) => {
    const verified = workspace ? (await loadAccount()).workspaces.find((w) => w.id === workspace.id) : null
    if (workspace && !verified) throw new Error('Você não tem acesso a este workspace.')
    setContentScope(verified?.id ?? null)
    set({ cloudWorkspace: verified ?? null, currentScript: null, saveStatus: 'saved', saveError: null })
    if (!verified) get().setActiveWorkspace(null)
    await get().loadScripts()
  },
  scripts: [],
  currentScript: null,
  settings: savedSettings(),
  loading: false,
  loadError: null,
  aiPanelTab: null,
  recording: null,
  prompterState: null,
  workspaces: [],
  activeWorkspaceId: (() => {
    const saved = localStorage.getItem('alvoprompt-active-workspace')
    return saved ? Number(saved) : null
  })(),

  loadScripts: async () => {
    set({ loading: true, loadError: null })
    try {
      await saveQueue.catch(() => undefined)
      for (const draft of readDrafts()) {
        if (draft.key) { clearTimeout(pendingSaves.get(draft.key)); pendingSaves.delete(draft.key) }
        const existing = draft.key ? await db.scripts.where('key').equals(draft.key).first() : undefined
        if (!existing || draft.updatedAt >= existing.updatedAt) await saveScript({ ...draft, id: existing?.id ?? draft.id })
        try { clearDraft(draft) } catch { /* Retry cleanup on the next load. */ }
      }
      const scripts = await getScripts()
      const current = get().currentScript
      const persisted = current && scripts.find((s) => s.key === current.key)
      set({ scripts, ...(persisted && (get().saveStatus === 'saved' || persisted.content === current?.content && persisted.title === current?.title) ? { currentScript: persisted, saveStatus: 'saved', saveError: null } : {}) })
    } catch {
      set({ loadError: 'Não foi possível abrir os roteiros salvos neste dispositivo.' })
    } finally {
      set({ loading: false })
    }
  },

  setView: (view) => set({ view }),

  selectScript: (script) => {
    if (!script) { set({ currentScript: null, saveStatus: 'saved', saveError: null }); return }
    const previous = get().currentScript
    const persisted = get().scripts.find((item) => script.id != null && item.id === script.id)
    const next = { ...script, key: script.key ?? persisted?.key ?? newScriptKey(), ...(script.id == null && get().cloudWorkspace ? { cloudWorkspaceId: get().cloudWorkspace!.id } : {}) }
    const pendingEdit = previous?.key === next.key && ['pending', 'saving', 'error'].includes(get().saveStatus)
    const changed = !persisted || persisted.title !== next.title || persisted.content !== next.content || pendingEdit
    if (changed && get().cloudWorkspace?.role === 'viewer') { set({ saveError: 'Seu acesso é de leitura.' }); return }
    if (!changed) { set({ currentScript: next, saveStatus: 'saved', saveError: null }); return }
    next.updatedAt = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1)
    let saveError: string | null = null
    try { journalDraft(next) } catch { saveError = 'A cópia de recuperação está indisponível. Aguarde a confirmação de salvamento.' }
    set({ currentScript: next, saveStatus: 'pending', saveError })
    clearTimeout(pendingSaves.get(next.key))
    pendingSaves.set(next.key, setTimeout(() => {
      pendingSaves.delete(next.key)
      void get().upsertScript(next).catch(() => undefined)
    }, 400))
  },

  upsertScript: async (script) => {
    if (script.cloudWorkspaceId && get().cloudWorkspace?.id === script.cloudWorkspaceId && get().cloudWorkspace?.role === 'viewer') throw new Error('Seu acesso é de leitura.')
    const next = { ...script, key: script.key ?? newScriptKey() }
    clearTimeout(pendingSaves.get(next.key))
    pendingSaves.delete(next.key)
    const save = async () => {
      if (get().currentScript?.key === next.key) set({ saveStatus: 'saving' })
      try {
        const id = await saveScript(next)
        const scripts = await getScripts()
        const current = get().currentScript
        try { clearDraft(next) } catch { /* Persisted safely in IndexedDB. */ }
        set({ scripts })
        if (current?.key === next.key) {
          const stillCurrent = current.updatedAt === next.updatedAt
          set({ currentScript: { ...current, id }, ...(stillCurrent ? { saveStatus: 'saved' as const, saveError: null } : {}) })
        }
        return id
      } catch (error) {
        if (get().currentScript?.key === next.key) set({ saveStatus: 'error', saveError: 'Não foi possível confirmar o salvamento. Mantenha esta tela aberta e tente novamente.' })
        throw error
      }
    }
    const result = saveQueue.catch(() => undefined).then(save)
    saveQueue = result
    return result
  },

  removeScript: async (id) => {
    if (get().cloudWorkspace?.role === 'viewer') throw new Error('Seu acesso é de leitura.')
    const removed = get().scripts.find((script) => script.id === id)
    if (removed?.key) { clearTimeout(pendingSaves.get(removed.key)); pendingSaves.delete(removed.key); try { clearDraft({ ...removed, updatedAt: Number.MAX_SAFE_INTEGER }) } catch {} }
    await saveQueue.catch(() => undefined)
    await deleteScript(id)
    const scripts = (await getScripts()).filter((s) => s.id !== id)
    set({
      scripts,
      currentScript: get().currentScript?.id === id ? null : get().currentScript,
    })
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch }
    try { localStorage.setItem('alvoprompter-settings', JSON.stringify(settings)) } catch {}
    set({ settings })
  },

  resetSettings: () => { try { localStorage.removeItem('alvoprompter-settings') } catch {} set({ settings: DEFAULT_SETTINGS }) },

  openAiPanel: (tab) => set({ aiPanelTab: tab }),

  closeAiPanel: () => set({ aiPanelTab: null }),

  setRecording: (recording) => {
    const previous = get().recording
    if (previous) URL.revokeObjectURL(previous.url)
    // The recorder owns and revokes its preview URL when leaving the prompter.
    // Keep a separate URL for the editor's lifetime.
    set({ recording: recording ? { ...recording, url: URL.createObjectURL(recording.blob) } : null })
  },

  setPrompterState: (prompterState) => set({ prompterState }),

  loadWorkspaces: async () => {
    const workspaces = await listWorkspaces()
    set({ workspaces })
  },

  refreshWorkspaces: async () => {
    const workspaces = await listWorkspaces()
    const activeWorkspaceId = get().activeWorkspaceId
    const stillExists = workspaces.some((w) => w.id === activeWorkspaceId)
    set({
      workspaces,
      activeWorkspaceId: stillExists ? activeWorkspaceId : workspaces[0]?.id ?? null,
    })
    if (!stillExists) localStorage.removeItem('alvoprompt-active-workspace')
  },

  setActiveWorkspace: (id) => {
    if (id == null) localStorage.removeItem('alvoprompt-active-workspace')
    else localStorage.setItem('alvoprompt-active-workspace', String(id))
    set({ activeWorkspaceId: id })
  },
}))
