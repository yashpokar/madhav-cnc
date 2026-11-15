'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid'
import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/catalyst/dropdown'
import { switchCompany } from '@/lib/actions/companies'

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')

export type CompanyChoice = { id: string; companyName: string }

/**
 * The company name at the top of the sidebar. With more than one company it
 * opens a list to switch between them; with one it is just the name.
 */
export function CompanySwitcher({
  companies,
  activeId,
  canManage,
  roleLabel,
}: {
  companies: CompanyChoice[]
  activeId: string | null
  canManage: boolean
  /** The person's role in the active company, shown under its name. */
  roleLabel?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const active = companies.find((company) => company.id === activeId) ?? companies[0]

  const lockup = (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs/4 font-semibold text-zinc-700 ring-1 ring-zinc-950/5 dark:bg-white/10 dark:text-zinc-200 dark:ring-white/10"
      >
        {initials(active?.companyName ?? '?')}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm/5 font-semibold text-zinc-950 dark:text-white">
          {active?.companyName ?? 'No company'}
        </span>
        <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
          {roleLabel ?? 'Workspace'}
        </span>
      </span>
    </span>
  )

  if (companies.length < 2 && !canManage) {
    return <div>{lockup}</div>
  }

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        type="button"
        disabled={pending}
        aria-label="Switch company"
        className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-accent-500 dark:hover:bg-white/5"
      >
        {lockup}
        <ChevronUpDownIcon className="size-4 shrink-0 text-zinc-500" aria-hidden="true" />
      </DropdownButton>
      <DropdownMenu className="min-w-64" anchor="bottom start">
        {companies.map((company) => (
          <DropdownItem
            key={company.id}
            onClick={() =>
              startTransition(async () => {
                await switchCompany(company.id)
                router.push('/')
                router.refresh()
              })
            }
          >
            <DropdownLabel>{company.companyName}</DropdownLabel>
            {company.id === active?.id ? <CheckIcon data-slot="icon" /> : null}
          </DropdownItem>
        ))}
        {canManage ? (
          <>
            <DropdownDivider />
            <DropdownItem href="/admin/companies">
              <DropdownLabel>Manage companies</DropdownLabel>
            </DropdownItem>
          </>
        ) : null}
      </DropdownMenu>
    </Dropdown>
  )
}
