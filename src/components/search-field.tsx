'use client'

import { useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid'
import { Input, InputGroup } from '@/components/catalyst/input'

export function SearchField({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())

      if (value.trim()) {
        params.set('q', value.trim())
      } else {
        params.delete('q')
      }

      const query = params.toString()
      const target = query ? `${pathname}?${query}` : pathname

      startTransition(() => {
        router.replace(target, { scroll: false })
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [value, pathname, router, searchParams])

  return (
    <InputGroup className="sm:w-72">
      <MagnifyingGlassIcon />
      <Input
        type="search"
        name="q"
        aria-label="Search"
        placeholder={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </InputGroup>
  )
}
