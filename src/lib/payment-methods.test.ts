import { describe, expect, it } from 'vitest'
import {
  PAYMENT_METHODS,
  SELECTABLE_METHODS,
  bankFromIfsc,
  checkField,
  detailRows,
  detailsText,
  fieldsFor,
  isIsoDate,
  methodFor,
  normaliseCode,
  normaliseDigits,
  normaliseIfsc,
  normaliseLast4,
  normaliseText,
  normaliseUpiRef,
  normaliseUtr,
  normaliseVpa,
  parsePaymentDetails,
  parseReceivingDetails,
  paymentDetailsSchema,
  readStoredDetails,
  receivingFieldsFor,
  receivingRows,
  shortReference,
  upiPayLink,
} from './payment-methods'

const field = (mode: string, key: string) => fieldsFor(mode).find((f) => f.key === key)!

describe('registry', () => {
  it('covers every payment mode once with unique field keys and a valid primary', () => {
    const keys = PAYMENT_METHODS.map((m) => m.key)

    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(
      expect.arrayContaining(['CASH', 'UPI', 'NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CARD', 'NET_BANKING', 'DEMAND_DRAFT', 'WALLET', 'OTHER', 'BANK_TRANSFER']),
    )

    for (const method of PAYMENT_METHODS) {
      const fieldKeys = method.fields.map((f) => f.key)

      expect(new Set(fieldKeys).size).toBe(fieldKeys.length)
      if (method.primary) expect(fieldKeys).toContain(method.primary)
    }
  })

  it('hides the legacy bank transfer from new pickers but still knows it', () => {
    expect(SELECTABLE_METHODS.map((m) => m.key)).not.toContain('BANK_TRANSFER')
    expect(methodFor('BANK_TRANSFER')?.label).toBe('Bank transfer (NEFT/RTGS/IMPS)')
    expect(methodFor('nope')).toBeNull()
    expect(fieldsFor(null)).toEqual([])
  })

  it('words labels for money going out', () => {
    expect(fieldsFor('CASH', 'in')[0].label).toBe('Received by')
    expect(fieldsFor('CASH', 'out')[0].label).toBe('Handed to')
    expect(fieldsFor('UPI', 'out').find((f) => f.key === 'vpa')?.label).toBe('Payee UPI ID')
  })
})

describe('normalisers', () => {
  it('cleans text and UPI IDs', () => {
    expect(normaliseText('  Ravi   Kumar ')).toBe('Ravi Kumar')
    expect(normaliseVpa(' Ravi.K @OkHDFCBank ')).toBe('ravi.k@okhdfcbank')
  })

  it('keeps only the digits of a UPI reference', () => {
    expect(normaliseUpiRef('UPI Ref: 4131 2345-6789')).toBe('413123456789')
    expect(normaliseDigits('12 34 ab 56')).toBe('123456')
  })

  it('upper-cases UTRs and codes without separators', () => {
    expect(normaliseUtr('hdfcr5 2026-1115 00123')).toBe('HDFCR520261115' + '00123')
    expect(normaliseCode('ab-12 cd')).toBe('AB12CD')
  })

  it('keeps the last four digits only', () => {
    expect(normaliseLast4('xxxx 1234')).toBe('1234')
    expect(normaliseLast4('4111 1111 1111 9876')).toBe('9876')
    expect(normaliseLast4('12')).toBe('12')
  })

  it('upper-cases IFSC and strips spaces', () => {
    expect(normaliseIfsc(' hdfc 0001234 ')).toBe('HDFC0001234')
  })
})

