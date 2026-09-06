'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import {
  ErrorMessage,
  Field,
  FieldGroup,
  Label,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Strong, Text, TextLink } from '@/components/catalyst/text'
import { GoogleButton } from '@/components/google-button'
import { authClient } from '@/lib/auth-client'

export function SignInForm({
  next,
  googleEnabled,
}: {
  next: string
  googleEnabled: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    })

    if (signInError) {
      if (signInError.code === 'ACCOUNT_NOT_ACTIVATED') {
        router.push('/pending')
        return
      }

      setError(signInError.message ?? 'Unable to sign in')
      setPending(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <FieldGroup>
        <Field>
          <Label>Email</Label>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            invalid={Boolean(error)}
          />
        </Field>
        <Field>
          <Label>Password</Label>
          <Input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(error)}
          />
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </Field>
      </FieldGroup>

      <div className="grid grid-cols-1 gap-3">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
        {googleEnabled ? (
          <>
            <GoogleDivider />
            <GoogleButton callbackURL={next} />
          </>
        ) : null}
      </div>

      <Text>
        Need an account? <TextLink href="/sign-up">
          <Strong>Register</Strong>
        </TextLink>
      </Text>
    </form>
  )
}

function GoogleDivider() {
  return (
    <div className="relative py-1">
      <div className="absolute inset-0 flex items-center" aria-hidden="true">
        <div className="w-full border-t border-zinc-950/10 dark:border-white/10" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-white px-2 text-xs/5 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
          or
        </span>
      </div>
    </div>
  )
}
