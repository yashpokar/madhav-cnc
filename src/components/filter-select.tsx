'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Select } from '@/components/catalyst/select'

/**
 * A dropdown filter that lives in the URL. Choosing a value keeps the other
 * filters and search, and goes back to the first page.
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
    <Select
      aria-label={label}
      value={value ?? ''}
      disabled={pending}
      onChange={(event) => change(event.target.value)}
      className="w-full sm:w-64"
    >
      <option value="">{allLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  )
}