describe('field validators', () => {
  it('UPI transaction id: 12 digits, forgiving of formatting, required', () => {
    const f = field('UPI', 'utr')

    expect(checkField(f, '4131 2345 6789')).toEqual({ value: '413123456789', error: null })
    expect(checkField(f, '12345').error).toMatch(/12 digits/)
    expect(checkField(f, '1234567890123').error).toBeTruthy()
    expect(checkField(f, '').error).toMatch(/required/)
  })

  it('UPI VPA: optional, shaped like name@handle', () => {
    const f = field('UPI', 'vpa')

    expect(checkField(f, '').error).toBeNull()
    expect(checkField(f, 'Ravi.K-1_x@okhdfcbank')).toEqual({ value: 'ravi.k-1_x@okhdfcbank', error: null })
    expect(checkField(f, 'ravi').error).toMatch(/UPI ID/)
    expect(checkField(f, 'a@b').error).toBeTruthy()
    expect(checkField(f, 'ravi@bank1').error).toBeTruthy()
    expect(checkField(f, '@bank').error).toBeTruthy()
  })

  it('NEFT/RTGS/IMPS UTR: 12-22 alphanumeric, upper-cased; last 4 optional', () => {
    for (const mode of ['NEFT', 'RTGS', 'IMPS']) {
      const f = field(mode, 'utr')

      expect(checkField(f, 'hdfcr52026111500123')).toEqual({ value: 'HDFCR52026111500123', error: null })
      expect(checkField(f, 'ABC123').error).toMatch(/UTR/)
      expect(checkField(f, 'A'.repeat(23)).error).toBeTruthy()
      expect(checkField(f, '').error).toMatch(/required/)
    }

    const last4 = field('NEFT', 'accountLast4')

    expect(checkField(last4, '').error).toBeNull()
    expect(checkField(last4, '12 34')).toEqual({ value: '1234', error: null })
    expect(checkField(last4, '1').error).toMatch(/4 digits/)
  })

  it('cheque: 6-digit number, bank, cheque date required, deposited on optional', () => {
    expect(checkField(field('CHEQUE', 'chequeNumber'), '123456').error).toBeNull()
    expect(checkField(field('CHEQUE', 'chequeNumber'), '12345').error).toMatch(/6 digits/)
    expect(checkField(field('CHEQUE', 'bankName'), '').error).toMatch(/required/)
    expect(checkField(field('CHEQUE', 'chequeDate'), '').error).toMatch(/required/)
    expect(checkField(field('CHEQUE', 'chequeDate'), '2026-11-15').error).toBeNull()
    expect(checkField(field('CHEQUE', 'chequeDate'), '2026-02-30').error).toMatch(/valid date/)
    expect(checkField(field('CHEQUE', 'depositedOn'), '').error).toBeNull()
    expect(checkField(field('CHEQUE', 'depositedOn'), '15/11/2026').error).toBeTruthy()
  })

  it('card: network select, last 4, 6-char auth code', () => {
    expect(checkField(field('CARD', 'network'), 'RuPay').error).toBeNull()
    expect(checkField(field('CARD', 'network'), 'Diners').error).toBeTruthy()
    expect(checkField(field('CARD', 'network'), '').error).toMatch(/required/)
    expect(checkField(field('CARD', 'cardType'), '').error).toBeNull()
    expect(checkField(field('CARD', 'cardType'), 'Credit').error).toBeNull()
    expect(checkField(field('CARD', 'cardLast4'), '4111 1111 1111 1234').value).toBe('1234')
    expect(checkField(field('CARD', 'authCode'), 'ab12cd')).toEqual({ value: 'AB12CD', error: null })
    expect(checkField(field('CARD', 'authCode'), 'AB12').error).toMatch(/6 letters/)
    expect(checkField(field('CARD', 'authCode'), 'AB12CD3').error).toBeTruthy()
  })

  it('net banking: reference required, bank optional', () => {
    expect(checkField(field('NET_BANKING', 'reference'), 'abc-123456')).toEqual({ value: 'ABC123456', error: null })
    expect(checkField(field('NET_BANKING', 'reference'), 'ab').error).toBeTruthy()
    expect(checkField(field('NET_BANKING', 'reference'), '').error).toMatch(/required/)
    expect(checkField(field('NET_BANKING', 'bankName'), '').error).toBeNull()
  })

  it('demand draft: 6-digit number, bank and issue date required', () => {
    expect(checkField(field('DEMAND_DRAFT', 'ddNumber'), '654321').error).toBeNull()
    expect(checkField(field('DEMAND_DRAFT', 'ddNumber'), '65432a').value).toBe('65432')
    expect(checkField(field('DEMAND_DRAFT', 'ddNumber'), '65432').error).toMatch(/6 digits/)
    expect(checkField(field('DEMAND_DRAFT', 'bankName'), '').error).toMatch(/required/)
    expect(checkField(field('DEMAND_DRAFT', 'issueDate'), '2026-11-01').error).toBeNull()
    expect(checkField(field('DEMAND_DRAFT', 'issueDate'), '').error).toMatch(/required/)
  })

  it('wallet: wallet select and transaction id required', () => {
    expect(checkField(field('WALLET', 'wallet'), 'PhonePe').error).toBeNull()
    expect(checkField(field('WALLET', 'wallet'), 'Venmo').error).toBeTruthy()
    expect(checkField(field('WALLET', 'wallet'), '').error).toMatch(/required/)
    expect(checkField(field('WALLET', 'txnId'), 't2611 1512ab')).toEqual({ value: 'T26111512AB', error: null })
    expect(checkField(field('WALLET', 'txnId'), 'abc').error).toBeTruthy()
  })

  it('cash and other are free but length capped', () => {
    expect(checkField(field('CASH', 'person'), '').error).toBeNull()
    expect(checkField(field('CASH', 'person'), '  Meena   Devi ').value).toBe('Meena Devi')
    expect(checkField(field('CASH', 'person'), 'x'.repeat(81)).error).toMatch(/too long/)
    expect(checkField(field('OTHER', 'reference'), 'x'.repeat(121)).error).toMatch(/too long/)
  })

  it('isIsoDate rejects impossible dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true)
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-2-3')).toBe(false)
  })
})

