import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Heading } from '@/components/catalyst/heading'
import { Text } from '@/components/catalyst/text'
import { updateItem } from '@/lib/actions/items'
import { getItem, listItemCategories } from '@/lib/queries/items'
import { requireCapability } from '@/lib/session'
import { ItemForm } from '../item-form'

export const metadata: Metadata = {
  title: 'Edit item',
}

export default async function EditItemPage({ params }: PageProps<'/items/[id]'>) {
  await requireCapability('item:update')
  const { id } = await params

  const [item, categories] = await Promise.all([getItem(id), listItemCategories()])

  if (!item) {
    notFound()
  }

  const action = updateItem.bind(null, item.id)

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-8">
      <div className="grid grid-cols-1 gap-2">
        <Heading>{item.name}</Heading>
        <Text>
          {item.code}
          {item.createdBy ? ` · added by ${item.createdBy.name}` : ''}
        </Text>
      </div>

      <ItemForm
        action={action}
        submitLabel="Save changes"
        categories={categories}
        values={{
          name: item.name,
          description: item.description,
          type: item.type,
          categoryId: item.categoryId,
          unit: item.unit,
          rate: item.rate,
          purchaseRate: item.purchaseRate,
          brand: item.brand,
          shade: item.shade,
          dimensionUnit: item.dimensionUnit,
          thickness: item.thickness,
          length: item.length,
          width: item.width,
          hsnCode: item.hsnCode,
          taxRatePercent: item.taxRatePercent,
          isActive: item.isActive,
          notes: item.notes,
        }}
      />
    </div>
  )
}
