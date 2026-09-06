'use client'

import { useState } from 'react'
import { Button } from '@/components/catalyst/button'
import {
  Description,
  ErrorMessage,
  Field,
  FieldGroup,
  Label,
} from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Heading } from '@/components/catalyst/heading'
import { Strong, Text, TextLink } from '@/components/catalyst/text'
import { GoogleButton } from '@/components/google-button'
import { authClient } from '@/lib/auth-client'

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (submitted) {
    return (
      <div className="grid w-full max-w-sm grid-cols-1 gap-6">
        <Heading>Registration received</Heading>
        <Text>
          Your account has been created but is not active yet. An administrator
          needs to approve it and assign your role before you can sign in.
        </Text>
        <Text>
          We have recorded <Strong>{email}</Strong>. Ask an administrator to
          activate it, then sign in.
        </Text>
        <Button href="/sign-in" className="w-full">
          Back to sign in
        </Button>
      </div>
    )
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
    })

    if (signUpError) {
      setError(signUpError.message ?? 'Unable to register')
      setPending(false)
      return
    }

    setSubmitted(true)
    setPending(false)
  }

  return (
    <form onSubmit={onSubmit} className="grid w-full max-w-sm grid-cols-1 gap-8">
      <FieldGroup>
        <Field>
          <Label>Full name</Label>
          <Input
            name="name"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
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
          <Label>Phone</Label>
          <Input
            type="tel"
            name="phone"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Description>Optional.</Description>
        </Field>
        <Field>
          <Label>Password</Label>
          <Input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={Boolean(error)}
          />
          <Description>At least 8 characters.</Description>
          {error ? <ErrorMessage>{error}</ErrorMessage> : null}
        </Field>
      </FieldGroup>

      <div className="grid grid-cols-1 gap-3">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
        {googleEnabled ? (
          <GoogleButton label="Register with Google" callbackURL="/pending" />
        ) : null}
      </div>

      <Text>
        Already registered?{' '}
        <TextLink href="/sign-in">
          <Strong>Sign in</Strong>
        </TextLink>
      </Text>
    </form>
  )
}
