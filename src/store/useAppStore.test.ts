import 'fake-indexeddb/auto'
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('../lib/saas', () => ({ loadAccount: async () => ({ workspaces: [] }) }))
const memory = new Map<string, string>()
vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) })
const { useAppStore } = await import('./useAppStore')
const { db, getScripts, setContentScope } = await import('../lib/db')
const { readDrafts } = await import('../lib/drafts')
const makeScript = () => ({ title: 'Meu roteiro', content: 'Olá, câmera!', createdAt: Date.now(), updatedAt: Date.now() })
beforeAll(async () => { await db.open() })
beforeEach(async () => { memory.clear(); await db.scripts.clear(); setContentScope(null); useAppStore.setState({ scripts: [], currentScript: null, cloudWorkspace: null, saveStatus: 'saved', saveError: null }) })
afterEach(async () => { const current = useAppStore.getState().currentScript; if (current) await useAppStore.getState().upsertScript(current) })

describe('automatic script saving', () => {
  it('saves typed content without preparing the prompter', async () => {
    useAppStore.getState().selectScript(makeScript())
    expect(useAppStore.getState().saveStatus).toBe('pending')
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect(useAppStore.getState().saveStatus).toBe('saved')
    expect((await getScripts())[0]?.content).toBe('Olá, câmera!')
  })
  it('recovers typing when the page closes before the debounce', async () => {
    useAppStore.getState().selectScript(makeScript())
    expect(readDrafts()).toHaveLength(1)
    const draft = useAppStore.getState().currentScript!
    useAppStore.setState({ currentScript: null })
    await useAppStore.getState().loadScripts()
    expect(useAppStore.getState().scripts[0]?.content).toBe('Olá, câmera!')
    expect(readDrafts()).toHaveLength(0)
    await useAppStore.getState().upsertScript(draft)
  })
  it('keeps one row and one sync identity across rapid saves', async () => {
    useAppStore.getState().selectScript(makeScript())
    const first = useAppStore.getState().currentScript!
    const one = useAppStore.getState().upsertScript(first)
    useAppStore.getState().selectScript({ ...first, content: 'Edição mais recente' })
    const two = useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)
    await Promise.all([one, two])
    const rows = await getScripts()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.key).toBe(first.key)
    expect(rows[0]?.content).toBe('Edição mais recente')
    expect(useAppStore.getState().currentScript?.content).toBe('Edição mais recente')
  })
  it('does not replace another selected script after a save completes', async () => {
    useAppStore.getState().selectScript(makeScript())
    const saving = useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)
    useAppStore.getState().selectScript({ ...makeScript(), title: 'Outro' })
    await saving
    expect(useAppStore.getState().currentScript?.title).toBe('Outro')
  })
  it('keeps an undo made before an earlier save completes', async () => {
    useAppStore.getState().selectScript(makeScript())
    await useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)
    const original = useAppStore.getState().currentScript!
    useAppStore.getState().selectScript({ ...original, content: 'Edição desfeita' })
    const earlier = useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)
    useAppStore.getState().selectScript(original)
    await earlier
    await new Promise((resolve) => setTimeout(resolve, 650))
    expect((await getScripts())[0]?.content).toBe(original.content)
    expect(useAppStore.getState().saveStatus).toBe('saved')
  })
  it('reports a failed database write and retains the recovery draft for retry', async () => {
    useAppStore.getState().selectScript(makeScript())
    const put = vi.spyOn(db.scripts, 'put').mockRejectedValueOnce(new Error('Storage unavailable'))
    await expect(useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)).rejects.toThrow()
    expect(useAppStore.getState().saveStatus).toBe('error')
    expect(readDrafts()).toHaveLength(1)
    put.mockRestore()
    await useAppStore.getState().upsertScript(useAppStore.getState().currentScript!)
    expect(useAppStore.getState().saveStatus).toBe('saved')
    expect(readDrafts()).toHaveLength(0)
  })
})

describe('leaving the team screen for the personal space', () => {
  it('opens a usable empty local library without an account or team', async () => {
    const { openLocalScripts } = await import('../lib/localNavigation')
    useAppStore.setState({ view: 'workspaces' })
    await openLocalScripts()
    expect(useAppStore.getState()).toMatchObject({ view: 'library', cloudWorkspace: null, activeWorkspaceId: null, scripts: [] })
  })
  it('creates and saves the first local script after leaving a cloud workspace', async () => {
    const { openLocalScripts } = await import('../lib/localNavigation')
    setContentScope('old-cloud')
    useAppStore.setState({ view: 'workspaces', cloudWorkspace: { id: 'old-cloud', name: 'Equipe', role: 'viewer', createdAt: '' } })
    await openLocalScripts(true)
    expect(useAppStore.getState()).toMatchObject({ view: 'editor', cloudWorkspace: null, currentScript: { title: 'Novo roteiro', content: '' } })
    const script = useAppStore.getState().currentScript!
    await useAppStore.getState().upsertScript({ ...script, content: 'Meu primeiro texto' })
    const rows = await getScripts()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.cloudWorkspaceId).toBeFalsy()
    expect(rows[0]?.content).toBe('Meu primeiro texto')
  })
})
