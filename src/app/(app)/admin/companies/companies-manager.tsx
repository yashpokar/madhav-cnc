'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Subheading } from '@/components/catalyst/heading'
import { Checkbox } from '@/components/catalyst/checkbox'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { createCompany, setCompanyAccess } from '@/lib/actions/companies'

type Company = { id: string; companyName: string; gstin: string | null; city: string | null }
type Person = { id: string; name: string; email: string }

export function CompaniesManager({
  companies,
  users,
  granted,
}: {
  companies: Company[]
  users: Person[]
  granted: string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [allowed, setAllowed] = useState(() => new Set(granted))

  function add() {
    startTransition(async () => {
      const result = await createCompany(name)

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
      const next = new Set(current)

      if (on) next.add(key)
      else next.delete(key)

      return next
    })
    startTransition(async () => {
      const result = await setCompanyAccess(userId, companyId, on)

      if (!result.ok) setMessage({ ok: false, text: result.error })
    })
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {message ? (
        <FormBanner tone={message.ok ? 'success' : 'error'}>{message.text}</FormBanner>
      ) : null}

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Add a company</Subheading>
        <div className="flex max-w-xl items-start gap-2">
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
          <Button className="shrink-0 whitespace-nowrap" disabled={pending || !name.trim()} onClick={add}>
            Add company
          </Button>
        </div>
        <Text className="max-w-xl">
          It starts with the production stages, expense categories and payment modes of the company
          you are working in. Add its address, GSTIN, bank and logo under Company details after
          switching to it.
        </Text>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Who can open what</Subheading>
        {users.length === 0 ? (
          <Text>Everyone with an account is an administrator, so they can open every company.</Text>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-950/10 dark:ring-white/10">
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
                        <span className="inline-flex">
                          <Checkbox
                            aria-label={`${person.name} can open ${company.companyName}`}
                            checked={allowed.has(`${person.id}:${company.id}`)}
                            onChange={(on) => toggle(person.id, company.id, on)}
                          />
                        </span>
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
