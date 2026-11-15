import { prisma } from '@/lib/prisma'
import type { GoodsReceiptStatus } from '@/generated/prisma/enums'

export async function listReceipts({
  search,
  status,
}: { search?: string; status?: GoodsReceiptStatus } = {}) {
  const term = search?.trim()

  return prisma.goodsReceipt.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { number: { contains: term, mode: 'insensitive' } },
              { vendor: { name: { contains: term, mode: 'insensitive' } } },
              { bill: { number: { contains: term, mode: 'insensitive' } } },
              { po: { number: { contains: term, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      status: true,
      receivedOn: true,
      createdAt: true,
      vendor: { select: { id: true, name: true } },
      bill: { select: { id: true, number: true } },
      po: { select: { id: true, number: true } },
      _count: { select: { lines: true } },
    },
  })
}

export function countReceipts() {
  return prisma.goodsReceipt.count()
}

export async function getReceipt(id: string) {
  const receipt = await prisma.goodsReceipt.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, name: true } },
      bill: { select: { id: true, number: true } },
      po: { select: { id: true, number: true } },
      lines: {
        orderBy: { id: 'asc' },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true, stockTracked: true } },
          material: { select: { id: true, name: true, stockTracked: true } },
        },
      },
    },
  })

  if (!receipt) return null

  return {
    ...receipt,
    lines: receipt.lines.map((line) => ({
      id: line.id,
      qty: line.qty.toNumber(),
      unitCost: line.unitCost.toNumber(),
      itemId: line.item?.id ?? null,
      materialId: line.material?.id ?? null,
      name: line.item?.name ?? line.material?.name ?? 'Removed item',
      code: line.item?.code ?? null,
      unit: line.item?.unit ?? null,
      tracked: Boolean(line.item?.stockTracked || line.material?.stockTracked),
    })),
  }
}

export type ReceiptDetail = NonNullable<Awaited<ReturnType<typeof getReceipt>>>

/** Receipts against a bill or an order, for the "Goods received" panels. */
export function receiptsFor(source: { billId: string } | { poId: string }) {
  return prisma.goodsReceipt.findMany({
    where: source,
    orderBy: [{ receivedOn: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, number: true, status: true, receivedOn: true, _count: { select: { lines: true } } },
  })
}
