import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/catalyst/auth-layout'
import { Heading } from '@/components/catalyst/heading'
import { Strong, Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignOutButton } from '@/components/sign-out-button'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Awaiting approval',
}

export default async function PendingPage() {
  const user = await getCurrentUser()

  if (user?.isActive) {
    redirect('/')
  }

  return (
    <AuthLayout>
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <BrandMark />
        <Heading>Awaiting approval</Heading>
        <Text>
          Your account has been created but an administrator has not activated it
          yet. You will be able to sign in once it is approved and a role is
          assigned.
        </Text>
        {user ? (
          <Text>
            Registered as <Strong>{user.email}</Strong>.
          </Text>
        ) : null}
        <SignOutButton className="w-full" />
      </div>
    </AuthLayout>
  )
}
