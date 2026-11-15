// The catalogue of Indian payment methods: for each one, the fixed fields to
// capture when money is received or paid, with validators and normalisers.
// Pure (no database, no React) so the form, the server actions and the tests
// all use the same rules.
//
// A method's key is the PaymentMode enum value. The method's `primary` field
// is also stored in the row's `reference` column, so search, reports and
// exports keep working on one plain string.

import { z } from 'zod'
import type { PaymentMode } from '@/generated/prisma/enums'

export type FieldType = 'text' | 'select' | 'date'

export type FieldDef = {
  key: string
  label: string
  /** Label when the business is paying out (vendor payments, expenses). */
  labelOut?: string
  placeholder?: string
  help?: string
  required?: boolean
  type?: FieldType
  options?: { value: string; label: string }[]
  pattern?: RegExp
  /** Shown when the value does not match `pattern`. */
  patternMessage?: string
  /** Cleans what was typed or pasted before it is checked and stored. */
  normalise?: (raw: string) => string
  maxLength: number
  inputMode?: 'text' | 'numeric' | 'email' | 'tel'
  /** How to show the value in a compact reference ("UPI · 4131…"). */
  mask?: (value: string) => string
}

export type MethodDef = {
  key: PaymentMode
  label: string
  /** Heroicons 20/solid name, so the UI can pick an icon without importing all. */
  icon: 'banknotes' | 'qr-code' | 'building-library' | 'document-text' | 'credit-card' | 'computer-desktop' | 'wallet' | 'ellipsis-horizontal' | 'bolt' | 'arrows-right-left'
  /** Shown only for rows that already use it; not offered for new modes. */
  legacy?: boolean
  fields: FieldDef[]
  /** The field whose value is stored as the row's `reference`. */
  primary?: string
}

// ---------------------------------------------------------------------------
// Normalisers

const collapse = (raw: string) => raw.trim().replace(/\s+/g, ' ')
const digitsOnly = (raw: string) => raw.replace(/\D/g, '')
const compactUpper = (raw: string) => raw.replace(/[\s\-_/]/g, '').toUpperCase()

/** Names: trim and squeeze inner whitespace. */
export const normaliseText = collapse

/** A UPI ID is case-insensitive and has no spaces. */
export const normaliseVpa = (raw: string) => raw.replace(/\s+/g, '').toLowerCase()

/**
 * A UPI transaction id (RRN/UTR) is 12 digits. People paste it with spaces,
 * dashes or a prefix ("UPI Ref: 4131 2345 6789"), so keep only the digits.
 */
export const normaliseUpiRef = digitsOnly

/** Bank UTRs are alphanumeric: upper-case, no spaces or dashes. */
export const normaliseUtr = compactUpper

export const normaliseDigits = digitsOnly

/** The last four digits: tolerate a pasted full number or "xxxx 1234" by keeping the last four. */
export const normaliseLast4 = (raw: string) => digitsOnly(raw).slice(-4)

export const normaliseCode = compactUpper

export const normaliseIfsc = (raw: string) => raw.replace(/\s+/g, '').toUpperCase()

// ---------------------------------------------------------------------------
// Patterns

