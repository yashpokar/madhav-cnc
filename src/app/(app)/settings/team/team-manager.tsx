'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Subheading } from '@/components/catalyst/heading'
import { FormBanner } from '@/components/form-banner'
import { addMember, changeMemberRole, removeMember } from '@/lib/actions/team'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'

type Member = {
  id: string
  name: string
  email: string
  role: UserRole
  isSuperAdmin: boolean
}

const ROLES = Object.values(UserRole)

export function TeamManager({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('VIEWER')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function run(task: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>, after?: () => void) {
    startTransition(async () => {
      const result = await task()

      setMessage(result.ok ? { ok: true, text: result.message } : { ok: false, text: result.error })

      if (result.ok) {
        after?.()
        router.refresh()
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-8">
      {message ? <FormBanner tone={message.ok ? 'success' : 'error'}>{message.text}</FormBanner> : null}

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Add a person</Subheading>
        <div className="flex max-w-2xl flex-wrap items-start gap-2">
          <Input
            type="email"
            className="min-w-0 flex-1 basis-60"
            value={email}
            placeholder="Their email address"
            aria-label="Email address"
            onChange={(event) => setEmail(event.target.value)}
          />
          <Select
            className="w-40"
            aria-label="Role"
            value={role}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            {ROLES.map((value) => (
              <option key={value} value={value}>
                {ROLE_LABELS[value]}
              </option>
            ))}
          </Select>
          <Button
            className="shrink-0 whitespace-nowrap"
            disabled={pending || !email.trim()}
            onClick={() => run(() => addMember(email, role), () => setEmail(''))}
          >
            Add
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <Subheading level={2}>Members</Subheading>
        <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-950/10 dark:ring-white/10">
          <table className="w-full text-left text-sm/6">
            <thead className="border-b border-zinc-950/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Person</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium">
                      {member.name}
                      {member.id === currentUserId ? ' (you)' : ''}
                    </div>
                    <div className="text-xs/5 text-zinc-500">{member.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {member.isSuperAdmin ? (
                      <span>Platform administrator</span>
                    ) : (
                      <Select
                        className="min-w-36"
                        aria-label={`${member.name}'s role`}
                        value={member.role}
                        disabled={pending}
                        onChange={(event) =>
                          run(() => changeMemberRole(member.id, event.target.value as UserRole))
                        }
                      >
                        {ROLES.map((value) => (
                          <option key={value} value={value}>
                            {ROLE_LABELS[value]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {member.isSuperAdmin ? null : (
                      <Button
                        plain
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Remove ${member.email} from this company?`)) {
                            run(() => removeMember(member.id))
                          }
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
