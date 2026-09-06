import type { Metadata } from 'next'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { createItem } from '@/lib/actions/items'
import { listMaterials } from '@/lib/queries/items'
import { requireCapability } from '@/lib/session'
import { ItemForm } from '../item-form'

export const metadata: Metadata = {
  title: 'Add item',
}

export default async function NewItemPage() {
  await requireCapability('item:create')
  const materials = await listMaterials()

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>Add item</Heading>
        <Text>A code is assigned automatically when you save.</Text>
      </div>

      <ItemForm
        action={createItem}
        submitLabel="Save item"
        materials={materials}
        values={{
          name: '',
          description: null,
          type: 'MATERIAL',
          materialId: null,
          unit: 'SQFT',
          rate: 0,
          purchaseRate: null,
          brand: null,
          shade: null,
          dimensionUnit: 'MM',
          thickness: null,
          length: null,
          width: null,
          hsnCode: null,
          taxRatePercent: 18,
          isActive: true,
          notes: null,
        }}
      />
    </div>
  )
}
