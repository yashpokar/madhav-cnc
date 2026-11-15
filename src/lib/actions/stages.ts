'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import type { SimpleResult } from '@/lib/actions/quotations'
import * as stages from '@/lib/services/stages'

export type { SimpleResult }

/**
 * Thin adapters over src/lib/services/stages.ts: capability check, the service
 * call, then a refresh of the production pages when something changed.
 */
function finish(result: SimpleResult): SimpleResult {
  if (result.ok) {
    revalidatePath('/production')
    revalidatePath('/production/stages')
  }

  return result
}

export async function createStage(name: string): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.createStage(name))
}

export async function renameStage(
  id: string,
  name: string,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.renameStage(id, name))
}

export async function moveStage(
  id: string,
  direction: 'up' | 'down',
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.moveStage(id, direction))
}

export async function setStageStatus(
  id: string,
  linkedStatus: string | null,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.setStageStatus(id, linkedStatus))
}

export async function setStageActive(
  id: string,
  isActive: boolean,
): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.setStageActive(id, isActive))
}

export async function deleteStage(id: string): Promise<SimpleResult> {
  await requireCapability('settings:update')

  return finish(await stages.deleteStage(id))
}
