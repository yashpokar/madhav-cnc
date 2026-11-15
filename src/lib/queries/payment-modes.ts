import { prisma } from '@/lib/prisma'

export type PaymentModeOption = { id: string; name: string }

/** The modes someone can pick when recording money, in the order set up. */
export async function listPaymentModeOptions(include?: string | null): Promise<PaymentModeOption[]> {
  return prisma.paymentChannel.findMany({
    where: { OR: [{ isActive: true }, ...(include ? [{ id: include }] : [])] },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  })
}

/** Every mode with how often it has been used, for the settings page. */
export async function listPaymentModesWithUse() {
  return prisma.paymentChannel.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      mode: true,
      isActive: true,
      sortOrder: true,
      details: true,
      showOnDocuments: true,
      qrStoredName: true,
      _count: { select: { payments: true, expenses: true } },
    },
  })
}

export type ModeDetail = { label: string; value: string }

/** The details of a mode as stored: tolerates anything odd in the JSON. */
export function parseDetails(value: unknown): ModeDetail[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []

    const { label, value: text } = row as { label?: unknown; value?: unknown }

    return typeof label === 'string' && typeof text === 'string' && (label.trim() || text.trim())
      ? [{ label: label.trim(), value: text.trim() }]
      : []
  })
}

export type DocumentPaymentMode = {
  id: string
  name: string
  details: ModeDetail[]
  hasQr: boolean
}

/**
 * The ways to pay that a company has chosen to print on its invoices and
 * quotations. Public pages pass the company; signed-in pages leave it out.
 */
export async function listDocumentPaymentModes(companyId?: string): Promise<DocumentPaymentMode[]> {
  const rows = await prisma.paymentChannel.findMany({
    where: { isActive: true, showOnDocuments: true, ...(companyId ? { companyId } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, details: true, qrStoredName: true },
  })

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    details: parseDetails(row.details),
    hasQr: Boolean(row.qrStoredName),
  }))
}
