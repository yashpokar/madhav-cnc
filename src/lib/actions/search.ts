'use server'

import { prisma } from '@/lib/prisma'
import { can } from '@/lib/permissions'
import { requireUser } from '@/lib/session'

export type SearchHit = {
  id: string
  group: string
  title: string
  subtitle: string
  href: string
}

const LIMIT = 5

export async function searchEverything(query: string): Promise<SearchHit[]> {
  const user = await requireUser()
  const term = query.trim()

  if (term.length < 2) {
    return []
  }

  const match = { contains: term, mode: 'insensitive' as const }
  const role = user.role

  const [customers, partners, items, quotations, orders, invoices] =
    await Promise.all([
      can(role, 'customer:read')
        ? prisma.customer.findMany({
            where: {
              OR: [{ name: match }, { code: match }, { phone: { contains: term } }],
            },
            take: LIMIT,
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true, phone: true },
          })
        : [],
      can(role, 'partner:read')
        ? prisma.partner.findMany({
            where: { OR: [{ name: match }, { firmName: match }, { code: match }] },
            take: LIMIT,
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true, type: true },
          })
        : [],
      can(role, 'item:read')
        ? prisma.item.findMany({
            where: { OR: [{ name: match }, { code: match }, { brand: match }] },
            take: LIMIT,
            orderBy: { name: 'asc' },
            select: { id: true, name: true, code: true },
          })
        : [],
      can(role, 'quotation:read')
        ? prisma.quotation.findMany({
            where: {
              OR: [
                { number: match },
                { subject: match },
                { customer: { name: match } },
              ],
            },
            take: LIMIT,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              number: true,
              subject: true,
              customer: { select: { name: true } },
            },
          })
        : [],
      can(role, 'order:read')
        ? prisma.order.findMany({
            where: {
              OR: [
                { number: match },
                { subject: match },
                { customerPoNumber: match },
                { customer: { name: match } },
              ],
            },
            take: LIMIT,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              number: true,
              subject: true,
              customer: { select: { name: true } },
            },
          })
        : [],
      can(role, 'invoice:read')
        ? prisma.invoice.findMany({
            where: { OR: [{ number: match }, { customer: { name: match } }] },
            take: LIMIT,
            orderBy: { createdAt: 'desc' },
            select: { id: true, number: true, customer: { select: { name: true } } },
          })
        : [],
    ])

  return [
    ...customers.map((row) => ({
      id: `c-${row.id}`,
      group: 'Customers',
      title: row.name,
      subtitle: `${row.code} · ${row.phone}`,
      href: `/customers/${row.id}`,
    })),
    ...quotations.map((row) => ({
      id: `q-${row.id}`,
      group: 'Quotations',
      title: row.number,
      subtitle: [row.customer.name, row.subject].filter(Boolean).join(' · '),
      href: `/quotations/${row.id}`,
    })),
    ...orders.map((row) => ({
      id: `o-${row.id}`,
      group: 'Orders',
      title: row.number,
      subtitle: [row.customer.name, row.subject].filter(Boolean).join(' · '),
      href: `/orders/${row.id}`,
    })),
    ...invoices.map((row) => ({
      id: `i-${row.id}`,
      group: 'Invoices',
      title: row.number,
      subtitle: row.customer.name,
      href: `/invoices/${row.id}`,
    })),
    ...partners.map((row) => ({
      id: `p-${row.id}`,
      group: 'Architects & carpenters',
      title: row.name,
      subtitle: `${row.code} · ${row.type === 'ARCHITECT' ? 'Architect' : 'Carpenter'}`,
      href: `/partners/${row.id}`,
    })),
    ...items.map((row) => ({
      id: `m-${row.id}`,
      group: 'Items',
      title: row.name,
      subtitle: row.code,
      href: `/items/${row.id}`,
    })),
  ]
}
