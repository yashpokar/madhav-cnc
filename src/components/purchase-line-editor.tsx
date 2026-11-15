'use client'

import { PlusIcon, TrashIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { Input } from '@/components/catalyst/input'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import { UNIT_LABELS, UNIT_SHORT } from '@/lib/labels'
import { money as currency } from '@/lib/format'
import { billTotals } from '@/lib/purchase-rules'
import type { PurchasableOptions } from '@/lib/queries/purchases'
import { UnitOfMeasure } from '@/generated/prisma/enums'
import { emptyPurchaseLine, type PurchaseLine } from '@/lib/purchase-lines'

export type { PurchaseLine }

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

type Choice = {
  id: string
  label: string
  hint: string
}

const FREE_TEXT: Choice = { id: '', label: 'Free text (no item or material)', hint: '' }

/** What the line is for: a catalogue item, a material, or just typed text. */
export function PurchaseLineEditor({
  lines,
  onChange,
  options,
  withHsn = true,
  withDiscount = true,
  errorFor,
}: {
  lines: PurchaseLine[]
  onChange: (lines: PurchaseLine[]) => void
  options: PurchasableOptions
  withHsn?: boolean
  withDiscount?: boolean
  errorFor?: (index: number) => string | undefined
}) {
  const choices: Choice[] = [
    FREE_TEXT,
    ...options.items.map((item) => ({
      id: `item:${item.id}`,
      label: item.name,
      hint: `Item ${item.code}`,
    })),
    ...options.materials.map((material) => ({
      id: `material:${material.id}`,
      label: material.name,
      hint: 'Material',
    })),
  ]

  function update(index: number, patch: Partial<PurchaseLine>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  function choose(index: number, choice: Choice | null) {
    if (!choice || !choice.id) {
      update(index, { itemId: null, materialId: null })
      return
    }

    const [kind, id] = choice.id.split(':')

    if (kind === 'item') {
      const item = options.items.find((row) => row.id === id)

      if (!item) return

      update(index, {
        itemId: item.id,
        materialId: null,
        description: item.name,
        hsnCode: item.hsnCode ?? '',
        unit: item.unit,
        rate: String(item.rate),
        taxRatePercent: String(item.taxRatePercent),
      })
      return
    }

    const material = options.materials.find((row) => row.id === id)

    if (!material) return

    update(index, { itemId: null, materialId: material.id, description: material.name })
  }

  function selectedChoice(line: PurchaseLine): Choice {
    if (line.itemId) return choices.find((c) => c.id === `item:${line.itemId}`) ?? FREE_TEXT
    if (line.materialId) {
      return choices.find((c) => c.id === `material:${line.materialId}`) ?? FREE_TEXT
    }
    return FREE_TEXT
  }

  const computed = billTotals(
    lines.map((line) => ({
      qty: num(line.qty),
      rate: num(line.rate),
      discount: num(line.discount),
      taxRatePercent: num(line.taxRatePercent),
    })),
    false,
  ).lines

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="overflow-x-auto">
        <table className="stack-table w-full min-w-[64rem] text-left text-sm/6">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="w-8 pb-2 font-medium">#</th>
              <th className="w-56 pb-2 pr-3 font-medium">Item or material</th>
              <th className="pb-2 pr-3 font-medium">Description</th>
              {withHsn ? <th className="w-24 pb-2 pr-3 font-medium">HSN</th> : null}
              <th className="w-24 pb-2 pr-3 text-right font-medium">Qty</th>
              <th className="w-32 pb-2 pr-3 font-medium">Unit</th>
              <th className="w-28 pb-2 pr-3 text-right font-medium">Rate</th>
              {withDiscount ? (
                <th className="w-24 pb-2 pr-3 text-right font-medium">Discount</th>
              ) : null}
              <th className="w-20 pb-2 pr-3 text-right font-medium">GST %</th>
              <th className="w-28 pb-2 text-right font-medium">Amount</th>
              <th className="w-10 pb-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.key} className="align-top">
                <td data-label="#" className="py-2 pr-2 pt-4 tabular-nums text-zinc-500 dark:text-zinc-400">
                  {index + 1}
                </td>
                <td data-label="Item or material" className="py-2 pr-3">
                  <Combobox<Choice>
                    aria-label={`Item or material for line ${index + 1}`}
                    options={choices}
                    value={selectedChoice(line)}
                    onChange={(choice) => choose(index, choice)}
                    displayValue={(choice) => (choice?.id ? choice.label : '')}
                    placeholder="Free text"
                    filter={(choice, search) =>
                      !choice.id ||
                      `${choice.label} ${choice.hint}`.toLowerCase().includes(search.toLowerCase())
                    }
                  >
                    {(choice) => (
                      <ComboboxOption value={choice}>
                        <ComboboxLabel>{choice.label}</ComboboxLabel>
                        {choice.hint ? <ComboboxDescription>{choice.hint}</ComboboxDescription> : null}
                      </ComboboxOption>
                    )}
                  </Combobox>
                </td>
                <td data-label="Description" className="py-2 pr-3">
                  <Input
                    aria-label={`Description for line ${index + 1}`}
                    value={line.description}
                    onChange={(event) => update(index, { description: event.target.value })}
                  />
                  {errorFor?.(index) ? (
                    <p className="mt-1 text-xs/5 text-red-600">{errorFor(index)}</p>
                  ) : null}
                </td>
                {withHsn ? (
                  <td data-label="HSN" data-half className="py-2 pr-3">
                    <Input
                      aria-label={`HSN for line ${index + 1}`}
                      value={line.hsnCode}
                      onChange={(event) => update(index, { hsnCode: event.target.value })}
                    />
                  </td>
                ) : null}
                <td data-label="Qty" data-half className="py-2 pr-3">
                  <Input
                    aria-label={`Quantity for line ${index + 1}`}
                    type="number"
                    step="0.001"
                    min={0}
                    value={line.qty}
                    onChange={(event) => update(index, { qty: event.target.value })}
                  />
                </td>
                <td data-label="Unit" data-half className="py-2 pr-3">
                  <Listbox
                    aria-label={`Unit for line ${index + 1}`}
                    value={line.unit}
                    onChange={(unit: UnitOfMeasure) => update(index, { unit })}
                  >
                    {Object.values(UnitOfMeasure).map((unit) => (
                      <ListboxOption key={unit} value={unit}>
                        <ListboxLabel>{UNIT_LABELS[unit]}</ListboxLabel>
                      </ListboxOption>
                    ))}
                  </Listbox>
                </td>
                <td data-label="Rate" data-half className="py-2 pr-3">
                  <Input
                    aria-label={`Rate for line ${index + 1}`}
                    type="number"
                    step="0.01"
                    min={0}
                    value={line.rate}
                    onChange={(event) => update(index, { rate: event.target.value })}
                  />
                </td>
                {withDiscount ? (
                  <td data-label="Discount" data-half className="py-2 pr-3">
                    <Input
                      aria-label={`Discount for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.discount}
                      onChange={(event) => update(index, { discount: event.target.value })}
                    />
                  </td>
                ) : null}
                <td data-label="GST %" data-half className="py-2 pr-3">
                  <Input
                    aria-label={`GST for line ${index + 1}`}
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={line.taxRatePercent}
                    onChange={(event) => update(index, { taxRatePercent: event.target.value })}
                  />
                </td>
                <td data-label="Amount" className="py-2 pt-4 text-right tabular-nums">
                  {currency.format(computed[index]?.taxable ?? 0)}
                  <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                    {UNIT_SHORT[line.unit]}
                  </div>
                </td>
                <td className="py-2">
                  <Button
                    type="button"
                    plain
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  >
                    <TrashIcon />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Button type="button" outline onClick={() => onChange([...lines, emptyPurchaseLine()])}>
          <PlusIcon />
          Add line
        </Button>
      </div>
    </div>
  )
}
