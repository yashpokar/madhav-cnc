import { prisma } from '@/lib/prisma'

/**
 * The vendor a typed name stands for. An existing vendor is matched ignoring
 * case and spacing, so "ABC traders" and "Abc Traders " are one vendor; an
 * unknown name creates a vendor with just the name, to be filled in later.
 */
export async function resolveVendor(rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ')

  const known = await prisma.vendor.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
    select: { id: true, name: true },
  })

  if (known) return known

  return prisma.vendor.create({
    data: { name },
    select: { id: true, name: true },
  })
}
