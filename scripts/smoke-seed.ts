// Seeds one customer into the company named by SEED_COMPANY_ID, through the
// scoped prisma client (the same path the app uses). Used by scripts/smoke.mjs.
//   SEED_COMPANY_ID=<id> tsx scripts/smoke-seed.ts <name>
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'

async function main() {
  const companyId = process.env.SEED_COMPANY_ID
  const name = process.argv[2]

  if (!companyId || !name) throw new Error('SEED_COMPANY_ID and a customer name are required')

  const customer = await prisma.customer.create({
    data: { code: `SMK-${Date.now()}`, name, phone: '9000000000', city: 'Smoketown' },
  })

  console.log(`seeded ${customer.id} (${name}) into ${companyId}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
