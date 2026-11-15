'use client'

import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'

// Server action ids change on every deploy, so a tab left open across a
// deploy fails with this message. Production builds may strip the message
// (leaving only a digest), so an unknown error is treated generically.
function isStaleDeployment(error: Error) {
  const message = error?.message ?? ''
  return (
    message.includes('Failed to find Server Action') ||
    message.includes('older or newer deployment')
  )
}

// Nearest boundary for everything under (app), including server actions that
// throw while a form is submitting.
export default function AppError({
  error,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const stale = isStaleDeployment(error)

  return (
    <main className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 p-6">
      <div className="grid max-w-sm grid-cols-1 gap-3 text-center">
        <Heading>{stale ? 'App updated' : 'Something went wrong'}</Heading>
        <Text>
          {stale
            ? 'The app was updated while this tab was open. Reload to continue.'
            : 'We could not complete that. Your last change may not have been saved. Reload and try again, or go back.'}
        </Text>
        {!stale && error.digest ? (
          <p className="text-xs text-zinc-500">Error reference: {error.digest}</p>
        ) : null}
      </div>
      <div className="flex gap-3">
        {stale ? null : (
          <Button plain onClick={() => window.history.back()}>
            Back
          </Button>
        )}
        <Button
          {...(stale ? { color: 'dark/zinc' as const } : { outline: true as const })}
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    </main>
  )
}
