import { describe, expect, it } from 'vitest'
import {
  QUOTATION_TRANSITIONS,
  canConvertQuotation,
  quotationDeleteError,
  quotationEditError,
  quotationTransitionError,
} from '@/lib/sales-rules'
import {
  orderTrackingUrl,
  quotationShareParts,
  quotationShareUrl,
  trackingShareParts,
} from '@/lib/share-links'
import { quotationJsonSchema, staffCommentBodySchema } from '@/lib/validation/quotations'

describe('quotation status rules', () => {
  it('allows the documented moves and refuses the rest', () => {
    expect(quotationTransitionError('DRAFT', 'SENT')).toBeNull()
    expect(quotationTransitionError('SENT', 'ACCEPTED')).toBeNull()
    expect(quotationTransitionError('ACCEPTED', 'CONVERTED')).toBeNull()
    expect(quotationTransitionError('DRAFT', 'ACCEPTED')).toBe(
      'A draft quotation cannot move to accepted',
    )
    expect(quotationTransitionError('CONVERTED', 'DRAFT')).toBe(
      'A converted quotation cannot move to draft',
    )
  })

  it('has no way out of converted', () => {
    expect(QUOTATION_TRANSITIONS.CONVERTED).toEqual([])
  })

  it('locks a converted quotation against edits only', () => {
    expect(quotationEditError('CONVERTED')).toMatch(/cannot be edited/)
    expect(quotationEditError('ACCEPTED')).toBeNull()
  })

  it('blocks delete while orders or revisions point at it', () => {
    expect(quotationDeleteError({ orders: 0, revisions: 0 })).toBeNull()
    expect(quotationDeleteError({ orders: 1, revisions: 0 })).toMatch(/Delete those first/)
    expect(quotationDeleteError({ orders: 0, revisions: 2 })).toMatch(/Delete those first/)
  })

  it('converts only accepted (or already converted) quotations', () => {
    expect(canConvertQuotation('ACCEPTED')).toBe(true)
    expect(canConvertQuotation('CONVERTED')).toBe(true)
    expect(canConvertQuotation('SENT')).toBe(false)
  })
})

describe('quotation input schema (JSON)', () => {
  const line = { description: 'Wardrobe', unit: 'SQFT', quantity: 10, rate: 1000 }

  it('accepts a JSON body and fills defaults', () => {
    const parsed = quotationJsonSchema.safeParse({
      customerId: 'c1',
      quotationDate: '2026-01-05',
      lines: [line],
    })

    expect(parsed.success).toBe(true)

    if (parsed.success) {
      expect(parsed.data.status).toBe('DRAFT')
      expect(parsed.data.advancePercent).toBe(80)
      expect(parsed.data.quotationDate.toISOString()).toBe('2026-01-05T00:00:00.000Z')
      expect(parsed.data.lines[0].materialSupply).toBe('WITH_MATERIAL')
    }
  })

  it('rejects an empty line list and a bad pincode', () => {
    const parsed = quotationJsonSchema.safeParse({
      customerId: 'c1',
      quotationDate: '2026-01-05',
      sitePincode: '12',
      lines: [],
    })

    expect(parsed.success).toBe(false)
  })

  it('trims and requires a staff comment', () => {
    expect(staffCommentBodySchema.safeParse('   ').success).toBe(false)
    expect(staffCommentBodySchema.parse('  hi ')).toBe('hi')
  })
})

describe('share link builders', () => {
  it('builds urls from the base passed in', () => {
    expect(quotationShareUrl('https://app.example.com/', 'tok')).toBe('https://app.example.com/q/tok')
    expect(quotationShareUrl(null, 'tok')).toBe('/q/tok')
    expect(orderTrackingUrl('https://app.example.com', 'tok')).toBe('https://app.example.com/t/tok')
  })

  it('words the WhatsApp message and link for a quotation', () => {
    const parts = quotationShareParts({
      baseUrl: 'https://app.example.com',
      token: 'abc',
      customerName: 'Asha',
      customerPhone: '98765 43210',
      quotationNumber: 'QUO-0001',
      companyName: 'Madhav',
    })

    expect(parts.url).toBe('https://app.example.com/q/abc')
    expect(parts.whatsappText).toBe(
      'Hello Asha, here is your quotation QUO-0001 from Madhav. You can view it and approve it here:\n\nhttps://app.example.com/q/abc',
    )
    expect(parts.whatsappLink.startsWith('https://wa.me/919876543210?text=')).toBe(true)
  })

  it('falls back to "us" and a bare wa.me link', () => {
    const parts = quotationShareParts({
      baseUrl: null,
      token: 'abc',
      customerName: 'Asha',
      customerPhone: null,
      quotationNumber: 'QUO-0001',
    })

    expect(parts.whatsappText).toContain('from us.')
    expect(parts.whatsappLink.startsWith('https://wa.me/?text=')).toBe(true)
  })

  it('words the tracking message', () => {
    const parts = trackingShareParts({
      baseUrl: 'https://x.io',
      token: 't',
      customerName: 'Asha',
      customerPhone: null,
      orderNumber: 'ORD-0002',
    })

    expect(parts.whatsappText).toBe(
      'Hello Asha, you can follow the progress of your order ORD-0002 here:\n\nhttps://x.io/t/t',
    )
  })
})
