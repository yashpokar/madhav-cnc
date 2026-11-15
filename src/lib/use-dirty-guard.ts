'use client'

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const MESSAGE = 'You have unsaved changes. Leave this page anyway?'

/**
 * Warns before a dirty form is abandoned: closing or reloading the tab, and
 * clicking an in-app link. Dirty means any field changed since the form
 * mounted; submitting the form clears the guard so saving never prompts.
 * Pass the form's ref and the hook watches its input/change events.
 * On /new pages it also focuses the first field.
 */
export function useDirtyGuard(formRef: RefObject<HTMLFormElement | null>) {
  const dirty = useRef(false)

  useEffect(() => {
    const form = formRef.current

    if (!form) return

    const markDirty = () => {
      dirty.current = true
    }
    const markClean = () => {
      dirty.current = false
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current) return

      event.preventDefault()
      event.returnValue = ''
    }
    const onClick = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const link = (event.target as Element | null)?.closest('a[href]')

      if (!link || link.getAttribute('target') === '_blank') return

      const href = link.getAttribute('href') ?? ''

      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

      if (!window.confirm(MESSAGE)) {
        event.preventDefault()
        event.stopPropagation()
      } else {
        dirty.current = false
      }
    }

    // New-record pages open ready to type: focus the first usable field.
    if (window.location.pathname.endsWith('/new')) {
      const first = Array.from(
        form.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select'),
      ).find((el) => !(el as HTMLInputElement).disabled && el.offsetParent !== null)

      first?.focus({ preventScroll: true })
    }

    form.addEventListener('input', markDirty)
    form.addEventListener('change', markDirty)
    form.addEventListener('submit', markClean)
    window.addEventListener('beforeunload', onBeforeUnload)
    // Capture phase so we run before Next's link handler.
    document.addEventListener('click', onClick, true)

    return () => {
      form.removeEventListener('input', markDirty)
      form.removeEventListener('change', markDirty)
      form.removeEventListener('submit', markClean)
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [formRef])

  return {
    /** Call after a successful save that navigates programmatically. */
    markClean: () => {
      dirty.current = false
    },
  }
}
