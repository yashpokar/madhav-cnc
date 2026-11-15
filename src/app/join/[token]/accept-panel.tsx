'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/catalyst/button'
import { Text } from '@/components/catalyst/text'
import { FormBanner } from '@/components/form-banner'
import { acceptInvitation } from '@/lib/actions/invitations'
import { notify } from '@/lib/toast'

/**
 * The signed-in side of the join page. With `auto` (arriving straight from
 * sign-up or sign-in) it accepts on its own; otherwise the person taps the button.
 */
export function AcceptPanel({
  token,
  companyName,
  auto,
}: {
  token: string
  companyName: string
  auto: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  async function accept() {
    setPending(true)
    setError(null)

    const result = await acceptInvitation(token)

    if (!result.ok) {
      setError(result.error)
      setPending(false)
      return
    }

    notify.success(result.message)
    router.push('/')
    router.refresh()
  }

  useEffect(() => {
    if (auto && !started.current) {
      started.current = true
      // Accepting talks to the server, so it runs after mount rather than in render.
      void accept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto])

  return (
    <div className="grid grid-cols-1 gap-3">
      {error ? <FormBanner tone="error">{error}</FormBanner> : null}
      {auto && pending && !error ? <Text>Joining {companyName}…</Text> : null}
      <Button className="w-full" disabled={pending} onClick={accept}>
        {pending ? 'Joining…' : 'Accept invitation'}
      </Button>
    </div>
  )
}
