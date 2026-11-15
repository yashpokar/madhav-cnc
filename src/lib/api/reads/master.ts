import type { z } from 'zod'
import { ApiError } from '@/lib/api/errors'
import type { ApiUser } from '@/lib/api/auth'
import { day, dayOrNull, decimal, decimalOrNull, money, moneyOrNull, stamp, stampOrNull } from '@/lib/api/reads/format'
import { itemDetailOut } from '@/lib/api/reads/mappers'
import type * as m from '@/lib/api/schemas/master'
import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'
import { getItem } from '@/lib/queries/items'
import { getPartner } from '@/lib/queries/partners'
import { getNote } from '@/lib/queries/accounting'
import { getDispatch } from '@/lib/queries/dispatches'
import { getAdjustment, type AdjustmentRow } from '@/lib/queries/adjustments'
import { parseDetails } from '@/lib/queries/payment-modes'
import { listOpeningBalances } from '@/lib/queries/cash'
import { listAllMaterials } from '@/lib/queries/materials'
import { listAllStages } from '@/lib/queries/stages'
import { getCompanySetting } from '@/lib/queries/company'
import type { PartnerListItem } from '@/lib/queries/partners'
import type { NoteListItem } from '@/lib/queries/accounting'
import type { DispatchListItem } from '@/lib/queries/dispatches'

// Mappers from database rows to the public JSON shapes of the master-data and
// settings endpoints, plus the loaders the write endpoints answer with (each
// reads inside the request's company scope, so another company's id is a 404).

type Out<T extends z.ZodType> = z.infer<T>

const missing = (what: string) => new ApiError('NOT_FOUND', `${what} not found.`)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// -------------------------------------------------------------------- items

export async function itemDetailFor(user: ApiUser, id: string) {
  const row = await getItem(id)

  if (!row) throw missing('Item')

  return itemDetailOut(row, can(user.role, 'purchase:read'))
}

// ---------------------------------------------------------------- materials

export async function materialRows(): Promise<Out<typeof m.materialRow>[]> {
  const rows = await listAllMaterials()

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    stockTracked: row.stockTracked,
    reorderLevel: decimalOrNull(row.reorderLevel),
    itemCount: row._count.items,
  }))
}

// ----------------------------------------------------------------- partners

export function partnerListOut(row: Omit<PartnerListItem, '_count'>): Out<typeof m.partnerListItem> {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    name: row.name,
    firmName: row.firmName,
    phone: row.phone,
    altPhone: row.altPhone,
    email: row.email,
    city: row.city,
    pincode: row.pincode,
    isActive: row.isActive,
    updatedAt: stamp(row.updatedAt),
  }
}

type PartnerRow = NonNullable<Awaited<ReturnType<typeof getPartner>>>

export function partnerDetailOut(row: PartnerRow): Out<typeof m.partnerDetail> {
  return {
    ...partnerListOut(row),
    address: row.address,
    state: row.state,
    notes: row.notes,
    createdAt: stamp(row.createdAt),
  }
}

export async function partnerDetailFor(id: string) {
  const row = await getPartner(id)

  if (!row) throw missing('Partner')

  return partnerDetailOut(row)
}

// ------------------------------------------------------------ payment modes

const modeSelect = {
  id: true,
  name: true,
  mode: true,
  isActive: true,
  sortOrder: true,
  details: true,
  accountDetails: true,
  showOnDocuments: true,
  qrStoredName: true,
  _count: { select: { payments: true, expenses: true } },
} as const

type ModeRow = {
  id: string
  name: string
  mode: Out<typeof m.paymentModeRow>['kind']
  isActive: boolean
  sortOrder: number
  details: unknown
  accountDetails: unknown
  showOnDocuments: boolean
  qrStoredName: string | null
  _count: { payments: number; expenses: number }
}

export function paymentModeOut(row: ModeRow): Out<typeof m.paymentModeRow> {
  return {
    id: row.id,
    name: row.name,
    kind: row.mode,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    details: parseDetails(row.details),
    accountDetails: isRecord(row.accountDetails) ? row.accountDetails : {},
    showOnDocuments: row.showOnDocuments,
    hasQr: Boolean(row.qrStoredName),
    usage: { payments: row._count.payments, expenses: row._count.expenses },
  }
}

export async function paymentModeRows(): Promise<Out<typeof m.paymentModeRow>[]> {
  const rows = await prisma.paymentChannel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: modeSelect,
  })

  return rows.map(paymentModeOut)
}

/** One mode with its use counts, or null (another company's id is not found in scope). */
export async function findPaymentMode(id: string) {
  return prisma.paymentChannel.findUnique({ where: { id }, select: modeSelect })
}

export async function paymentModeFor(id: string) {
  const row = await findPaymentMode(id)

  if (!row) throw missing('Payment mode')

  return paymentModeOut(row)
}

// ------------------------------------------------------- expense categories

export async function expenseCategoryFor(id: string): Promise<Out<typeof m.expenseCategoryRow>> {
  const row = await prisma.expenseCategory.findUnique({
    where: { id },
    select: { id: true, name: true, sortOrder: true, isActive: true, _count: { select: { expenses: true } } },
  })

  if (!row) throw missing('Expense category')

  return { id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive, expenseCount: row._count.expenses }
}

// --------------------------------------------------------- business profile