describe('parsePaymentDetails', () => {
  it('strips unknown keys, drops empty values and derives the reference', () => {
    const parsed = parsePaymentDetails('UPI', JSON.stringify({ utr: ' 4131 2345 6789', vpa: '', evil: 'x' }))

    expect(parsed).toEqual({ ok: true, details: { utr: '413123456789' }, reference: '413123456789' })
  })

  it('reports field errors keyed by paymentDetails.<key>', () => {
    const parsed = parsePaymentDetails('CHEQUE', { chequeNumber: '12', bankName: '', chequeDate: 'x' })

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(Object.keys(parsed.fieldErrors).sort()).toEqual([
        'paymentDetails.bankName',
        'paymentDetails.chequeDate',
        'paymentDetails.chequeNumber',
      ])
    }
  })

  it('treats bad JSON as empty and cash with nothing as null details', () => {
    expect(parsePaymentDetails('CASH', 'not json')).toEqual({ ok: true, details: null, reference: null })
    expect(parsePaymentDetails('UPI', 'not json').ok).toBe(false)
    expect(parsePaymentDetails('CASH', '[1,2]')).toEqual({ ok: true, details: null, reference: null })
  })

  it('stores cash person without a reference', () => {
    expect(parsePaymentDetails('CASH', { person: 'Meena' })).toEqual({
      ok: true,
      details: { person: 'Meena' },
      reference: null,
    })
  })

  it('OTHER holds a free reference as primary; legacy bank transfer is lenient', () => {
    expect(parsePaymentDetails('OTHER', { reference: 'Barter note' })).toMatchObject({ reference: 'Barter note' })
    expect(parsePaymentDetails('BANK_TRANSFER', {})).toEqual({ ok: true, details: null, reference: null })
  })

  it('an unknown mode has no fields and no details', () => {
    expect(parsePaymentDetails('???', { a: 'b' })).toEqual({ ok: true, details: null, reference: null })
  })

  it('builds a zod schema from the registry', () => {
    const schema = paymentDetailsSchema('WALLET')

    expect(schema.safeParse({ wallet: 'Paytm', txnId: 'abc12345' }).data).toEqual({ wallet: 'Paytm', txnId: 'ABC12345' })
    expect(schema.safeParse({ wallet: 'Paytm' }).success).toBe(false)
  })
})

describe('display helpers', () => {
  it('reads only known string fields from stored JSON', () => {
    expect(readStoredDetails('UPI', { utr: '413123456789', extra: 'x', vpa: 5 })).toEqual({ utr: '413123456789' })
    expect(readStoredDetails('UPI', null)).toEqual({})
    expect(readStoredDetails('UPI', ['a'])).toEqual({})
  })

  it('lists rows in field order with direction wording', () => {
    expect(detailRows('CASH', { person: 'Meena' }, 'out')).toEqual([{ key: 'person', label: 'Handed to', value: 'Meena' }])
    expect(detailsText('NEFT', { bankName: 'HDFC Bank', utr: 'HDFCR52026111500123' })).toBe(
      'UTR number: HDFCR52026111500123; Bank name: HDFC Bank',
    )
  })

  it('shortens a reference for lists and falls back to the free reference', () => {
    expect(shortReference('UPI', { utr: '413123456789' }, '413123456789')).toBe('UPI · 4131…')
    expect(shortReference('CHEQUE', { chequeNumber: '123456' }, '123456')).toBe('Cheque · 123456')
    expect(shortReference('UPI', null, 'old ref')).toBe('UPI · old ref')
    expect(shortReference('OTHER', null, 'old ref')).toBe('old ref')
    expect(shortReference('CASH', null, null)).toBe('')
  })
})

