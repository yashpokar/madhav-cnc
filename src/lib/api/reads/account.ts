import { pickPublicBaseUrl } from '@/lib/public-url'
import { inviteMessage, inviteUrl } from '@/lib/invite-rules'
import { whatsappLink } from '@/lib/whatsapp'
import { getCompanySetting } from '@/lib/queries/company'
import { stamp } from '@/lib/api/reads/format'
import type { ApiUser } from '@/lib/api/auth'
import type { InvitationRow } from '@/lib/services/invitations'

/** The origin invitation links are built on: PUBLIC_BASE_URL, else the address the request came to. */
function publicOrigin(request: Request): string {
  return pickPublicBaseUrl({
    env: process.env.PUBLIC_BASE_URL,
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    proto: request.headers.get('x-forwarded-proto'),
    production: process.env.NODE_ENV === 'production',
  })
}

/** Loads what every invitation of this company needs to be shown: the message and link to send. */
export async function invitationOutFor(request: Request, user: ApiUser) {
  const company = await getCompanySetting()
  const base = publicOrigin(request)
  const companyName = company?.companyName ?? 'your company'

  return (row: Omit<InvitationRow, 'status'> & { status: string }) => {
    const url = inviteUrl(base, row.token)
    const text = inviteMessage({ inviter: user.name, company: companyName, role: row.role, url })

    return {
      id: row.id,
      role: row.role,
      email: row.email,
      phone: row.phone,
      note: row.note,
      status: row.status,
      expiresAt: stamp(row.expiresAt),
      createdAt: stamp(row.createdAt),
      token: row.token,
      url,
      whatsappText: text,
      whatsappLink: whatsappLink(row.phone, text),
    }
  }
}