export async function companyProfileFor(): Promise<Out<typeof m.companyProfile>> {
  const row = await getCompanySetting()

  return {
    companyName: row.companyName,
    addressLine: row.addressLine,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    pan: row.pan,
    industry: row.industry,
    defaultAdvancePercent: decimal(row.defaultAdvancePercent.toNumber()),
    invoiceTerms: row.invoiceTerms,
    signatoryName: row.signatoryName,
    signatoryTitle: row.signatoryTitle,
    hasLogo: Boolean(row.logoStoredName),
    hasSignature: Boolean(row.signatureStoredName),
    hasStamp: Boolean(row.stampStoredName),
    updatedAt: stamp(row.updatedAt),
  }
}

// ------------------------------------------------------------------- stages

export async function stageRows(): Promise<Out<typeof m.stageRow>[]> {
  const rows = await listAllStages()

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    linkedStatus: row.linkedStatus,
    taskCount: row._count.tasks,
  }))
}

// -------------------------------------------------------------- adjustments

export function adjustmentOut(row: AdjustmentRow): Out<typeof m.adjustmentItem> {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    amount: money(row.amount),
    adjustedOn: day(row.adjustedOn),
    reason: row.reason,
    note: row.note,
    channel: row.channel,
    customer: row.customer,
    createdAt: stamp(row.createdAt),
  }
}

export async function adjustmentFor(id: string) {
  const row = await getAdjustment(id)

  if (!row) throw missing('Adjustment')

  return adjustmentOut(row)
}

// --------------------------------------------------------- opening balances

export async function openingBalanceRows(): Promise<Out<typeof m.openingBalanceRow>[]> {
  const rows = await listOpeningBalances()

  return rows.map((row) => ({
    channelId: row.id,
    name: row.name,
    isActive: row.isActive,
    amount: moneyOrNull(row.amount),
    asOf: dayOrNull(row.asOf),
  }))
}

// -------------------------------------------------------------------- notes

export function noteListOut(row: NoteListItem): Out<typeof m.noteListItem> {
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    partyType: row.partyType,
    reason: row.reason,
    noteDate: day(row.noteDate),
    total: money(row.total),
    taxAmount: money(row.taxAmount),
    vendorName: row.vendorName,
    customer: row.customer,
    invoice: row.invoice,
  }
}

export async function noteDetailFor(id: string): Promise<Out<typeof m.noteDetail>> {
  const row = await getNote(id)

  if (!row) throw missing('Note')

  return {
    ...noteListOut(row),
    vendorGstin: row.vendorGstin,
    placeOfSupply: row.placeOfSupply,
    isInterState: row.isInterState,
    reasonNote: row.reasonNote,
    subtotal: money(row.subtotal),
    taxableAmount: money(row.taxableAmount),
    cgstAmount: money(row.cgstAmount),
    sgstAmount: money(row.sgstAmount),
    igstAmount: money(row.igstAmount),
    roundOff: money(row.roundOff),
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      description: line.description,
      hsnCode: line.hsnCode,
      unit: line.unit,
      quantity: decimal(line.quantity),
      rate: money(line.rate),
      taxRatePercent: money(line.taxRatePercent),
      amount: money(line.amount),
      cgstAmount: money(line.cgstAmount),
      sgstAmount: money(line.sgstAmount),
      igstAmount: money(line.igstAmount),
      lineTotal: money(line.lineTotal),
    })),
    createdAt: stamp(row.createdAt),
    updatedAt: stamp(row.updatedAt),
  }
}

// -------------------------------------------------------------- dispatches

export function dispatchListOut(row: DispatchListItem & { createdAt: Date }): Out<typeof m.dispatchListItem> {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    dispatchDate: day(row.dispatchDate),
    vehicleNumber: row.vehicleNumber,
    receivedByName: row.receivedByName,
    receivedAt: stampOrNull(row.receivedAt),
    order: { id: row.order.id, number: row.order.number, customerName: row.order.customer.name },
    lineCount: row._count.lines,
    createdAt: stamp(row.createdAt),
  }
}

export async function dispatchDetailFor(id: string): Promise<Out<typeof m.dispatchDetail>> {
  const row = await getDispatch(id)

  if (!row) throw missing('Delivery challan')

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    dispatchDate: day(row.dispatchDate),
    vehicleNumber: row.vehicleNumber,
    receivedByName: row.receivedByName,
    receivedAt: stampOrNull(row.receivedAt),
    order: {
      id: row.order.id,
      number: row.order.number,
      customerName: row.order.customer.name,
      subject: row.order.subject,
    },
    lineCount: row.lines.length,
    createdAt: stamp(row.createdAt),
    driverName: row.driverName,
    driverPhone: row.driverPhone,
    transporterName: row.transporterName,
    lrNumber: row.lrNumber,
    deliveryAddress: row.deliveryAddress,
    deliveryCity: row.deliveryCity,
    deliveryPincode: row.deliveryPincode,
    notes: row.notes,
    deliveredAt: stampOrNull(row.deliveredAt),
    lines: row.lines.map((line) => ({
      id: line.id,
      position: line.position,
      orderLineId: line.orderLineId,
      description: line.description,
      unit: line.unit,
      quantity: decimal(line.quantity),
    })),
    updatedAt: stamp(row.updatedAt),
  }
}
