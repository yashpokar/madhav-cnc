import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listAllStages } from '@/lib/queries/stages'
import { requireCapability } from '@/lib/session'
import { StageManager } from './stage-manager'

export const metadata: Metadata = {
  title: 'Production stages',
}

export default async function StagesPage() {
  await requireCapability('settings:update')
  const stages = await listAllStages()

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Production stages</Heading>
          <Text>
            The columns on the production board, in order. New orders get a
            task for every active stage. Completing a stage can move the order
            forward automatically.
          </Text>
        </div>
        <Button outline href="/production">
          Back to board
        </Button>
      </div>

      <StageManager stages={stages} />
    </div>
  )
}