/** name@handle: 2-256 characters of letters, digits, dot, dash or underscore, then a handle. */
export const VPA_PATTERN = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/
export const UPI_REF_PATTERN = /^\d{12}$/
export const UTR_PATTERN = /^[A-Za-z0-9]{12,22}$/
export const LAST4_PATTERN = /^\d{4}$/
export const SIX_DIGITS_PATTERN = /^\d{6}$/
export const AUTH_CODE_PATTERN = /^[A-Za-z0-9]{6}$/
export const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/
export const TXN_ID_PATTERN = /^[A-Za-z0-9]{6,30}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string) {
  if (!ISO_DATE.test(value)) return false

  const date = new Date(`${value}T00:00:00Z`)

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// ---------------------------------------------------------------------------
// Reusable fields

const BANK_NAME = (required = false): FieldDef => ({
  key: 'bankName',
  label: 'Bank name',
  placeholder: 'e.g. HDFC Bank',
  required,
  maxLength: 80,
  normalise: collapse,
})

const LAST4 = (key = 'accountLast4', label = 'Last 4 digits of account'): FieldDef => ({
  key,
  label,
  placeholder: '1234',
  help: 'Only the last four digits. Never enter a full account or card number.',
  maxLength: 4,
  inputMode: 'numeric',
  pattern: LAST4_PATTERN,
  patternMessage: 'Enter exactly 4 digits',
  normalise: normaliseLast4,
  mask: (value) => `•••• ${value}`,
})

const BANK_UTR: FieldDef = {
  key: 'utr',
  label: 'UTR number',
  placeholder: 'e.g. HDFCR52026111500123',
  help: '12 to 22 letters and digits, from the bank message or statement.',
  required: true,
  maxLength: 22,
  pattern: UTR_PATTERN,
  patternMessage: 'UTR is 12 to 22 letters or digits',
  normalise: normaliseUtr,
}

const bankTransfer = (
  key: 'NEFT' | 'RTGS' | 'IMPS',
  label: string,
  icon: MethodDef['icon'],
): MethodDef => ({
  key,
  label,
  icon,
  primary: 'utr',
  fields: [BANK_UTR, BANK_NAME(), LAST4()],
})

const CARD_NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex']
const WALLETS = ['Paytm', 'PhonePe', 'Google Pay', 'Amazon Pay', 'Other']

// ---------------------------------------------------------------------------
// The catalogue

export const PAYMENT_METHODS: MethodDef[] = [
  {
    key: 'CASH',
    label: 'Cash',
    icon: 'banknotes',
    fields: [
      {
        key: 'person',
        label: 'Received by',
        labelOut: 'Handed to',
        placeholder: 'Name of the person',
        maxLength: 80,
        normalise: collapse,
      },
    ],
  },
  {
    key: 'UPI',
    label: 'UPI',
    icon: 'qr-code',
    primary: 'utr',
    fields: [
      {
        key: 'utr',
        label: 'UPI transaction ID (UTR)',
        placeholder: '12-digit number, e.g. 413123456789',
        help: 'The 12-digit reference in the UPI app (also called UTR or RRN).',
        required: true,
        maxLength: 12,
        inputMode: 'numeric',
        pattern: UPI_REF_PATTERN,
        patternMessage: 'UPI transaction ID is exactly 12 digits',
        normalise: normaliseUpiRef,
        mask: (value) => `${value.slice(0, 4)}…`,
      },
      {
        key: 'vpa',
        label: 'Payer UPI ID',
        labelOut: 'Payee UPI ID',
        placeholder: 'name@okhdfcbank',
        maxLength: 320,
        inputMode: 'email',
        pattern: VPA_PATTERN,
        patternMessage: 'Enter a UPI ID like name@bank',
        normalise: normaliseVpa,
      },
    ],
  },
  bankTransfer('NEFT', 'NEFT', 'building-library'),
  bankTransfer('RTGS', 'RTGS', 'building-library'),
  bankTransfer('IMPS', 'IMPS', 'bolt'),
  {
    key: 'CHEQUE',
    label: 'Cheque',
    icon: 'document-text',
    primary: 'chequeNumber',
    fields: [
      {
        key: 'chequeNumber',
        label: 'Cheque number',
        placeholder: '6 digits',
        required: true,
        maxLength: 6,
        inputMode: 'numeric',
        pattern: SIX_DIGITS_PATTERN,
        patternMessage: 'Cheque number is exactly 6 digits',
        normalise: normaliseDigits,
      },
      BANK_NAME(true),
      { key: 'chequeDate', label: 'Cheque date', type: 'date', required: true, maxLength: 10 },
      { key: 'depositedOn', label: 'Deposited on', type: 'date', maxLength: 10 },
    ],
  },
  {
    key: 'CARD',
    label: 'Card (POS)',
    icon: 'credit-card',
    primary: 'authCode',
    fields: [
      {
        key: 'cardType',
        label: 'Card type',
        type: 'select',
        options: [
          { value: 'Debit', label: 'Debit card' },
          { value: 'Credit', label: 'Credit card' },
        ],
        maxLength: 10,
      },
      {
        key: 'network',
        label: 'Network',
        type: 'select',
        required: true,
        options: CARD_NETWORKS.map((value) => ({ value, label: value })),
        maxLength: 20,
      },
      LAST4('cardLast4', 'Last 4 digits of card'),
      {
        key: 'authCode',
        label: 'Approval / auth code',
        placeholder: '6 characters from the POS slip',
        required: true,
        maxLength: 6,
        pattern: AUTH_CODE_PATTERN,
        patternMessage: 'Approval code is exactly 6 letters or digits',
        normalise: normaliseCode,
      },
    ],
  },
  {
    key: 'NET_BANKING',
    label: 'Net banking',
    icon: 'computer-desktop',
    primary: 'reference',
    fields: [
      {
        key: 'reference',
        label: 'Transaction reference',
        placeholder: 'Reference from the bank',
        required: true,
        maxLength: 30,
        pattern: /^[A-Za-z0-9]{6,30}$/,
        patternMessage: 'Reference is 6 to 30 letters or digits',
        normalise: normaliseCode,
      },
      BANK_NAME(),
    ],
  },
  {
    key: 'DEMAND_DRAFT',
    label: 'Demand draft',
    icon: 'document-text',
    primary: 'ddNumber',
    fields: [
      {
        key: 'ddNumber',
        label: 'DD number',
        placeholder: '6 digits',
        required: true,
        maxLength: 6,
        inputMode: 'numeric',
        pattern: SIX_DIGITS_PATTERN,
        patternMessage: 'DD number is exactly 6 digits',
        normalise: normaliseDigits,
      },
      BANK_NAME(true),
      { key: 'issueDate', label: 'Issue date', type: 'date', required: true, maxLength: 10 },
    ],
  },
  {
    key: 'WALLET',
    label: 'Wallet',
    icon: 'wallet',
    primary: 'txnId',
    fields: [
      {
        key: 'wallet',
        label: 'Wallet',
        type: 'select',
        required: true,
        options: WALLETS.map((value) => ({ value, label: value })),
        maxLength: 20,
      },
      {
        key: 'txnId',
        label: 'Transaction ID',
        placeholder: 'From the wallet app',
        required: true,
        maxLength: 30,
        pattern: TXN_ID_PATTERN,
        patternMessage: 'Transaction ID is 6 to 30 letters or digits',
        normalise: normaliseCode,
      },
    ],
  },
  {
    key: 'OTHER',
    label: 'Other',
    icon: 'ellipsis-horizontal',
    primary: 'reference',
    fields: [
      {
        key: 'reference',
        label: 'Reference',
        placeholder: 'Any reference or note',
        maxLength: 120,
        normalise: collapse,
      },
    ],
  },
  {
    // Rows saved before the specific bank methods existed.
    key: 'BANK_TRANSFER',
    label: 'Bank transfer (NEFT/RTGS/IMPS)',
    icon: 'arrows-right-left',
    legacy: true,
    primary: 'utr',
    fields: [
      {
        key: 'utr',
        label: 'UTR / reference',
        placeholder: 'UTR or reference number',
        maxLength: 30,
        normalise: normaliseUtr,
      },
      BANK_NAME(),
    ],
  },
]

const BY_KEY = new Map(PAYMENT_METHODS.map((method) => [method.key, method]))

/** The methods to offer when setting up a new payment mode. */
export const SELECTABLE_METHODS = PAYMENT_METHODS.filter((method) => !method.legacy)

export function methodFor(mode: PaymentMode | string | null | undefined): MethodDef | null {
  return (mode && BY_KEY.get(mode as PaymentMode)) || null
}

export type Direction = 'in' | 'out'

/** A method's fields with the labels worded for money coming in or going out. */
export function fieldsFor(mode: PaymentMode | string | null | undefined, direction: Direction = 'in'): FieldDef[] {
  const method = methodFor(mode)

  if (!method) return []

  return method.fields.map((field) =>
    direction === 'out' && field.labelOut ? { ...field, label: field.labelOut } : field,
  )
}

// ---------------------------------------------------------------------------
// Validation

export type FieldCheck = { value: string; error: string | null }

/** Normalises and validates one field. Empty optional fields are valid and come back as ''. */
export function checkField(field: FieldDef, raw: unknown): FieldCheck {
  const text = typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : ''
  const cleaned = field.normalise ? field.normalise(text) : collapse(text)
  const value = cleaned.slice(0, field.maxLength + 1)

  if (!value) {
    return { value: '', error: field.required ? `${field.label} is required` : null }
  }

  if (value.length > field.maxLength) {
    return { value: value.slice(0, field.maxLength), error: `${field.label} is too long (up to ${field.maxLength} characters)` }
  }

  if (field.type === 'date') {
    return isIsoDate(value) ? { value, error: null } : { value, error: `${field.label} is not a valid date` }
  }

  if (field.type === 'select') {
    const allowed = field.options?.some((option) => option.value === value)

    return allowed ? { value, error: null } : { value, error: `Choose a ${field.label.toLowerCase()}` }
  }

  if (field.pattern && !field.pattern.test(value)) {
    return { value, error: field.patternMessage ?? `${field.label} is not valid` }
  }

  return { value, error: null }
}

export type DetailValues = Record<string, string>

/** The zod schema of a method's details: unknown keys are stripped, values cleaned and checked. */
export function paymentDetailsSchema(mode: PaymentMode | string | null | undefined, direction: Direction = 'in') {
  const shape: Record<string, z.ZodType<string>> = {}

  for (const field of fieldsFor(mode, direction)) {
    shape[field.key] = z
      .preprocess((raw) => raw ?? '', z.unknown())
      .transform((raw, ctx) => {
        const checked = checkField(field, raw)

        if (checked.error) {
          ctx.addIssue({ code: 'custom', message: checked.error })

          return z.NEVER
        }

        return checked.value
      })
  }

  return z.object(shape)
}

export type ParsedDetails =
  | { ok: true; details: DetailValues | null; reference: string | null }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

/** Reads the JSON a form posts (or an object) into clean details. Field errors are keyed `paymentDetails.<key>`. */
export function parsePaymentDetails(
  mode: PaymentMode | string | null | undefined,
  raw: unknown,
  direction: Direction = 'in',
): ParsedDetails {
  let input: unknown = raw

  if (typeof raw === 'string') {
    try {
      input = raw.trim() ? JSON.parse(raw) : {}
    } catch {
      input = {}
    }
  }

  const record = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const parsed = paymentDetailsSchema(mode, direction).safeParse(record)

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}

    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')

      if (key && !fieldErrors[`paymentDetails.${key}`]) fieldErrors[`paymentDetails.${key}`] = issue.message
    }

    return {
      ok: false,
      error: Object.values(fieldErrors)[0] ?? 'Check the payment details',
      fieldErrors,
    }
  }

  const details: DetailValues = {}

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value) details[key] = value
  }

  const primary = methodFor(mode)?.primary
  const reference = primary ? (details[primary] ?? null) : null

  return { ok: true, details: Object.keys(details).length > 0 ? details : null, reference }
}

