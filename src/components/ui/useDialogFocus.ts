import { useEffect, useRef, type RefObject } from 'react'

const DEFAULT_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

type DialogFocusOptions = {
  active?: boolean
  containerRef: RefObject<HTMLElement | null>
  onClose: () => void
  lockBodyScroll?: boolean
  focusableSelector?: string
}

export function useDialogFocus({
  active = true,
  containerRef,
  onClose,
  lockBodyScroll = false,
  focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
}: DialogFocusOptions) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return

    const container = containerRef.current
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow

    if (lockBodyScroll) document.body.style.overflow = 'hidden'

    const focusableItems = () => Array.from(
      container?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    ).filter((item) => item.offsetParent !== null)

    const first = focusableItems()[0]
    ;(first ?? container)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return

      const items = focusableItems()
      if (!items.length) {
        event.preventDefault()
        container.focus()
        return
      }

      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (lockBodyScroll) document.body.style.overflow = previousOverflow
      previousActive?.focus()
    }
  }, [active, containerRef, focusableSelector, lockBodyScroll])
}
