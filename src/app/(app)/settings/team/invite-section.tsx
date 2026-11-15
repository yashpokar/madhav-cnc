'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from '@/components/catalyst/dialog'
import { Description, ErrorMessage, Field, FieldGroup, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Select } from '@/components/catalyst/select'
import { Subheading } from '@/components/catalyst/heading'
import { LocalTime } from '@/components/local-time'
import { createInvitation, regenerateInvitation, revokeInvitation } from '@/lib/actions/invitations'
import { ROLE_BLURBS, inviteMessage, inviteUrl, type InviteStatus } from '@/lib/invite-rules'
import { ROLE_LABELS } from '@/lib/permissions'
import { whatsappLink } from '@/lib/whatsapp'
import { notify } from '@/lib/toast'
import { UserRole } from '@/generated/prisma/enums'

export type PendingInvite = {
  id: string
  token: string
  role: UserRole
  email: string | null
  phone: string | null
  note: string | null
  status: InviteStatus
  expiresAt: string
  createdAt: string
}

const ROLES = Object.values(UserRole)

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    notify.success('Link copied')
  } catch {
    notify.error('Could not copy', 'Select the link and copy it by hand.')
  }
}

function messageFor(invite: Pick<PendingInvite, 'role' | 'token'>, ctx: Context) {
  return inviteMessage({
    inviter: ctx.inviterName,
    company: ctx.companyName,
    role: invite.role,
    url: inviteUrl(ctx.baseUrl, invite.token),
  })
}

type Context = { baseUrl: string; inviterName: string; companyName: string }

function WhatsAppButton({
  invite,
  ctx,
  big,
  label = 'Send on WhatsApp',
}: {
  invite: Pick<PendingInvite, 'role' | 'token' | 'phone'>
  ctx: Context
  big?: boolean
  label?: string
}) {
  return (
    <Button
      href={whatsappLink(invite.phone, messageFor(invite, ctx))}
      target="_blank"
      rel="noopener noreferrer"
      {...(big ? { color: 'green' as const, className: 'w-full' } : { plain: true as const })}
    >
      {label}
    </Button>
  )
}

export function InviteSection({
  invites,
  baseUrl,
  inviterName,
  companyName,
}: {
  invites: PendingInvite[]
  baseUrl: string
  inviterName: string
  companyName: string
}) {
  const router = useRouter()
  const ctx: Context = { baseUrl, inviterName, companyName }
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [role, setRole] = useState<UserRole>('SALES')
  const [note, setNote] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<PendingInvite | null>(null)

  function reset() {
    setCreated(null)
    setError(null)
    setNote('')
    setPhone('')
    setEmail('')
    setRole('SALES')
  }

  function close() {
    setOpen(false)
    reset()
  }

  function create() {
    setError(null)
    startTransition(async () => {
      const result = await createInvitation({ role, email, phone, note })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setCreated({
        ...result.invitation,
        expiresAt: new Date(result.invitation.expiresAt).toISOString(),
        createdAt: new Date(result.invitation.createdAt).toISOString(),
      })
      router.refresh()
    })
  }

  function run(task: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await task()

      if (result.ok) {
        notify.success(result.message)
        router.refresh()
      } else {
        notify.error(result.error)
      }
    })
  }

  const link = created ? inviteUrl(baseUrl, created.token) : ''

  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Subheading level={2}>Invite someone</Subheading>
          <p className="mt-1 max-w-xl text-sm/6 text-zinc-500">
            Choose what they can do, then send them a link on WhatsApp. They create an account (or
            sign in) and join straight away.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>Invite someone</Button>
      </div>

      {invites.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          <Subheading level={3}>Pending invitations</Subheading>
          <div className="overflow-x-auto surface-card">
            <table className="w-full text-left text-sm/6">
              <thead className="border-b border-zinc-950/10 text-zinc-500 dark:border-white/10 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Invited as</th>
                  <th className="px-4 py-2.5 font-medium">Sent</th>
                  <th className="px-4 py-2.5 font-medium">Expires</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-950/5 dark:divide-white/10">
                {invites.map((invite) => {
                  const expired = invite.status === 'EXPIRED'
                  const who = [invite.note, invite.phone, invite.email].filter(Boolean).join(' · ')

                  return (
                    <tr key={invite.id}>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{ROLE_LABELS[invite.role]}</div>
                        {who ? <div className="text-xs/5 text-zinc-500">{who}</div> : null}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <LocalTime value={invite.createdAt} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {expired ? (
                          <span className="text-amber-700">Expired</span>
                        ) : (
                          <LocalTime value={invite.expiresAt} />
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap justify-end gap-1">
                          {expired ? (
                            <Button
                              plain
                              disabled={pending}
                              onClick={() => run(() => regenerateInvitation(invite.id))}
                            >
                              New link
                            </Button>
                          ) : (
                            <>
                              <Button plain onClick={() => copy(inviteUrl(baseUrl, invite.token))}>
                                Copy link
                              </Button>
                              <WhatsAppButton invite={invite} ctx={ctx} label="Resend on WhatsApp" />
                            </>
                          )}
                          <Button
                            plain
                            disabled={pending}
                            onClick={() => {
                              if (window.confirm('Revoke this invitation? The link will stop working.')) {
                                run(() => revokeInvitation(invite.id))
                              }
                            }}
                          >
                            Revoke
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Dialog open={open} onClose={close} size="lg">
        {created ? (
          <>
            <DialogTitle>Invitation ready</DialogTitle>
            <DialogDescription>
              Send this link to the person you want to join as {ROLE_LABELS[created.role]}. It works
              once and expires in a week.
            </DialogDescription>
            <DialogBody className="grid grid-cols-1 gap-4">
              <div className="surface-inset p-3 text-sm/6 break-all select-all">
                {link}
              </div>
              <WhatsAppButton invite={created} ctx={ctx} big />
              <Button outline className="w-full" onClick={() => copy(link)}>
                Copy link
              </Button>
              {created.phone ? null : (
                <p className="text-xs/5 text-zinc-500">
                  No phone number was given, so WhatsApp will let you pick who to send it to.
                </p>
              )}
            </DialogBody>
            <DialogActions>
              <Button plain onClick={close}>
                Done
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Invite someone</DialogTitle>
            <DialogDescription>
              They will get a link to join {companyName} with the role you choose.
            </DialogDescription>
            <DialogBody>
              <FieldGroup>
                <Field>
                  <Label>What can they do?</Label>
                  <Select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                    {ROLES.map((value) => (
                      <option key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                  <Description>{ROLE_BLURBS[role]}</Description>
                </Field>
                <Field>
                  <Label>Their name</Label>
                  <Input value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} />
                  <Description>Optional. Only so you can tell invitations apart.</Description>
                </Field>
                <Field>
                  <Label>WhatsApp number</Label>
                  <Input
                    type="tel"
                    value={phone}
                    placeholder="98765 43210"
                    onChange={(event) => setPhone(event.target.value)}
                  />
                  <Description>Optional. Used only to open their chat on WhatsApp.</Description>
                </Field>
                <Field>
                  <Label>Email</Label>
                  <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                  <Description>Optional. They can still join with any email.</Description>
                </Field>
                {error ? <ErrorMessage>{error}</ErrorMessage> : null}
              </FieldGroup>
            </DialogBody>
            <DialogActions>
              <Button plain onClick={close}>
                Cancel
              </Button>
              <Button disabled={pending} onClick={create}>
                {pending ? 'Creating…' : 'Create invite link'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </section>
  )
}
