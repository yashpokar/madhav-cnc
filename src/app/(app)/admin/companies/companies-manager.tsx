'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Subheading } from '@/components/catalyst/heading'
import { Checkbox } from '@/components/catalyst/checkbox'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { Select } from '@/components/catalyst/select'
import { createCompany, setCompanyAccess, setCompanyRole } from '@/lib/actions/companies'
import { DEFAULT_INDUSTRY, INDUSTRY_LIST, type IndustryKey } from '@/lib/industry'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'

type Company = { id: string; companyName: string; gstin: string | null; city: string | null }
type Person = { id: string; name: string; email: string; role: UserRole }
type Grant = { key: string; role: UserRole | null }

const ROLES = Object.values(UserRole)

export function CompaniesManager({
  companies,
  users,
  granted,
}: {
  companies: Company[]
  users: Person[]
  granted: Grant[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState<IndustryKey>(DEFAULT_INDUSTRY)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  // key "userId:companyId" -> the role there (null = default). Present = has access.
  const [allowed, setAllowed] = useState(
    () => new Map<string, UserRole | null>(granted.map((row) => [row.key, row.role])),
  )

  function add() {
    startTransition(async () => {
      const result = await createCompany(name, industry)

      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })

      if (result.ok) {
        setName('')
        router.refresh()
      }
    })
  }

  function toggle(userId: string, companyId: string, on: boolean) {
    const key = `${userId}:${companyId}`

    setAllowed((current) => {
      const next = new Map(current)

      if (on) next.set(key, current.get(key) ?? null)
      else next.delete(key)

      return next
    })
    startTransition(async () => {
      const result = await setCompanyAccess(userId, companyId, on)

      if (!result.ok) setMessage({ ok: false, text: result.error })
    })
  }

  function changeRole(userId: string, companyId: string, role: UserRole | null) {
    const key = `${userId}:${companyId}`

    setAllowed((current) => new Map(current).set(key, role))
    startTransition(async () => {
      const result = await setCompanyRole(userId, companyId, role)

      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })
    })
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {message ? (
        <FormBanner tone={message.ok ? 'success' : 'error'}>{message.text}</FormBanner>
      ) : null}

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Add a company</Subheading>
        <div className="flex max-w-xl items-center gap-2">
          <Input
            className="min-w-0 flex-1"
            value={name}
            placeholder="Company name"
            aria-label="Company name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) add()
            }}
          />
          <Select
            className="max-w-48 shrink-0"
            value={industry}
            aria-label="Industry"
            onChange={(event) => setIndustry(event.target.value as IndustryKey)}
          >
            {INDUSTRY_LIST.map((template) => (
              <option key={template.key} value={template.key}>
                {template.label}
              </option>
            ))}
          </Select>
          <Button className="shrink-0 whitespace-nowrap" disabled={pending || !name.trim()} onClick={add}>
            Add company
          </Button>
        </div>
        <Text className="max-w-xl">
          It starts with the production stages, expense categories and payment methods of the company
          you are working in. Add its address, GSTIN, bank and logo under Business profile after
          switching to it.
        </Text>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Who can open what</Subheading>
        {users.length === 0 ? (
          <Text>Everyone with an account is an administrator, so they can open every company.</Text>
        ) : (
          <div className="overflow-x-auto surface-card">
            <table className="w-full text-left text-sm/6">
              <thead className="border-b border-zinc-950/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  {companies.map((company) => (
                    <th key={company.id} className="px-4 py-2.5 text-center font-medium">
                      {company.companyName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
                {users.map((person) => (
                  <tr key={person.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{person.name}</div>
                      <div className="text-xs/5 text-zinc-500">{person.email}</div>
                    </td>
                    {companies.map((company) => (
                      <td key={company.id} className="px-4 py-2.5 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <Checkbox
                            aria-label={`${person.name} can open ${company.companyName}`}
                            checked={allowed.has(`${person.id}:${company.id}`)}
                            onChange={(on) => toggle(person.id, company.id, on)}
                          />
                          {allowed.has(`${person.id}:${company.id}`) ? (
                            <Select
                              className="min-w-36"
                              aria-label={`${person.name}'s role in ${company.companyName}`}
                              value={allowed.get(`${person.id}:${company.id}`) ?? ''}
                              disabled={pending}
                              onChange={(event) =>
                                changeRole(
                                  person.id,
                                  company.id,
                                  (event.target.value || null) as UserRole | null,
                                )
                              }
                            >
                              <option value="">Default ({ROLE_LABELS[person.role]})</option>
                              {ROLES.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABELS[role]}
                                </option>
                              ))}
                            </Select>
                          ) : null}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
