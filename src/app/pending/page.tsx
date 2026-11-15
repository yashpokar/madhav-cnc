import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/catalyst/auth-layout'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Strong, Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignOutButton } from '@/components/sign-out-button'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'

export const metadata: Metadata = {
  title: 'Waiting to be added to a company',
}

export default async function PendingPage() {
  const user = await getCurrentUser()

  if (user?.isActive) {
    redirect('/')
  }

  // Someone who has never been activated can still set up a company of their own.
  const account = user
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { activatedAt: true } })
    : null
  const deactivated = Boolean(account?.activatedAt)

  return (
    <AuthLayout>
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <BrandMark className="lg:hidden" />
        {deactivated ? (
          <>
            <Heading>Account deactivated</Heading>
            <Text>
              Your account has been deactivated. Contact an administrator if you think this is a
              mistake.
            </Text>
          </>
        ) : (
          <>
            <Heading>Waiting to be added to a company</Heading>
            <Text>
              Ask the administrator of the company you are joining to add your email under Team,
              then refresh this page. You will be let in as soon as they do.
            </Text>
          </>
        )}
        {user ? (
          <Text>
            Registered as <Strong>{user.email}</Strong>.
          </Text>
        ) : null}
        {user && !deactivated ? (
          <Button href="/onboarding" outline className="w-full">
            Create your own company instead
          </Button>
        ) : null}
        <SignOutButton className="w-full" />
      </div>
    </AuthLayout>
  )
}
