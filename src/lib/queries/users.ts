import { prisma } from '@/lib/prisma'

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ isActive: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      isActive: true,
      phone: true,
      employeeCode: true,
      activatedAt: true,
      createdAt: true,
      activatedBy: { select: { name: true, email: true } },
      accounts: { select: { providerId: true } },
    },
  })
}

export async function countPendingUsers() {
  return prisma.user.count({ where: { isActive: false } })
}

export type UserListItem = Awaited<ReturnType<typeof listUsers>>[number]