describe('our receiving details', () => {
  it('has fields per kind and none for cash', () => {
    expect(receivingFieldsFor('CASH')).toEqual([])
    expect(receivingFieldsFor('UPI').map((f) => f.key)).toEqual(['vpa', 'payeeName'])
    expect(receivingFieldsFor('IMPS').map((f) => f.key)).toEqual(['accountHolder', 'accountNumber', 'ifsc', 'bankName', 'branch', 'accountType'])
    expect(receivingFieldsFor('CHEQUE').map((f) => f.key)).toEqual(['payableTo', 'deliverTo'])
  })

  it('validates account number, IFSC and fills the bank from the IFSC', () => {
    const ok = parseReceivingDetails('NEFT', {
      accountHolder: 'Madhav CNC',
      accountNumber: '1234 5678 9012',
      ifsc: 'hdfc0001234',
      accountType: 'Current',
      junk: 'x',
    })

    expect(ok).toEqual({
      ok: true,
      details: { accountHolder: 'Madhav CNC', accountNumber: '123456789012', ifsc: 'HDFC0001234', bankName: 'HDFC Bank', accountType: 'Current' },
    })
  })

  it('keeps a typed bank name over the guess and rejects bad numbers', () => {
    const typed = parseReceivingDetails('NEFT', { accountHolder: 'A', accountNumber: '123456789', ifsc: 'HDFC0001234', bankName: 'My bank' })

    expect(typed.ok && typed.details?.bankName).toBe('My bank')

    const bad = parseReceivingDetails('NEFT', { accountHolder: '', accountNumber: '123', ifsc: 'HDFC1001234' }, true)

    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(Object.keys(bad.fieldErrors).sort()).toEqual(['accountHolder', 'accountNumber', 'ifsc'])
  })

  it('validates our UPI ID and reads rows back', () => {
    expect(parseReceivingDetails('UPI', { vpa: 'nope' }).ok).toBe(false)
    expect(parseReceivingDetails('UPI', {}, true).ok).toBe(false)
    expect(parseReceivingDetails('UPI', {})).toEqual({ ok: true, details: null })

    const ok = parseReceivingDetails('UPI', { vpa: 'Shop@OkAxis', payeeName: ' Madhav  CNC ' })

    expect(ok).toEqual({ ok: true, details: { vpa: 'shop@okaxis', payeeName: 'Madhav CNC' } })
    expect(receivingRows('UPI', { vpa: 'shop@okaxis', x: 1 })).toEqual([{ key: 'vpa', label: 'Our UPI ID', value: 'shop@okaxis' }])
    expect(receivingRows('UPI', null)).toEqual([])
    expect(parseReceivingDetails('CASH', { a: 'b' })).toEqual({ ok: true, details: null })
  })

  it('looks up banks from the first four letters of an IFSC, offline', () => {
    expect(bankFromIfsc('SBIN0000300')).toBe('State Bank of India')
    expect(bankFromIfsc('kkbk')).toBe('Kotak Mahindra Bank')
    expect(bankFromIfsc('ZZZZ0000000')).toBeNull()
    expect(bankFromIfsc('')).toBeNull()
  })

  it('builds a UPI pay link', () => {
    expect(upiPayLink('shop@okaxis', 'Madhav CNC', 1500, 'INV 1')).toBe(
      'upi://pay?pa=shop%40okaxis&cu=INR&pn=Madhav%20CNC&am=1500.00&tn=INV%201',
    )
    expect(upiPayLink('bad', 'x')).toBeNull()
    expect(upiPayLink('shop@okaxis', undefined)).toBe('upi://pay?pa=shop%40okaxis&cu=INR')
  })
})
