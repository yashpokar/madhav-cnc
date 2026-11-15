import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthLayout } from '@/components/catalyst/auth-layout'
import { Heading } from '@/components/catalyst/heading'
import { Strong, Text, TextLink } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignOutButton } from '@/components/sign-out-button'
import { prisma } from '@/lib/prisma'
import { getBaseUser } from '@/lib/session'
import { canCreateAnotherCompany } from '@/lib/team-rules'
import { OnboardingForm } from './onboarding-form'

export const metadata: Metadata = {
  title: 'Create your company',
}

export default async function OnboardingPage() {
  const user = await getBaseUser()

  if (!user) redirect('/sign-in')

  // Platform administrators and people who already belong to a company never see this.
  if (user.isSuperAdmin) redirect('/')

  const [memberships, created, account] = await Promise.all([
    prisma.userCompany.count({ where: { userId: user.id } }),
    prisma.companySetting.count({ where: { createdById: user.id } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { activatedAt: true } }),
  ])

  if (memberships > 0 && user.isActive) redirect('/')

  // Deactivated by an administrator: nothing to set up.
  if (!user.isActive && account?.activatedAt) redirect('/pending')

  return (
    <AuthLayout>
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <BrandMark />
        <Heading>Create your company</Heading>
        <Text>
          Welcome, <Strong>{user.name}</Strong>. Set up your own company to start. You will be its
          administrator, and nobody else can see its details unless you add them from Team.
        </Text>
        {canCreateAnotherCompany(created) ? (
          <OnboardingForm />
        ) : (
          <Text>You have reached the limit of companies you can create. Ask an administrator.</Text>
        )}
        <Text>
          Expecting to join a colleague&apos;s company instead? Ask their administrator to add{' '}
          <Strong>{user.email}</Strong>, then{' '}
          <TextLink href="/pending">
            <Strong>wait here</Strong>
          </TextLink>
          .
        </Text>
        <SignOutButton className="w-full" />
      </div>
    </AuthLayout>
  )
}
