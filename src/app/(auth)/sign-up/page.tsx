import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { joinPath, pendingInviteToken } from '@/lib/invite-cookie'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = {
  title: 'Register',
  robots: { index: true, follow: true },
}

export default async function SignUpPage({ searchParams }: PageProps<'/sign-up'>) {
  const params = await searchParams
  const inviteToken = await pendingInviteToken(params.invite)
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <BrandMark className="lg:hidden" />
        <Heading>Create your account</Heading>
        <Text>
          {inviteToken
            ? 'Register to accept your invitation and join the team.'
            : 'Register, then create your own company or wait to be added to an existing one by its administrator.'}
        </Text>
      </div>
      <SignUpForm googleEnabled={googleEnabled} inviteToken={inviteToken} afterGoogle={inviteToken ? joinPath(inviteToken) : '/onboarding'} />
    </div>
  )
}
