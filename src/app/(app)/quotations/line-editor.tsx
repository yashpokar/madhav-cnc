'use client'

import { TrashIcon, PlusIcon } from '@heroicons/react/16/solid'
import { Button } from '@/components/catalyst/button'
import { Input } from '@/components/catalyst/input'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/catalyst/listbox'
import {
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
} from '@/components/catalyst/combobox'
import { DIMENSION_UNIT_SHORT, UNIT_SHORT } from '@/lib/labels'
import { derivedQuantity, lineTotals } from '@/lib/pricing'
import type { ItemOption } from '@/lib/queries/quotations'
import { DimensionUnit, UnitOfMeasure } from '@/generated/prisma/enums'

export type EditorLine = {
  key: string
  itemId: string | null
  description: string
  unit: UnitOfMeasure
  dimensionUnit: DimensionUnit | null
  length: string
  width: string
  pieces: string
  quantity: string
  rate: string
  discountPercent: string
  taxRatePercent: string
  hsnCode: string | null
  notes: string | null
}

export function emptyLine(): EditorLine {
  return {
    key: Math.random().toString(36).slice(2),
    itemId: null,
    description: '',
    unit: 'NOS',
    dimensionUnit: null,
    length: '',
    width: '',
    pieces: '',
    quantity: '1',
    rate: '0',
    discountPercent: '0',
    taxRatePercent: '18',
    hsnCode: null,
    notes: null,
  }
}

const num = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const optNum = (value: string) => {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
})

