import { createRoot } from 'react-dom/client'
import ScriptEditor from '../src/components/editor/ScriptEditor'
import { useAppStore } from '../src/store/useAppStore'
import '../src/index.css'

useAppStore.setState({ currentScript: { id: 991, title: 'Ensaio de apresentação', content: 'Olá! Hoje vamos apresentar três ideias para gravar vídeos com clareza. Primeiro, escreva um roteiro. Depois, ensaie em voz alta. Por fim, ajuste o ritmo e grave.', createdAt: Date.now(), updatedAt: Date.now() }, saveStatus: 'saved' })
export function Preview() {
  const settings = useAppStore((state) => state.settings)
  return <><div className="p-3 text-xs" role="status">Prévia local · Modo: {settings.mode} · Ritmo: {settings.wpm} · Tempo-alvo: {settings.targetMinutes}</div><ScriptEditor /></>
}
createRoot(document.getElementById('root')!).render(<Preview />)
