import { describe, expect, it } from 'vitest'
import { ItemType, UnitOfMeasure } from '@/generated/prisma/enums'
import { seedForIndustry } from '@/lib/industry-seed'
import { applyIndustry, NAV_ENTRIES } from '@/lib/navigation'
import { DEFAULT_INDUSTRY, getIndustry, INDUSTRIES, INDUSTRY_KEYS, INDUSTRY_LIST, isIndustryKey } from '@/lib/industry'

const validUnits = Object.values(UnitOfMeasure) as string[]

describe('industry registry', () => {
  it('has unique keys that match their template', () => {
    expect(new Set(INDUSTRY_KEYS).size).toBe(INDUSTRY_KEYS.length)
    expect(INDUSTRY_LIST).toHaveLength(INDUSTRY_KEYS.length)

    for (const key of INDUSTRY_KEYS) expect(INDUSTRIES[key].key).toBe(key)
  })

  it('falls back to manufacturing for unknown values', () => {
    expect(getIndustry(undefined).key).toBe(DEFAULT_INDUSTRY)
    expect(getIndustry('NOPE').key).toBe(DEFAULT_INDUSTRY)
    expect(isIndustryKey('SALON')).toBe(true)
    expect(isIndustryKey('salon')).toBe(false)
  })

  for (const template of INDUSTRY_LIST) {
    describe(template.key, () => {
      it('has unique valid units and valid defaults', () => {
        expect(template.units.length).toBeGreaterThan(0)
        expect(new Set(template.units).size).toBe(template.units.length)

        for (const unit of template.units) expect(validUnits).toContain(unit)

        for (const type of Object.values(ItemType)) {
          expect(validUnits).toContain(template.defaultUnits[type])
        }
      })

      it('has stages when production is on, with unique names', () => {
        if (template.modules.production) expect(template.stages.length).toBeGreaterThan(0)

        const names = template.stages.map((stage) => stage.name)

        expect(new Set(names).size).toBe(names.length)
      })

      it('has unique non-empty expense categories', () => {
        expect(template.expenseCategories.length).toBeGreaterThan(0)
        expect(new Set(template.expenseCategories).size).toBe(template.expenseCategories.length)
      })

      it('has sample items with valid units, unique codes and numeric GST', () => {
        const codes = template.sampleItems.map((item) => item.code)

        expect(new Set(codes).size).toBe(codes.length)

        for (const item of template.sampleItems) {
          expect(validUnits).toContain(item.unit)
          expect(Number.isFinite(item.gstRate)).toBe(true)
          expect(item.gstRate).toBeGreaterThanOrEqual(0)
          expect(item.rate).toBeGreaterThanOrEqual(0)
        }

        expect(Number.isFinite(template.defaultGstRate)).toBe(true)
      })

      it('seeds a complete company', () => {
        const seed = seedForIndustry(template.key)

        expect(seed.stages).toHaveLength(template.stages.length)
        expect(seed.categories.length).toBeGreaterThan(0)
        expect(seed.channels.length).toBeGreaterThan(0)
        expect(seed.items).toHaveLength(template.sampleItems.length)
      })
    })
  }

  it('keeps manufacturing exactly as the original defaults', () => {
    const seed = seedForIndustry('MANUFACTURING')

    expect(seed.stages.map((s) => s.name)).toEqual(['Confirmation', 'Process', 'Ready to dispatch', 'Delivered'])
    expect(seed.categories).toHaveLength(15)
    expect(seed.items).toHaveLength(0)
  })
})

describe('applyIndustry', () => {
  const hrefs = (key: Parameters<typeof getIndustry>[0]) => applyIndustry(NAV_ENTRIES, getIndustry(key)).map((e) => e.href)

  it('leaves manufacturing navigation unchanged', () => {
    expect(hrefs('MANUFACTURING')).toEqual(NAV_ENTRIES.map((e) => e.href))
  })

  it('hides production and dispatch for a salon, and renames orders', () => {
    expect(hrefs('SALON')).not.toContain('/production')
    expect(hrefs('SALON')).not.toContain('/dispatch')
    expect(hrefs('SALON')).toContain('/orders')
    expect(applyIndustry(NAV_ENTRIES, getIndustry('SALON')).find((e) => e.href === '/orders')?.label).toBe('Bookings')
  })
})
