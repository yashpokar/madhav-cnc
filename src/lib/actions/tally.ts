'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { reconcile } from '@/lib/queries/daybook'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'

const DATE = /^\d{4}-\d{2}-\d{2}$/

function day(value: string) {
  if (!DATE.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)

  return Number.isNaN(date.getTime()) ? null : date
}

/** Saves how many notes of one denomination were counted on a day. */
export async function setTallyCount(
  date: string,
  denomination: number,
  count: number,
): Promise<SimpleResult> {
  await requireCapability('expense:update')
  const tallyDate = day(date)

  if (!tallyDate || !Number.isInteger(denomination) || denomination <= 0) {
    return { ok: false, error: 'Invalid entry' }
  }

  if (!Number.isInteger(count) || count < 0 || count > 1_000_000) {
    return { ok: false, error: 'Enter a whole number of notes' }
  }

  if (count === 0) {
    await prisma.dayTallyCount.deleteMany({ where: { tallyDate, denomination } })
  } else {
    await prisma.dayTallyCount.upsert({
      where: { tallyDate_denomination: { tallyDate, denomination } },
      create: { tallyDate, denomination, count },
      update: { count },
    })
  }

  return { ok: true, message: 'Saved' }
}

/** Saves what a bank account showed on a day. */
export async function setTallyBank(
  date: string,
  bankAccountId: string,
  balance: number,
): Promise<SimpleResult> {
  await requireCapability('expense:update')
  const tallyDate = day(date)

  if (!tallyDate) return { ok: false, error: 'Invalid date' }

  if (!Number.isFinite(balance) || Math.abs(balance) > 99_999_999) {
    return { ok: false, error: 'Enter a valid amount' }
  }

  const bank = await prisma.bankAccount.findUnique({
    where: { id: bankAccountId },
    select: { id: true },
  })

  if (!bank) return { ok: false, error: 'Bank account not found' }

  if (balance === 0) {
    await prisma.dayTallyBank.deleteMany({ where: { tallyDate, bankAccountId } })
  } else {
    await prisma.dayTallyBank.upsert({
      where: { tallyDate_bankAccountId: { tallyDate, bankAccountId } },
      create: { tallyDate, bankAccountId, balance },
      update: { balance },
    })
  }

  return { ok: true, message: 'Saved' }
}

const done = (message: string): SimpleResult => {
  revalidatePath('/daybook')
  revalidatePath('/daybook/setup')

  return { ok: true, message }
}

export async function createBankAccount(name: string): Promise<SimpleResult> {
  await requireCapability('expense:update')
  const clean = name.trim()

  if (!clean) return { ok: false, error: 'Enter a name' }
  if (clean.length > 60) return { ok: false, error: 'That name is too long' }

  const exists = await prisma.bankAccount.findFirst({
    where: { name: { equals: clean, mode: 'insensitive' } },
    select: { id: true },
  })

  if (exists) return { ok: false, error: 'That bank account already exists' }

  const last = await prisma.bankAccount.aggregate({ _max: { sortOrder: true } })

  await prisma.bankAccount.create({
    data: { name: clean, sortOrder: (last._max.sortOrder ?? 0) + 1 },
  })

  return done(`${clean} added`)
}

export async function renameBankAccount(id: string, name: string): Promise<SimpleResult> {
  await requireCapability('expense:update')
  const clean = name.trim()

  if (!clean) return { ok: false, error: 'Enter a name' }
  if (clean.length > 60) return { ok: false, error: 'That name is too long' }

  const clash = await prisma.bankAccount.findFirst({
    where: { name: { equals: clean, mode: 'insensitive' }, NOT: { id } },
    select: { id: true },
  })

  if (clash) return { ok: false, error: 'That bank account already exists' }

  await prisma.bankAccount.update({ where: { id }, data: { name: clean } })

  return done('Renamed')
}

export async function setBankAccountActive(id: string, isActive: boolean): Promise<SimpleResult> {
  await requireCapability('expense:update')
  await prisma.bankAccount.update({ where: { id }, data: { isActive } })

  return done(isActive ? 'Shown in the day book' : 'Hidden from the day book')
}

export async function deleteBankAccount(id: string): Promise<SimpleResult> {
  await requireCapability('expense:delete')

  const found = await prisma.bankAccount.findUnique({ where: { id }, select: { id: true } })

  if (!found) return { ok: false, error: 'Bank account not found' }

  await prisma.bankAccount.delete({ where: { id } })

  return done('Bank account deleted')
}

export async function createDenomination(value: number): Promise<SimpleResult> {
  await requireCapability('expense:update')

  if (!Number.isInteger(value) || value <= 0 || value > 100_000) {
    return { ok: false, error: 'Enter a whole amount, like 500' }
  }

  const exists = await prisma.cashDenomination.findUnique({
    where: { value },
    select: { id: true },
  })

  if (exists) return { ok: false, error: `₹${value} is already in the list` }

  await prisma.cashDenomination.create({ data: { value } })

  return done(`₹${value} added`)
}

export async function setDenominationActive(id: string, isActive: boolean): Promise<SimpleResult> {
  await requireCapability('expense:update')
  await prisma.cashDenomination.update({ where: { id }, data: { isActive } })

  return done(isActive ? 'Shown in the day book' : 'Hidden from the day book')
}

export async function deleteDenomination(id: string): Promise<SimpleResult> {
  await requireCapability('expense:delete')

  const found = await prisma.cashDenomination.findUnique({ where: { id }, select: { id: true } })

  if (!found) return { ok: false, error: 'Denomination not found' }

  await prisma.cashDenomination.delete({ where: { id } })

  return done('Denomination deleted')
}

/**
 * Signs off a day: records that the cash and bank counts were checked. The
 * figures come from what is saved, not from the browser, and a difference does
 * not block the sign-off; it is stored so it can be looked at later.
 */
export async function closeDay(date: string): Promise<SimpleResult> {
  const user = await requireCapability('expense:update')
  const closeDate = day(date)

  if (!closeDate) return { ok: false, error: 'Invalid date' }

  const [counts, banks, check] = await Promise.all([
    prisma.dayTallyCount.findMany({ where: { tallyDate: closeDate } }),
    prisma.dayTallyBank.aggregate({ where: { tallyDate: closeDate }, _sum: { balance: true } }),
    reconcile(closeDate),
  ])

  const cashCounted = counts.reduce((total, row) => total + row.denomination * row.count, 0)
  const bankCounted = banks._sum.balance?.toNumber() ?? 0

  await prisma.dayClose.upsert({
    where: { closeDate },
    create: {
      closeDate,
      cashCounted,
      cashExpected: check.cash.expected,
      bankCounted,
      bankExpected: check.bank.expected,
      closedById: user.id,
    },
    update: {
      cashCounted,
      cashExpected: check.cash.expected,
      bankCounted,
      bankExpected: check.bank.expected,
      closedById: user.id,
      closedAt: new Date(),
    },
  })

  return done('Day confirmed')
}

export async function reopenDay(date: string): Promise<SimpleResult> {
  await requireCapability('expense:update')
  const closeDate = day(date)

  if (!closeDate) return { ok: false, error: 'Invalid date' }

  await prisma.dayClose.deleteMany({ where: { closeDate } })

  return done('Day reopened')
}
