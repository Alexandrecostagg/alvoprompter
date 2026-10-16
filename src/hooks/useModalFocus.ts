import { useEffect, useRef, type RefObject } from 'react'

/** Keep keyboard navigation inside a modal and restore focus to its opener. */
export function useModalFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const previous = document.activeElement as HTMLElement | null
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(el => el.tabIndex >= 0 && el.getClientRects().length && !el.closest('[hidden]'))
    const first = dialog.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? controls()[0]
    first?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = controls(), first = items[0], last = items.at(-1)
      if (!first || !last) { event.preventDefault(); return }
      if (!dialog.contains(document.activeElement) || event.shiftKey && document.activeElement === first) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('keydown', onKey, true); if (previous?.isConnected) previous.focus() }
  }, [open, ref])
}
