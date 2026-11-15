'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/20/solid'
import { Button } from '@/components/catalyst/button'
import { Description, ErrorMessage, Field, Label } from '@/components/catalyst/fieldset'
import { Input } from '@/components/catalyst/input'
import { Subheading } from '@/components/catalyst/heading'
import { FormBanner } from '@/components/form-banner'
import { useTour } from '@/components/tour/tour-provider'
import { authClient } from '@/lib/auth-client'
import { notify } from '@/lib/toast'
import { setTheme } from '@/lib/theme'

const MIN_PASSWORD = 8

const CARD =
  'grid gap-4 surface-card p-5'

export function AccountForms({
  name,
  email,
  hasPassword,
}: {
  name: string
  email: string
  hasPassword: boolean
}) {
  return (
    <div className="grid gap-8">
      <ProfileForm name={name} email={email} />
      <PasswordForm hasPassword={hasPassword} />
      <Preferences />
    </div>
  )
}

function ProfileForm({ name, email }: { name: string; email: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const trimmed = value.trim()

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!trimmed) {
      setError('Enter your name')
      return
    }

    startTransition(async () => {
      const result = await authClient.updateUser({ name: trimmed })

      if (result.error) {
        setError(result.error.message ?? 'Could not save your name')
        return
      }

      notify.success('Profile saved')
      router.refresh()
    })
  }

  return (
    <form onSubmit={save} className={CARD} aria-labelledby="profile-heading">
      <Subheading id="profile-heading" level={2}>
        Profile
      </Subheading>
      <Field>
        <Label>Name</Label>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="name"
          invalid={Boolean(error)}
        />
        {error ? <ErrorMessage>{error}</ErrorMessage> : null}
      </Field>
      <Field>
        <Label>Email</Label>
        <Input value={email} readOnly disabled />
        <Description>Your email is your sign-in and cannot be changed here.</Description>
      </Field>
      <div>
        <Button type="submit" disabled={pending || trimmed === name || !trimmed}>
          {pending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  )
}

function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!hasPassword) {
    return (
      <section className={CARD} aria-labelledby="password-heading">
        <Subheading id="password-heading" level={2}>
          Password
        </Subheading>
        <p className="text-sm/6 text-zinc-600 dark:text-zinc-400">
          You sign in with Google, so there is no password to manage here.
        </p>
      </section>
    )
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (next.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for the new password`)
      return
    }

    if (next !== confirm) {
      setError('The new passwords do not match')
      return
    }

    startTransition(async () => {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      })

      if (result.error) {
        setError(result.error.message ?? 'Could not change the password')
        return
      }

      setCurrent('')
      setNext('')
      setConfirm('')
      notify.success('Password changed. Other devices were signed out.')
    })
  }

  return (
    <form onSubmit={save} className={CARD} aria-labelledby="password-heading">
      <Subheading id="password-heading" level={2}>
        Password
      </Subheading>
      {error ? (
        <div role="alert">
          <FormBanner tone="error">{error}</FormBanner>
        </div>
      ) : null}
      <Field>
        <Label>Current password</Label>
        <Input
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <Label>New password</Label>
          <Input
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
          />
          <Description>At least {MIN_PASSWORD} characters.</Description>
        </Field>
        <Field>
          <Label>Confirm new password</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <div>
        <Button type="submit" disabled={pending || !current || !next || !confirm}>
          {pending ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  )
}

function Preferences() {
  const { start } = useTour()

  return (
    <section className={CARD} aria-labelledby="prefs-heading">
      <Subheading id="prefs-heading" level={2}>
        Preferences
      </Subheading>
      <div className="grid gap-2">
        <span className="text-sm/6 font-medium text-zinc-950 dark:text-white">Appearance</span>
        <div className="flex flex-wrap gap-2">
          <Button outline type="button" onClick={() => setTheme('light')}>
            <SunIcon />
            Light
          </Button>
          <Button outline type="button" onClick={() => setTheme('dark')}>
            <MoonIcon />
            Dark
          </Button>
          <Button outline type="button" onClick={() => setTheme('system')}>
            <ComputerDesktopIcon />
            Match device
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <span className="text-sm/6 font-medium text-zinc-950 dark:text-white">Product tour</span>
        <div>
          <Button outline type="button" onClick={start}>
            Take the tour again
          </Button>
        </div>
      </div>
    </section>
  )
}
