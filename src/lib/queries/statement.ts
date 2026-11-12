import { prisma } from '@/lib/prisma'

export const NOT_STARTED = '__not_started__'
export const FINISHED = '__finished__'

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * One row per order: who it is for, what it is made of, where it is in the
 * workshop and how much of it has been billed and paid.
 */
export async function getOverallStatement() {
  const orders = await prisma.order.findMany({
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      number: true,
      status: true,
      subject: true,
      orderDate: true,
      dueDate: true,
      total: true,
      customer: { select: { id: true, name: true } },
      lines: {
        select: { item: { select: { material: { select: { name: true } } } } },
      },
      productionTasks: {
        orderBy: { position: 'asc' },
        select: { status: true, stage: { select: { name: true } } },
      },
      invoices: {
        where: { status: 'ISSUED' },
        select: {
          total: true,
          advanceAdjusted: true,
          paymentAllocations: { select: { amount: true } },
          writeOffs: { select: { amount: true } },
        },
      },
    },
  })

  return orders.map((order) => {
    const materials = [
      ...new Set(
        order.lines
          .map((line) => line.item?.material?.name)
          .filter((name): name is string => Boolean(name)),
      ),
    ].sort()

    const open = order.productionTasks.filter(
      (task) => task.status !== 'DONE' && task.status !== 'SKIPPED',
    )
    const current =
      open.find((task) => task.status === 'IN_PROGRESS') ??
      open.find((task) => task.status === 'ON_HOLD') ??
      open[0]
    const stageKey =
      order.productionTasks.length === 0
        ? NOT_STARTED
        : current
          ? current.stage.name
          : FINISHED

    let invoiced = 0
    let received = 0
    let writtenOff = 0

    for (const invoice of order.invoices) {
      invoiced += invoice.total.toNumber()
      received +=
        invoice.advanceAdjusted.toNumber() +
        invoice.paymentAllocations.reduce((s, a) => s + a.amount.toNumber(), 0)
      writtenOff += invoice.writeOffs.reduce((s, w) => s + w.amount.toNumber(), 0)
    }

    return {
      id: order.id,
      number: order.number,
      subject: order.subject,
      status: order.status,
      orderDate: order.orderDate,
      dueDate: order.dueDate,
      customer: order.customer,
      materials,
      stageKey,
      stageStatus: current?.status ?? null,
      total: order.total.toNumber(),
      invoiced: round2(invoiced),
      received: round2(received),
      writtenOff: round2(writtenOff),
      due: round2(invoiced - received - writtenOff),
    }
  })
}

export type StatementRow = Awaited<ReturnType<typeof getOverallStatement>>[number]
