import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { joinPath, pendingInviteToken } from '@/lib/invite-cookie'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: true, follow: true },
}

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams
  const nextParam = params.next
  const inviteToken = await pendingInviteToken(params.invite)
  // Someone arriving from an invitation finishes joining instead of landing on the dashboard.
  const next = inviteToken
    ? joinPath(inviteToken)
    : typeof nextParam === 'string' && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/'

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <BrandMark className="lg:hidden" />
        <Heading>Sign in to Prodlys</Heading>
        <Text>{inviteToken ? 'Sign in to accept your invitation.' : 'Pick up where you left off.'}</Text>
      </div>
      <SignInForm next={next} inviteToken={inviteToken} googleEnabled={googleEnabled} />
    </div>
  )
}