/** Tolerates anything in a stored JSON column and returns only known string fields. */
export function readStoredDetails(mode: PaymentMode | string | null | undefined, stored: unknown): DetailValues {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}

  const out: DetailValues = {}

  for (const field of fieldsFor(mode)) {
    const value = (stored as Record<string, unknown>)[field.key]

    if (typeof value === 'string' && value) out[field.key] = value
  }

  return out
}

/** Label/value rows for a definition list, in the method's field order. */
export function detailRows(
  mode: PaymentMode | string | null | undefined,
  stored: unknown,
  direction: Direction = 'in',
): { key: string; label: string; value: string }[] {
  const values = readStoredDetails(mode, stored)

  return fieldsFor(mode, direction).flatMap((field) =>
    values[field.key] ? [{ key: field.key, label: field.label, value: values[field.key] }] : [],
  )
}

/**
 * A short reference for lists: "UPI · 4131…", "Cheque · 123456". Falls back to
 * the plain reference column for rows that only have a free-text reference.
 */
export function shortReference(
  mode: PaymentMode | string | null | undefined,
  stored: unknown,
  reference: string | null | undefined,
): string {
  const method = methodFor(mode)
  const values = readStoredDetails(mode, stored)
  const primary = method?.primary ? method.fields.find((field) => field.key === method.primary) : undefined
  const structured = primary ? values[primary.key] : undefined
  const raw = structured || reference || ''

  if (!raw) return ''

  // Only structured values are known to fit the mask; old free text is shown as is.
  const shown = structured && primary?.mask ? primary.mask(raw) : raw

  return method && method.key !== 'OTHER' && method.key !== 'BANK_TRANSFER' ? `${method.label} · ${shown}` : shown
}

