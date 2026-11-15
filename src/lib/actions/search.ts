'use server'

import { requireUser } from '@/lib/session'
import { searchFor, type SearchHit } from '@/lib/services/search'

export type { SearchHit }

export async function searchEverything(query: string): Promise<SearchHit[]> {
  const user = await requireUser()

  return searchFor(user.role, query)
}
