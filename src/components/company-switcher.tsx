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
}: {
  companies: CompanyChoice[]
  activeId: string | null
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const active = companies.find((company) => company.id === activeId) ?? companies[0]

  const lockup = (
    <span className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-xs/4 font-semibold text-white"
      >
        {initials(active?.companyName ?? '?')}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm/5 font-semibold text-zinc-950 dark:text-white">
          {active?.companyName ?? 'No company'}
        </span>
        <span className="block truncate text-xs/5 text-zinc-500 dark:text-zinc-400">
          Order management
        </span>
      </span>
    </span>
  )

  if (companies.length < 2 && !canManage) {
    return <div className="px-2">{lockup}</div>
  }

  return (
    <Dropdown>
      <DropdownButton
        plain
        disabled={pending}
        aria-label="Switch company"
        className="w-full justify-between"
      >
        {lockup}
        <ChevronUpDownIcon data-slot="icon" />
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
