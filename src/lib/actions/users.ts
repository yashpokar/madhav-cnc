'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/session'
import { ROLE_LABELS } from '@/lib/permissions'
import { UserRole } from '@/generated/prisma/enums'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

const userIdSchema = z.string().min(1, 'A user must be selected')
const roleSchema = z.enum(UserRole)

async function countOtherActiveAdmins(userId: string) {
  return prisma.user.count({
    where: { role: 'ADMIN', isActive: true, id: { not: userId } },
  })
}

export async function activateUser(
  userId: string,
  role: UserRole,
): Promise<ActionResult> {
  const admin = await requireAdmin()

  const parsedId = userIdSchema.safeParse(userId)
  const parsedRole = roleSchema.safeParse(role)

  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0].message }
  }

  if (!parsedRole.success) {
    return { ok: false, error: 'Unknown role' }
  }

  const target = await prisma.user.findUnique({ where: { id: parsedId.data } })

  if (!target) {
    return { ok: false, error: 'User not found' }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      isActive: true,
      role: parsedRole.data,
      activatedAt: new Date(),
      activatedById: admin.id,
    },
  })

  revalidatePath('/admin/users')

  return {
    ok: true,
    message: `${target.email} activated as ${ROLE_LABELS[parsedRole.data]}`,
  }
}

export async function deactivateUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  const parsed = userIdSchema.safeParse(userId)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (parsed.data === admin.id) {
    return { ok: false, error: 'You cannot deactivate your own account' }
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data } })

  if (!target) {
    return { ok: false, error: 'User not found' }
  }

  if (target.role === 'ADMIN' && (await countOtherActiveAdmins(target.id)) === 0) {
    return { ok: false, error: 'At least one active administrator must remain' }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { isActive: false },
  })

  await prisma.session.deleteMany({ where: { userId: target.id } })

  revalidatePath('/admin/users')

  return { ok: true, message: `${target.email} deactivated` }
}

export async function changeUserRole(
  userId: string,
  role: UserRole,
): Promise<ActionResult> {
  const admin = await requireAdmin()

  const parsedId = userIdSchema.safeParse(userId)
  const parsedRole = roleSchema.safeParse(role)

  if (!parsedId.success) {
    return { ok: false, error: parsedId.error.issues[0].message }
  }

  if (!parsedRole.success) {
    return { ok: false, error: 'Unknown role' }
  }

  const target = await prisma.user.findUnique({ where: { id: parsedId.data } })

  if (!target) {
    return { ok: false, error: 'User not found' }
  }

  if (
    target.id === admin.id &&
    target.role === 'ADMIN' &&
    parsedRole.data !== 'ADMIN'
  ) {
    return { ok: false, error: 'You cannot remove your own administrator role' }
  }

  if (
    target.role === 'ADMIN' &&
    parsedRole.data !== 'ADMIN' &&
    (await countOtherActiveAdmins(target.id)) === 0
  ) {
    return { ok: false, error: 'At least one active administrator must remain' }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { role: parsedRole.data },
  })

  revalidatePath('/admin/users')

  return {
    ok: true,
    message: `${target.email} is now ${ROLE_LABELS[parsedRole.data]}`,
  }
}

export async function rejectUser(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin()

  const parsed = userIdSchema.safeParse(userId)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message }
  }

  if (parsed.data === admin.id) {
    return { ok: false, error: 'You cannot remove your own account' }
  }

  const target = await prisma.user.findUnique({ where: { id: parsed.data } })

  if (!target) {
    return { ok: false, error: 'User not found' }
  }

  if (target.isActive) {
    return {
      ok: false,
      error: 'Only pending users can be rejected. Deactivate this user instead.',
    }
  }

  await prisma.user.delete({ where: { id: target.id } })

  revalidatePath('/admin/users')

  return { ok: true, message: `${target.email} rejected and removed` }
}
