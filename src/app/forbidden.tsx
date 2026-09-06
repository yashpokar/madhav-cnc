import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'

export default function Forbidden() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <div className="grid max-w-sm grid-cols-1 gap-3 text-center">
        <Heading>Not permitted</Heading>
        <Text>
          Your role does not have access to this page. Ask an administrator if
          you believe you should.
        </Text>
      </div>
      <Button href="/">Back to dashboard</Button>
    </main>
  )
}
