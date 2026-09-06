import 'dotenv/config'
import { auth } from '../src/lib/auth'
import { prisma } from '../src/lib/prisma'

const EXPENSE_CATEGORIES = [
  'Raw material',
  'Hardware & fittings',
  'Job work',
  'Consumables',
  'Salary & wages',
  'Rent',
  'Electricity',
  'Machine maintenance',
  'Transport & freight',
  'Marketing',
  'Office & admin',
  'Bank & finance charges',
  'Taxes & fees',
  'Other',
]

async function seedExpenseCategories() {
  for (const [index, name] of EXPENSE_CATEGORIES.entries()) {
    await prisma.expenseCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: (index + 1) * 10 },
    })
  }

  console.log(`Ensured ${EXPENSE_CATEGORIES.length} expense categories`)
}

async function main() {
  await seedExpenseCategories()

  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@madhavcnc.local'
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!'
  const name = process.env.SEED_ADMIN_NAME ?? 'Administrator'

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: { role: 'ADMIN', isActive: true, activatedAt: new Date() },
    })
    console.log(`Admin already present, ensured active: ${updated.email}`)
    return
  }

  await auth.api.signUpEmail({
    body: { email, password, name },
  })

  const admin = await prisma.user.update({
    where: { email },
    data: {
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
      activatedAt: new Date(),
    },
  })

  console.log(`Created admin: ${admin.email}`)
  console.log(`Password: ${password}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
