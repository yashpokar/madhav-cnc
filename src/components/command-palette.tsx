'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Headless from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import { searchEverything, type SearchHit } from '@/lib/actions/search'
import type { NavEntry } from '@/lib/navigation'
import { CREATE_ACTIONS, type CreateAction } from '@/components/create-menu'
import { useQuickContext } from '@/lib/quick-context'
import { loadRecents, type Recent } from '@/lib/recents'
import { matchCreateCommands, type CreateCommand } from '@/lib/quick-create'

type Option = {
  id: string
  group: string
  title: string
  subtitle: string
  href: string
  /** Opens the shortcuts cheat sheet instead of navigating. */
  help?: boolean
}

/** Extra words people type for a Create action, beyond its label. */
const ALIASES: Record<CreateAction, string[]> = {
  quotation: ['quote', 'estimate'],
  order: ['order', 'job'],
  challan: ['dispatch', 'delivery', 'challan'],
  invoice: ['bill'],
  receipt: ['payment', 'collect'],
  expense: ['spend', 'cost'],
  customer: ['client'],
}

/**
 * Global ⌘K / Ctrl+K search. Jumps to pages and records the user may read.
 */
export function CommandPalette({ pages }: { pages: readonly NavEntry[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [recents, setRecents] = useState<Recent[]>([])
  const requestId = useRef(0)
  const preset = useRef('')
  const quick = useQuickContext()

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setRecents(quick.userId ? loadRecents(quick.userId) : [])
        setOpen((current) => !current)
      }
    }

    function onOpen(event: Event) {
      const presetQuery = (event as CustomEvent<{ query?: string } | undefined>).detail?.query

      preset.current = presetQuery ?? ''
      setRecents(quick.userId ? loadRecents(quick.userId) : [])
      setOpen(true)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpen)
    }
  }, [quick.userId])

  useEffect(() => {
    const term = query.trim()
    const id = ++requestId.current

    if (term.length < 2) {
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)

      try {
        const result = await searchEverything(term)

        if (id === requestId.current) {
          setHits(result)
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false)
        }
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setHits([])
  }, [])

  /** Types a preset such as "new " into the freshly mounted input. */
  function applyPreset(input: HTMLInputElement | null) {
    if (!input || !preset.current) return

    const text = preset.current

    preset.current = ''
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const term = query.trim().toLowerCase()
  const commands: CreateCommand[] = (quick.allowed as CreateAction[])
    .filter((key) => key in CREATE_ACTIONS)
    .map((key) => ({
      key,
      label: key === 'order' ? quick.orderTerm : CREATE_ACTIONS[key].label,
      href: CREATE_ACTIONS[key].href,
      words: ALIASES[key],
    }))
  const createOptions: Option[] = matchCreateCommands(query, commands).map((command) => ({
    id: `create-${command.key}`,
    group: 'Create',
    title: `New ${command.label.toLowerCase()}`,
    subtitle: CREATE_ACTIONS[command.key as CreateAction].hint,
    href: command.href,
  }))
  const hasCreate = createOptions.length > 0
  const recentOptions: Option[] =
    term === ''
      ? recents.map((row) => ({
          id: `recent-${row.href}`,
          group: 'Recent',
          title: row.title,
          subtitle: row.kind,
          href: row.href,
        }))
      : []
  const helpOptions: Option[] =
    term === '?' || (term.length >= 2 && 'keyboard shortcuts help'.includes(term))
      ? [{ id: 'help', group: 'Help', title: 'Keyboard shortcuts', subtitle: '?', href: '', help: true }]
      : []
  const pageOptions: Option[] = pages
    .filter((page) => term === '' || page.label.toLowerCase().includes(term))
    .map((page) => ({
      id: `page-${page.href}`,
      group: 'Go to',
      title: page.label,
      subtitle: page.group && page.group !== 'Overview' ? page.group : '',
      href: page.href,
    }))

  const options: Option[] = [
    ...createOptions,
    ...recentOptions,
    ...(term.length >= 2 ? hits : []),
    ...(term === '?' ? [] : pageOptions),
    ...helpOptions,
  ]
  const groups = options.reduce<Record<string, Option[]>>((acc, option) => {
    ;(acc[option.group] ??= []).push(option)

    return acc
  }, {})

  return (
    <Headless.Dialog open={open} onClose={close} className="relative z-50">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/30 transition data-closed:opacity-0 dark:bg-zinc-950/60"
      />
      <div className="fixed inset-0 overflow-y-auto p-3 pt-[12vh] sm:p-6 sm:pt-[14vh]">
        <Headless.DialogPanel
          transition
          className="mx-auto w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-950/10 transition data-closed:scale-95 data-closed:opacity-0 dark:bg-zinc-900 dark:ring-white/10"
        >
          <Headless.Combobox
            onChange={(option: Option | null) => {
              if (!option) return

              close()

              if (option.help) {
                window.dispatchEvent(new Event('open-shortcuts-help'))
              } else {
                router.push(option.href)
              }
            }}
          >
            <div className="flex items-center gap-2 border-b border-zinc-950/10 px-3 dark:border-white/10">
              <MagnifyingGlassIcon
                className="size-4 shrink-0 text-zinc-500"
                aria-hidden="true"
              />
              <Headless.ComboboxInput
                autoFocus
                aria-label="Search customers, quotations, orders, invoices and pages"
                placeholder="Search customers, quotes, orders, invoices…"
                className="h-11 w-full bg-transparent text-base text-zinc-950 outline-hidden placeholder:text-zinc-500 sm:text-sm dark:text-white"
                ref={applyPreset}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd className="hidden rounded bg-zinc-100 px-1.5 text-xs/5 text-zinc-500 sm:block dark:bg-white/10">
                Esc
              </kbd>
            </div>

            <Headless.ComboboxOptions
              static
              className="max-h-[60vh] overflow-y-auto p-1.5 empty:hidden"
            >
              {Object.entries(groups).map(([group, rows]) => (
                <div key={group} role="group" aria-label={group}>
                  <div className="px-2 pt-2 pb-1 text-xs/5 font-medium text-zinc-500 dark:text-zinc-400">
                    {group}
                  </div>
                  {rows.map((option) => (
                    <Headless.ComboboxOption
                      key={option.id}
                      value={option}
                      className="flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-sm/6 text-zinc-950 data-focus:bg-zinc-950/5 dark:text-white dark:data-focus:bg-white/10"
                    >
                      <span className="truncate font-medium">{option.title}</span>
                      {option.subtitle ? (
                        <span className="truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
                          {option.subtitle}
                        </span>
                      ) : null}
                    </Headless.ComboboxOption>
                  ))}
                </div>
              ))}
            </Headless.ComboboxOptions>

            <p
              role="status"
              className="px-4 py-3 text-sm/6 text-zinc-500 empty:hidden dark:text-zinc-400"
            >
              {loading
                ? 'Searching…'
                : term.length >= 2 && hits.length === 0 && !hasCreate
                  ? `No records match “${query.trim()}”`
                  : term.length < 2 && !hasCreate
                    ? 'Type at least 2 characters to search records, or “new” to create. ? lists shortcuts'
                    : ''}
            </p>
          </Headless.Combobox>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

export function SearchTrigger({ className, ...rest }: { className?: string; 'data-tour'?: string }) {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
      className={className}
      {...rest}
    >
      <MagnifyingGlassIcon className="size-5" aria-hidden="true" />
    </button>
  )
}
