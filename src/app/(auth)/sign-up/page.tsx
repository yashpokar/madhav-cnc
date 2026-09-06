import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { BrandMark } from '@/components/brand-mark'
import { SignUpForm } from './sign-up-form'

export const metadata: Metadata = {
  title: 'Register',
}

export default function SignUpPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  )

  return (
    <div className="grid w-full max-w-sm grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <BrandMark />
        <Heading>Create your account</Heading>
        <Text>
          New accounts stay inactive until an administrator approves them.
        </Text>
      </div>
      <SignUpForm googleEnabled={googleEnabled} />
    </div>
  )
}
