import { prisma } from '@/lib/prisma'
import type { PartnerType } from '@/generated/prisma/enums'

export async function listPartners({
  type,
  search,
  includeInactive = false,
}: {
  type?: PartnerType
  search?: string
  includeInactive?: boolean
} = {}) {
  const term = search?.trim()

  return prisma.partner.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(includeInactive ? {} : { isActive: true }),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { firmName: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
              { code: { contains: term, mode: 'insensitive' } },
              { city: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      type: true,
      name: true,
      firmName: true,
      phone: true,
      altPhone: true,
      email: true,
      city: true,
      pincode: true,
      isActive: true,
      _count: {
        select: { preferredByArchitect: true, preferredByCarpenter: true },
      },
    },
  })
}

export async function getPartner(id: string) {
  return prisma.partner.findUnique({ where: { id } })
}

export async function listPartnerOptions(type: PartnerType) {
  return prisma.partner.findMany({
    where: { type, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, firmName: true, city: true },
  })
}

export type PartnerListItem = Awaited<ReturnType<typeof listPartners>>[number]
export type PartnerOption = Awaited<ReturnType<typeof listPartnerOptions>>[number]