/** The details as one line for CSV: "Bank name: HDFC Bank; UTR number: ...". */
export function detailsText(mode: PaymentMode | string | null | undefined, stored: unknown, direction: Direction = 'in') {
  return detailRows(mode, stored, direction)
    .map((row) => `${row.label}: ${row.value}`)
    .join('; ')
}

// ---------------------------------------------------------------------------
// How the business itself receives money, per kind of payment mode.

export type BankHint = { code: string; name: string }

/** The first four letters of an IFSC identify the bank. Top banks only; offline. */
export const IFSC_BANKS: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  BKID: 'Bank of India',
  IDIB: 'Indian Bank',
  KKBK: 'Kotak Mahindra Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC First Bank',
  FDRL: 'Federal Bank',
  CBIN: 'Central Bank of India',
  IOBA: 'Indian Overseas Bank',
  UCBA: 'UCO Bank',
  MAHB: 'Bank of Maharashtra',
  PSIB: 'Punjab & Sind Bank',
  KARB: 'Karnataka Bank',
  RATN: 'RBL Bank',
  SIBL: 'South Indian Bank',
  CIUB: 'City Union Bank',
  BDBL: 'Bandhan Bank',
  AUBL: 'AU Small Finance Bank',
  JAKA: 'Jammu & Kashmir Bank',
  KVBL: 'Karur Vysya Bank',
  TMBL: 'Tamilnad Mercantile Bank',
  SCBL: 'Standard Chartered Bank',
  HSBC: 'HSBC',
  DBSS: 'DBS Bank India',
  CORP: 'Union Bank of India (Corporation Bank)',
  ANDB: 'Union Bank of India (Andhra Bank)',
  ALLA: 'Indian Bank (Allahabad Bank)',
}

