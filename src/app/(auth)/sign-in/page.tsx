import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = {
  title: 'Sign in',
}

export default async function SignInPage({ searchParams }: PageProps<'/sign-in'>) {
  const params = await searchParams
  const nextParam = params.next
  const next =
    typeof nextParam === 'string' && nextParam.startsWith('/') ? nextParam : '/'

  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <BrandMark />
        <Heading>Sign in to Madhav CNC</Heading>
        <Text>Order management for the shop floor and the office.</Text>
      </div>
      <SignInForm next={next} googleEnabled={googleEnabled} />
    </div>
  )
}
