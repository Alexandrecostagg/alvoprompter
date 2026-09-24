import { useAppStore } from '../store/useAppStore'

/** Local access always clears the cloud scope before opening or creating a script. */
export async function openLocalScripts(create = false): Promise<void> {
  await useAppStore.getState().chooseCloudWorkspace(null)
  const store = useAppStore.getState()
  if (create) {
    const now = Date.now()
    store.selectScript({ title: 'Novo roteiro', content: '', createdAt: now, updatedAt: now })
  }
  store.setView(create ? 'editor' : 'library')
}
