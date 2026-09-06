import type { Metadata } from 'next'
import { Button } from '@/components/catalyst/button'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { listAllMaterials } from '@/lib/queries/materials'
import { requireCapability } from '@/lib/session'
import { MaterialManager } from './material-manager'

export const metadata: Metadata = {
  title: 'Materials',
}

export default async function MaterialsPage() {
  await requireCapability('item:update')
  const materials = await listAllMaterials()

  return (
    <div className="grid grid-cols-1 gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid grid-cols-1 gap-2">
          <Heading>Materials</Heading>
          <Text>
            How items are grouped: ACP, HDHMR, MDF, Acrylic and the rest. The
            order here is the order they appear when picking a material.
          </Text>
        </div>
        <Button outline href="/items">
          Back to items
        </Button>
      </div>

      <MaterialManager materials={materials} />
    </div>
  )
}