export function LineEditor({
  lines,
  onChange,
  items,
}: {
  lines: EditorLine[]
  onChange: (lines: EditorLine[]) => void
  items: ItemOption[]
}) {
  function update(index: number, patch: Partial<EditorLine>) {
    onChange(
      lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    )
  }

  function applyItem(index: number, item: ItemOption | null) {
    if (!item) {
      update(index, { itemId: null })
      return
    }

    update(index, {
      itemId: item.id,
      description: item.name,
      unit: item.unit,
      rate: String(item.rate),
      taxRatePercent: String(item.taxRatePercent),
      hsnCode: item.hsnCode,
    })
  }

  function recomputeQuantity(index: number, patch: Partial<EditorLine>) {
    const line = { ...lines[index], ...patch }
    const derived = derivedQuantity({
      length: optNum(line.length),
      width: optNum(line.width),
      pieces: optNum(line.pieces),
      dimensionUnit: line.dimensionUnit,
    })

    update(index, derived === null ? patch : { ...patch, quantity: String(derived) })
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-sm/6">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="w-8 pb-2 font-medium">#</th>
              <th className="pb-2 pr-3 font-medium">Item / description</th>
              <th className="w-24 pb-2 pr-3 font-medium">Unit</th>
              <th className="w-56 pb-2 pr-3 font-medium">Size × pcs</th>
              <th className="w-24 pb-2 pr-3 text-right font-medium">Qty</th>
              <th className="w-28 pb-2 pr-3 text-right font-medium">Rate</th>
              <th className="w-20 pb-2 pr-3 text-right font-medium">Disc %</th>
              <th className="w-20 pb-2 pr-3 text-right font-medium">GST %</th>
              <th className="w-32 pb-2 pr-3 text-right font-medium">Amount</th>
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const totals = lineTotals({
                quantity: num(line.quantity),
                rate: num(line.rate),
                discountPercent: num(line.discountPercent),
                taxRatePercent: num(line.taxRatePercent),
              })
              const selectedItem =
                items.find((item) => item.id === line.itemId) ?? null

              return (
                <tr key={line.key} className="align-top">
                  <td className="py-2 pr-2 text-zinc-500 tabular-nums dark:text-zinc-400">
                    {index + 1}
                  </td>
                  <td className="py-2 pr-3">
                    <div className="grid grid-cols-1 gap-2">
                      <Combobox<ItemOption | null>
                        options={items}
                        value={selectedItem}
                        onChange={(item) => applyItem(index, item)}
                        placeholder="Pick an item…"
                        displayValue={(item) => item?.name ?? ''}
                        filter={(item, query) => {
                          if (!item) return true
                          const haystack = [
                            item.name,
                            item.code,
                            item.brand,
                            item.category?.name,
                          ]
                            .filter(Boolean)
                            .join(' ')
                            .toLowerCase()
                          return haystack.includes(query.toLowerCase())
                        }}
                      >
                        {(item) => (
                          <ComboboxOption value={item}>
                            <ComboboxLabel>{item.name}</ComboboxLabel>
                            <ComboboxDescription>
                              {item.code} · {currency.format(item.rate)} /{' '}
                              {UNIT_SHORT[item.unit]}
                            </ComboboxDescription>
                          </ComboboxOption>
                        )}
                      </Combobox>
                      <Input
                        aria-label={`Description for line ${index + 1}`}
                        value={line.description}
                        placeholder="Description"
                        onChange={(event) =>
                          update(index, { description: event.target.value })
                        }
                      />
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Listbox
                      aria-label={`Unit for line ${index + 1}`}
                      value={line.unit}
                      onChange={(value) =>
                        update(index, { unit: value as UnitOfMeasure })
                      }
                    >
                      {Object.values(UnitOfMeasure).map((value) => (
                        <ListboxOption key={value} value={value}>
                          <ListboxLabel>{UNIT_SHORT[value]}</ListboxLabel>
                        </ListboxOption>
                      ))}
                    </Listbox>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="grid grid-cols-1 gap-2">
                      <Listbox
                        aria-label={`Size unit for line ${index + 1}`}
                        value={line.dimensionUnit ?? 'NONE'}
                        onChange={(value) =>
                          recomputeQuantity(index, {
                            dimensionUnit:
                              value === 'NONE' ? null : (value as DimensionUnit),
                          })
                        }
                      >
                        <ListboxOption value="NONE">
                          <ListboxLabel>Enter qty directly</ListboxLabel>
                        </ListboxOption>
                        {Object.values(DimensionUnit).map((value) => (
                          <ListboxOption key={value} value={value}>
                            <ListboxLabel>
                              Size in {DIMENSION_UNIT_SHORT[value]}
                            </ListboxLabel>
                          </ListboxOption>
                        ))}
                      </Listbox>
                      {line.dimensionUnit ? (
                        <div className="flex items-center gap-1">
                          <Input
                            aria-label={`Length for line ${index + 1}`}
                            type="number"
                            step="0.001"
                            min={0}
                            placeholder="W"
                            value={line.length}
                            onChange={(event) =>
                              recomputeQuantity(index, {
                                length: event.target.value,
                              })
                            }
                          />
                          <span className="text-zinc-400">×</span>
                          <Input
                            aria-label={`Width for line ${index + 1}`}
                            type="number"
                            step="0.001"
                            min={0}
                            placeholder="H"
                            value={line.width}
                            onChange={(event) =>
                              recomputeQuantity(index, {
                                width: event.target.value,
                              })
                            }
                          />
                          <span className="text-zinc-400">×</span>
                          <Input
                            aria-label={`Pieces for line ${index + 1}`}
                            type="number"
                            step="1"
                            min={0}
                            placeholder="pcs"
                            value={line.pieces}
                            onChange={(event) =>
                              recomputeQuantity(index, {
                                pieces: event.target.value,
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Quantity for line ${index + 1}`}
                      type="number"
                      step="0.001"
                      min={0}
                      className="text-right"
                      value={line.quantity}
                      disabled={Boolean(line.dimensionUnit)}
                      onChange={(event) =>
                        update(index, { quantity: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Rate for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      value={line.rate}
                      onChange={(event) =>
                        update(index, { rate: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`Discount for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={line.discountPercent}
                      onChange={(event) =>
                        update(index, { discountPercent: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <Input
                      aria-label={`GST for line ${index + 1}`}
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      value={line.taxRatePercent}
                      onChange={(event) =>
                        update(index, { taxRatePercent: event.target.value })
                      }
                    />
                  </td>
                  <td className="py-2 pr-3 pt-4 text-right tabular-nums">
                    <div className="font-medium">
                      {currency.format(totals.amount)}
                    </div>
                    <div className="text-xs/5 text-zinc-500 dark:text-zinc-400">
                      +{currency.format(totals.taxAmount)} tax
                    </div>
                  </td>
                  <td className="py-2 pt-3">
                    <Button
                      plain
                      aria-label={`Remove line ${index + 1}`}
                      disabled={lines.length === 1}
                      onClick={() =>
                        onChange(lines.filter((_, i) => i !== index))
                      }
                    >
                      <TrashIcon />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <Button outline onClick={() => onChange([...lines, emptyLine()])}>
          <PlusIcon />
          Add line
        </Button>
      </div>
    </div>
  )
}