/** The bank an IFSC belongs to, if it is one of the known ones. */
export function bankFromIfsc(ifsc: string): string | null {
  const code = ifsc.trim().toUpperCase().slice(0, 4)

  return code.length === 4 ? (IFSC_BANKS[code] ?? null) : null
}

const ACCOUNT_FIELDS: FieldDef[] = [
  {
    key: 'accountHolder',
    label: 'Account holder',
    placeholder: 'Name as in the bank account',
    required: true,
    maxLength: 100,
    normalise: collapse,
  },
  {
    key: 'accountNumber',
    label: 'Account number',
    placeholder: '9 to 18 digits',
    required: true,
    maxLength: 18,
    inputMode: 'numeric',
    pattern: ACCOUNT_NUMBER_PATTERN,
    patternMessage: 'Account number is 9 to 18 digits',
    normalise: normaliseDigits,
  },
  {
    key: 'ifsc',
    label: 'IFSC',
    placeholder: 'e.g. HDFC0001234',
    required: true,
    maxLength: 11,
    pattern: IFSC_PATTERN,
    patternMessage: 'IFSC is 4 letters, a zero, then 6 letters or digits',
    normalise: normaliseIfsc,
  },
  { key: 'bankName', label: 'Bank name', placeholder: 'Filled from the IFSC when known', maxLength: 80, normalise: collapse },
  { key: 'branch', label: 'Branch', placeholder: 'e.g. Ring Road', maxLength: 80, normalise: collapse },
  {
    key: 'accountType',
    label: 'Account type',
    type: 'select',
    options: [
      { value: 'Current', label: 'Current' },
      { value: 'Savings', label: 'Savings' },
      { value: 'Cash credit', label: 'Cash credit' },
      { value: 'Overdraft', label: 'Overdraft' },
    ],
    maxLength: 20,
  },
]

const BANK_KINDS: PaymentMode[] = ['NEFT', 'RTGS', 'IMPS', 'NET_BANKING', 'BANK_TRANSFER']

