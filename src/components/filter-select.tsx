'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/16/solid'
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'

/**
 * A dropdown filter that lives in the URL and applies the moment you choose.
 * It shows the filter's name and the current choice ("Reason  Damaged goods"),
 * keeps the other filters and search, and goes back to the first page.
 */
export function FilterSelect({
  param,
  label,
  allLabel,
  options,
  value,
}: {
  param: string
  label: string
  allLabel: string
  options: { value: string; label: string }[]
  value: string | undefined
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const current = value ? options.find((option) => option.value === value) : undefined
  const choices = [{ value: '', label: allLabel }, ...options]

  function change(next: string) {
    const params = new URLSearchParams(searchParams.toString())

    if (next) params.set(param, next)
    else params.delete(param)
    params.delete('page')

    const query = params.toString()

    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    })
  }

  return (
    <Dropdown>
      <DropdownButton outline disabled={pending} className="justify-start gap-3 whitespace-nowrap">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
          <span className={current ? 'font-semibold' : 'font-medium'}>
            {current ? current.label : allLabel}
          </span>
        </span>
        <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-zinc-500 dark:text-zinc-400" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="max-h-80 min-w-56">
        {choices.map((option) => (
          <DropdownItem key={option.value || 'all'} onClick={() => change(option.value)}>
            {(option.value || undefined) === (current?.value ?? undefined) ? (
              <CheckIcon data-slot="icon" />
            ) : (
              <span data-slot="icon" aria-hidden="true" />
            )}
            <DropdownLabel>{option.label}</DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}
