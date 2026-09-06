'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { DropdownItem, DropdownLabel } from '@/components/catalyst/dropdown'
import { authClient } from '@/lib/auth-client'

function useSignOut() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    await authClient.signOut()
    router.push('/sign-in')
    router.refresh()
  }

  return { pending, signOut }
}

export function SignOutButton({ className }: { className?: string }) {
  const { pending, signOut } = useSignOut()

  return (
    <Button outline className={className} disabled={pending} onClick={signOut}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  )
}

export function SignOutDropdownItem() {
  const { signOut } = useSignOut()

  return (
    <DropdownItem onClick={signOut}>
      <DropdownLabel>Sign out</DropdownLabel>
    </DropdownItem>
  )
}
