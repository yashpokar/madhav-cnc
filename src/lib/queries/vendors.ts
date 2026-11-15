import { prisma } from '@/lib/prisma'

export async function listVendors({
  search,
  includeInactive = false,
}: {
  search?: string
  includeInactive?: boolean
} = {}) {
  const term = search?.trim()

  const [vendors, totals] = await Promise.all([
    prisma.vendor.findMany({
      where: {
        ...(includeInactive ? {} : { isActive: true }),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { contactName: { contains: term, mode: 'insensitive' } },
                { phone: { contains: term } },
                { gstin: { contains: term, mode: 'insensitive' } },
                { city: { contains: term, mode: 'insensitive' } },
                { email: { contains: term, mode: 'insensitive' } },
                { description: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
    }),
    prisma.expense.groupBy({
      by: ['vendorId'],
      where: { vendorId: { not: null } },
      _sum: { total: true },
      _count: { _all: true },
      _max: { expenseDate: true },
    }),
  ])

  const byVendor = new Map(totals.map((row) => [row.vendorId, row]))

  return vendors.map((vendor) => {
    const row = byVendor.get(vendor.id)

    return {
      ...vendor,
      spent: row?._sum.total?.toNumber() ?? 0,
      bills: row?._count._all ?? 0,
      lastPaid: row?._max.expenseDate ?? null,
    }
  })
}

export async function getVendor(id: string) {
  const vendor = await prisma.vendor.findUnique({
    where: { id },
    include: {
      expenses: {
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        take: 25,
        select: {
          id: true,
          number: true,
          expenseDate: true,
          description: true,
          paymentMode: true,
          total: true,
          channel: { select: { name: true } },
        },
      },
    },
  })

  if (!vendor) return null

  const totals = await prisma.expense.aggregate({
    where: { vendorId: id },
    _sum: { total: true },
    _count: { _all: true },
  })

  return {
    ...vendor,
    expenses: vendor.expenses.map((e) => ({ ...e, total: e.total.toNumber() })),
    spent: totals._sum.total?.toNumber() ?? 0,
    bills: totals._count._all,
  }
}

/** Active vendors for pickers: the name, plus a line to tell similar ones apart. */
/**
 * Everyone an expense can be paid to: vendors, plus the architects and
 * carpenters from Partners (who are often paid commission), marked as such.
 * A partner who already has a vendor of the same name is listed once.
 */
export async function listVendorOptions() {
  const [vendors, partners] = await Promise.all([
    prisma.vendor.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, city: true, description: true },
    }),
    prisma.partner.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, type: true, phone: true, city: true },
    }),
  ])

  const taken = new Set(vendors.map((row) => row.name.trim().toLowerCase()))

  const fromVendors = vendors.map((row) => ({
    id: row.id,
    name: row.name,
    detail: [row.phone, row.city].filter(Boolean).join(' · ') || row.description || '',
  }))

  const fromPartners = partners
    .filter((row) => !taken.has(row.name.trim().toLowerCase()))
    .map((row) => ({
      id: `partner:${row.id}`,
      name: row.name,
      detail: [row.type === 'ARCHITECT' ? 'Architect' : 'Carpenter', row.phone, row.city]
        .filter(Boolean)
        .join(' · '),
    }))

  return [...fromVendors, ...fromPartners].sort((a, b) => a.name.localeCompare(b.name))
}