const RECEIVING: Partial<Record<PaymentMode, FieldDef[]>> = {
  UPI: [
    {
      key: 'vpa',
      label: 'Our UPI ID',
      placeholder: 'business@okhdfcbank',
      required: true,
      maxLength: 320,
      inputMode: 'email',
      pattern: VPA_PATTERN,
      patternMessage: 'Enter a UPI ID like name@bank',
      normalise: normaliseVpa,
    },
    { key: 'payeeName', label: 'Payee name', placeholder: 'Name shown when paying', maxLength: 100, normalise: collapse },
  ],
  CHEQUE: [
    { key: 'payableTo', label: 'Cheque payable to', placeholder: 'Name to write on the cheque', required: true, maxLength: 120, normalise: collapse },
    { key: 'deliverTo', label: 'Deliver to', placeholder: 'Address for cheques', maxLength: 300, normalise: collapse },
  ],
  DEMAND_DRAFT: [
    { key: 'payableTo', label: 'Draft payable to', placeholder: 'Name on the draft', required: true, maxLength: 120, normalise: collapse },
    { key: 'deliverTo', label: 'Deliver to', placeholder: 'Address for drafts', maxLength: 300, normalise: collapse },
  ],
  CARD: [
    { key: 'merchantId', label: 'Merchant ID', placeholder: 'Optional', maxLength: 40, normalise: collapse },
  ],
  WALLET: [
    { key: 'walletId', label: 'Wallet / merchant ID', placeholder: 'Number or ID customers pay to', maxLength: 60, normalise: collapse },
  ],
}

/** The fixed fields describing how we receive money in a mode of this kind (none for cash and other). */
export function receivingFieldsFor(mode: PaymentMode | string | null | undefined): FieldDef[] {
  if (!mode) return []

  if (BANK_KINDS.includes(mode as PaymentMode)) return ACCOUNT_FIELDS

  return RECEIVING[mode as PaymentMode] ?? []
}

export type ParsedAccount =
  | { ok: true; details: DetailValues | null }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

/**
 * Validates our own receiving details; fills the bank name from the IFSC when
 * left empty. Formats are always checked; the fields marked required only have
 * to be filled when `strict` (the mode is printed on invoices and quotations).
 */
export function parseReceivingDetails(
  mode: PaymentMode | string | null | undefined,
  raw: unknown,
  strict = false,
): ParsedAccount {
  const fields = receivingFieldsFor(mode)
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const details: DetailValues = {}
  const fieldErrors: Record<string, string> = {}

  for (const field of fields) {
    const checked = checkField(strict ? field : { ...field, required: false }, record[field.key])

    if (checked.error) fieldErrors[field.key] = checked.error
    else if (checked.value) details[field.key] = checked.value
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: Object.values(fieldErrors)[0], fieldErrors }
  }

  if (details.ifsc && !details.bankName) {
    const bank = bankFromIfsc(details.ifsc)

    if (bank) details.bankName = bank
  }

  return { ok: true, details: Object.keys(details).length > 0 ? details : null }
}

/** Label/value rows of our own receiving details, for settings and documents. */
export function receivingRows(
  mode: PaymentMode | string | null | undefined,
  stored: unknown,
): { key: string; label: string; value: string }[] {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return []

  const record = stored as Record<string, unknown>

  return receivingFieldsFor(mode).flatMap((field) => {
    const value = record[field.key]

    return typeof value === 'string' && value ? [{ key: field.key, label: field.label, value }] : []
  })
}

/** A upi://pay link from our UPI ID, the payee and (optionally) an amount. Opens a UPI app on a phone. */
export function upiPayLink(vpa: string, payeeName: string | undefined, amount?: number, note?: string): string | null {
  if (!VPA_PATTERN.test(vpa)) return null

  const params = new URLSearchParams({ pa: vpa, cu: 'INR' })

  if (payeeName) params.set('pn', payeeName)
  if (amount && amount > 0) params.set('am', amount.toFixed(2))
  if (note) params.set('tn', note)

  // URLSearchParams encodes spaces as '+', which UPI apps do not decode.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`
}

/** Our stored receiving details as {key: value} for the editor; only known string fields. */
export function readReceivingValues(mode: PaymentMode | string | null | undefined, stored: unknown): DetailValues {
  return Object.fromEntries(receivingRows(mode, stored).map((row) => [row.key, row.value]))
}
