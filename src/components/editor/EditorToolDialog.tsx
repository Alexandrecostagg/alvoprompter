import { useEffect, useRef, type ReactNode } from 'react'

export default function EditorToolDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
    className="m-auto max-h-[85dvh] max-w-2xl overflow-y-auto rounded-3xl border p-0 shadow-2xl backdrop:bg-slate-950/60"
    style={{ color: 'var(--text)', background: 'var(--panel)', borderColor: 'var(--border)', width: 'calc(100% - 2rem)' }}>
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-5 py-3" style={{ background: 'var(--panel)', borderColor: 'var(--border)' }}>
      <h2 className="text-lg font-bold">{title}</h2>
      <button autoFocus onClick={onClose} aria-label={`Fechar ${title.toLowerCase()}`} className="min-h-11 min-w-11 rounded-xl border px-3" style={{ borderColor: 'var(--border)' }}>✕</button>
    </div>
    <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
  </dialog>
}
