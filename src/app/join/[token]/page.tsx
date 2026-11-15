import type { Metadata } from 'next'
import { AuthLayout } from '@/components/catalyst/auth-layout'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Strong, Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignOutButton } from '@/components/sign-out-button'
import { describeUnusable, emailDiffers, firstName } from '@/lib/invite-rules'
import { ROLE_LABELS } from '@/lib/permissions'
import { getPublicInvitation } from '@/lib/services/invitations'
import { getBaseUser } from '@/lib/session'
import { AcceptPanel } from './accept-panel'

// Link previews get copied into chats: the company name only, and never indexed.
export async function generateMetadata({ params }: PageProps<'/join/[token]'>): Promise<Metadata> {
  const { token } = await params
  const invitation = await getPublicInvitation(token)
  const title = invitation?.status === 'PENDING' ? `Join ${invitation.companyName} on Prodlys` : 'Join on Prodlys'

  return {
    title: { absolute: title },
    robots: { index: false, follow: false },
    openGraph: { title },
    twitter: { card: 'summary', title },
  }
}

function formatExpiry(date: Date) {
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function JoinPage({ params, searchParams }: PageProps<'/join/[token]'>) {
  const { token } = await params
  const query = await searchParams
  const [invitation, user] = await Promise.all([getPublicInvitation(token), getBaseUser()])

  // Unknown, revoked and expired links all read the same: nothing to learn from them.
  if (!invitation || (invitation.status !== 'PENDING' && invitation.status !== 'ACCEPTED')) {
    return (
      <AuthLayout>
        <div className="grid w-full max-w-sm grid-cols-1 gap-6">
          <BrandMark className="lg:hidden" />
          <Heading>Invitation unavailable</Heading>
          <Text>{describeUnusable('EXPIRED')}</Text>
          <Button href={user ? '/' : '/sign-in'} outline className="w-full">
            {user ? 'Go to your dashboard' : 'Sign in'}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  if (invitation.status === 'ACCEPTED') {
    return (
      <AuthLayout>
        <div className="grid w-full max-w-sm grid-cols-1 gap-6">
          <BrandMark className="lg:hidden" />
          <Heading>Invitation already used</Heading>
          <Text>{describeUnusable('ACCEPTED')}</Text>
          <Button href={user ? '/' : '/sign-in'} outline className="w-full">
            {user ? 'Go to your dashboard' : 'Sign in'}
          </Button>
        </div>
      </AuthLayout>
    )
  }

  const auto = query.auto === '1'

  return (
    <AuthLayout>
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <BrandMark className="lg:hidden" />
        <div className="grid grid-cols-1 gap-2">
          <Heading>Join {invitation.companyName}</Heading>
          <Text>
            {invitation.inviterName ? (
              <>
                <Strong>{firstName(invitation.inviterName)}</Strong> invited you to join{' '}
              </>
            ) : (
              <>You are invited to join </>
            )}
            <Strong>{invitation.companyName}</Strong> on Prodlys as{' '}
            <Strong>{ROLE_LABELS[invitation.role]}</Strong>.
          </Text>
          <Text>This invitation works once and expires on {formatExpiry(invitation.expiresAt)}.</Text>
        </div>

        {user ? (
          <div className="grid grid-cols-1 gap-4">
            <Text>
              Signed in as <Strong>{user.email}</Strong>.
            </Text>
            {emailDiffers(invitation.emailHint, user.email) ? (
              <Text>
                This invitation was addressed to a different email address. You can still accept it
                with this account.
              </Text>
            ) : null}
            <AcceptPanel token={token} companyName={invitation.companyName} auto={auto} />
            <SignOutButton className="w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <Button href={`/join/${token}/start?to=sign-up`} className="w-full">
              Create account
            </Button>
            <Button href={`/join/${token}/start?to=sign-in`} outline className="w-full">
              Sign in
            </Button>
            <Text>Use Create account if you are new, or Sign in if you already have one.</Text>
          </div>
        )}
      </div>
    </AuthLayout>
  )
}
