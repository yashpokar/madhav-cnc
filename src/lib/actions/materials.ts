'use server'

// Thin web adapter: permission check, the service in
// src/lib/services/materials.ts, then cache refresh.

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import * as materials from '@/lib/services/materials'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { SimpleResult }

function refresh() {
  revalidatePath('/items')
  revalidatePath('/items/materials')
}

export async function createMaterial(name: string): Promise<SimpleResult> {
  const user = await requireCapability('item:create')

  const result = await materials.createMaterial(user, name)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  refresh()

  return { ok: true, message: result.message }
}

export async function renameMaterial(
  id: string,
  name: string,
): Promise<SimpleResult> {
  await requireCapability('item:update')

  const result = await materials.renameMaterial(id, name)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  refresh()

  return { ok: true, message: result.message }
}

export async function moveMaterial(
  id: string,
  direction: 'up' | 'down',
): Promise<SimpleResult> {
  await requireCapability('item:update')

  const result = await materials.moveMaterial(id, direction)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  refresh()

  return { ok: true, message: result.message }
}

export async function setMaterialActive(
  id: string,
  isActive: boolean,
): Promise<SimpleResult> {
  await requireCapability('item:update')

  const result = await materials.setMaterialActive(id, isActive)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  refresh()

  return { ok: true, message: result.message }
}

export async function deleteMaterial(id: string) {
  await requireCapability('item:delete')

  const result = await materials.deleteMaterial(id)

  if (!result.ok) {
    return { ok: false as const, error: result.error }
  }

  revalidatePath('/items/materials')
  revalidatePath('/items')

  return { ok: true as const, message: result.message }
}

/** Turns stock tracking on or off for a material, and sets its reorder level. */
export async function setMaterialStock(
  id: string,
  stockTracked: boolean,
  reorderLevel: number | null,
): Promise<SimpleResult> {
  await requireCapability('item:update')

  const result = await materials.setMaterialStock(id, stockTracked, reorderLevel)

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/items/materials')
  revalidatePath('/stock')

  return { ok: true, message: result.message }
}
