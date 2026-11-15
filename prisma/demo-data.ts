// Local sample data for eyeballing screens. Not used in production.
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

const d = (offset: number) => {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + offset))
}

async function main() {
  const customers = await Promise.all(
    [
      ['C-0001', 'Vijay Interiors', '9876500001', 'Surat'],
      ['C-0002', 'Sunilbhai Diva', '9876500002', 'Navsari'],
      ['C-0003', 'Rujulbhai Shah', '9876500003', 'Vapi'],
    ].map(([code, name, phone, city]) =>
      prisma.customer.upsert({ where: { code }, update: {}, create: { code, name, phone, city } }),
    ),
  )

  const line = (n: number, desc: string, qty: number, rate: number) => {
    const amount = qty * rate
    const taxAmount = amount * 0.18
    return {
      position: n,
      description: desc,
      unit: 'SQFT' as const,
      quantity: qty,
      rate,
      taxRatePercent: 18,
      amount,
      taxAmount,
      lineTotal: amount + taxAmount,
    }
  }

  const statuses = ['DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'COMPLETED', 'CANCELLED'] as const
  for (const [i, status] of statuses.entries()) {
    const number = `ORD-${String(i + 1).padStart(4, '0')}`
    if (await prisma.order.findUnique({ where: { number } })) continue
    const base = 1000 * (i + 1)
    const order = await prisma.order.create({
      data: {
        number,
        status,
        customerId: customers[i % 3].id,
        subject: `Wardrobe set ${i + 1}`,
        orderDate: d(-3 * (i + 1)),
        dueDate: d(i < 3 ? -2 + i * 3 : 5),
        subtotal: base,
        taxableAmount: base,
        taxAmount: base * 0.18,
        total: base * 1.18,
        advanceAmount: i === 1 ? 500 : 0,
        lines: { create: [line(1, 'Laminate panel', 10, base / 10)] },
      },
    })
    if (i === 1) {
      await prisma.payment.create({
        data: {
          number: `ADV-${number}`,
          customerId: customers[1].id,
          amount: 500,
          mode: 'UPI',
          paidOn: d(-6),
          orderId: order.id,
          notes: `Advance for order ${number}`,
        },
      })
    }
  }

  const vendors = await Promise.all(
    [
      ['Shree Hardware', '9825012345', 'Surat', 'Hinges, channels and handles'],
      ['Gujarat Laminates', '9825099999', 'Ahmedabad', 'Laminate sheets, monthly'],
      ['Torrent Power', null, 'Surat', 'Workshop electricity'],
    ].map(async ([name, phone, city, description]) =>
      (await prisma.vendor.findFirst({ where: { name: name as string } })) ??
      prisma.vendor.create({ data: { name: name as string, phone, city, description } }),
    ),
  )

  if ((await prisma.expense.count()) === 0) {
    for (const [i, v] of vendors.entries()) {
      for (let k = 0; k < 3; k++) {
        const amount = 1500 * (i + 1) + k * 300
        await prisma.expense.create({
          data: {
            number: `EXP-${i}${k}`,
            expenseDate: d(-k * 4 - i),
            payeeName: v.name,
            vendorId: v.id,
            amount,
            taxAmount: 0,
            total: amount,
            paymentMode: k % 2 ? 'CASH' : 'BANK_TRANSFER',
          },
        })
      }
    }
  }

  if ((await prisma.quotation.count()) === 0) {
    await prisma.quotation.create({
      data: {
        number: 'QT-0001',
        status: 'SENT',
        customerId: customers[0].id,
        quotationDate: d(-5),
        validUntil: d(2),
        subtotal: 8000,
        taxableAmount: 8000,
        taxAmount: 1440,
        total: 9440,
        lines: { create: [line(1, 'Modular kitchen', 40, 200)] },
      },
    })
  }
  console.log('demo data ready')
}

main().then(() => process.exit(0))
