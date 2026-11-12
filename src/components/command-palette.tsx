'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Headless from '@headlessui/react'
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import { searchEverything, type SearchHit } from '@/lib/actions/search'
import type { NavEntry } from '@/lib/navigation'

type Option = { id: string; group: string; title: string; subtitle: string; href: string }

/**
 * Global ⌘K / Ctrl+K search. Jumps to pages and records the user may read.
 */
export function CommandPalette({ pages }: { pages: readonly NavEntry[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const requestId = useRef(0)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    function onOpen() {
      setOpen(true)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('open-command-palette', onOpen)

    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-command-palette', onOpen)
    }
  }, [])

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

  const term = query.trim().toLowerCase()
  const pageOptions: Option[] = pages
    .filter((page) => term === '' || page.label.toLowerCase().includes(term))
    .map((page) => ({
      id: `page-${page.href}`,
      group: 'Go to',
      title: page.label,
      subtitle: '',
      href: page.href,
    }))

  const options: Option[] = term.length >= 2 ? [...hits, ...pageOptions] : pageOptions
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
              if (option) {
                close()
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
                : term.length >= 2 && hits.length === 0
                  ? `No records match “${query.trim()}”`
                  : term.length < 2
                    ? 'Type at least 2 characters to search records'
                    : ''}
            </p>
          </Headless.Combobox>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

export function SearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={() => window.dispatchEvent(new Event('open-command-palette'))}
      className={className}
    >
      <MagnifyingGlassIcon className="size-5" aria-hidden="true" />
    </button>
  )
}
