'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/20/solid'
import { Dialog, DialogBody, DialogDescription, DialogTitle } from '@/components/catalyst/dialog'
import { Button } from '@/components/catalyst/button'
import { CREATE_CAPABILITIES, type CreateAction } from '@/components/create-menu'
import { can } from '@/lib/permissions'
import { setQuickContext } from '@/lib/quick-context'
import { recordKind, saveRecent } from '@/lib/recents'
import { IDLE_CHORD, SHORTCUT_LIST, isTypingContext, resolveKey, type ChordState } from '@/lib/shortcuts'
import { NAVIGATE_EVENT } from '@/lib/toast'
import { singularTerm } from '@/lib/quick-create'
import type { NavEntry } from '@/lib/navigation'
import type { UserRole } from '@/generated/prisma/enums'

export const OPEN_PALETTE_EVENT = 'open-command-palette'
export const OPEN_HELP_EVENT = 'open-shortcuts-help'

const OVERLAY = '[role="dialog"], [role="menu"], [role="listbox"]'

/**
 * Global keyboard shortcuts, the cheat sheet, recent-record tracking, toast
 * link navigation and the mobile "New" button. Mounted once in the app shell.
 */
export function Shortcuts({
  userId,
  companyId,
  role,
  nav,
}: {
  userId: string
  companyId: string | null
  role: UserRole
  nav: readonly NavEntry[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [helpOpen, setHelpOpen] = useState(false)
  const chord = useRef<ChordState>(IDLE_CHORD)

  const allowed = (Object.keys(CREATE_CAPABILITIES) as CreateAction[]).filter((key) =>
    can(role, CREATE_CAPABILITIES[key]),
  )
  const allowedKey = allowed.join()
  const orderLabel = nav.find((entry) => entry.href === '/orders')?.label ?? 'Orders'

  useEffect(() => {
    setQuickContext({ userId, companyId, allowed: allowedKey ? allowedKey.split(',') : [], orderTerm: singularTerm(orderLabel) })
  }, [userId, companyId, allowedKey, orderLabel])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return

      const element = event.target instanceof HTMLElement ? event.target : null
      const typing = isTypingContext(
        element && {
          tagName: element.tagName,
          isContentEditable: element.isContentEditable,
          inDialog: Boolean(element.closest(OVERLAY)),
        },
        Boolean(document.querySelector(OVERLAY)),
      )

      if (typing) {
        chord.current = IDLE_CHORD
        return
      }

      const result = resolveKey(chord.current, event, Date.now())

      chord.current = result.state

      const action = result.action

      if (!action) return

      if (action.type === 'create') {
        if (allowedKey === '') return
        event.preventDefault()
        window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: 'new ' } }))
      } else if (action.type === 'help') {
        event.preventDefault()
        setHelpOpen(true)
      } else if (action.type === 'go') {
        event.preventDefault()
        router.push(action.href)
      } else {
        const field = document.querySelector<HTMLInputElement>('input[type="search"], input[name="q"]')

        if (field && field.offsetParent !== null) {
          event.preventDefault()
          field.focus()
          field.select()
        }
      }
    }

    function onHelp() {
      setHelpOpen(true)
    }

    function onNavigate(event: Event) {
      const href = (event as CustomEvent<string>).detail

      if (typeof href === 'string' && href.startsWith('/')) router.push(href)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_HELP_EVENT, onHelp)
    window.addEventListener(NAVIGATE_EVENT, onNavigate)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_HELP_EVENT, onHelp)
      window.removeEventListener(NAVIGATE_EVENT, onNavigate)
    }
  }, [router, allowedKey])

  // Remember record pages the person opens, for the palette's Recent list.
  useEffect(() => {
    const kind = recordKind(pathname)

    if (!kind) return

    // Give the page a moment to render its heading.
    const timer = setTimeout(() => {
      const title = document.querySelector('h1')?.textContent?.trim() || document.title

      saveRecent(userId, { href: pathname, title, kind })
    }, 800)

    return () => clearTimeout(timer)
  }, [pathname, userId])

  const showFab = allowed.length > 0 && !pathname.endsWith('/new')

  return (
    <>
      {showFab ? (
        <button
          type="button"
          aria-label="New"
          onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PALETTE_EVENT, { detail: { query: 'new ' } }))}
          className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-600 pr-5 pl-4 text-sm/6 font-semibold text-white shadow-lg ring-1 ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 active:scale-95 lg:hidden print:hidden"
        >
          <PlusIcon className="size-5" aria-hidden="true" />
          New
        </button>
      ) : null}

      <Dialog open={helpOpen} onClose={setHelpOpen} size="md">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Shortcuts pause while you are typing in a field.</DialogDescription>
        <DialogBody>
          <dl className="grid grid-cols-1 divide-y divide-zinc-950/5 dark:divide-white/10">
            {SHORTCUT_LIST.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 py-2 text-sm/6">
                <dt className="text-zinc-700 dark:text-zinc-300">{row.label}</dt>
                <dd className="flex items-center gap-1">
                  {row.keys.map((key, index) => (
                    <span key={key} className="flex items-center gap-1">
                      {index > 0 ? <span className="text-xs text-zinc-400">then</span> : null}
                      <kbd className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-sans text-xs/5 font-medium text-zinc-700 ring-1 ring-zinc-950/10 dark:bg-white/10 dark:text-zinc-200 dark:ring-white/10">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </DialogBody>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setHelpOpen(false)}>Done</Button>
        </div>
      </Dialog>
    </>
  )
}
