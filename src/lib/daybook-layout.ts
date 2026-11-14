import { z } from 'zod'

/**
 * How the day book looks. Every field has a default and a bad or missing
 * value falls back to it, so a layout saved by an older version (or none at
 * all) always reads cleanly.
 */
export const daybookLayoutSchema = z.object({
  density: z.enum(['comfortable', 'compact']).catch('comfortable'),
  sides: z.enum(['side-by-side', 'stacked']).catch('side-by-side'),
  tally: z.object({
    show: z.boolean().catch(true),
    order: z.enum(['banks-first', 'notes-first']).catch('banks-first'),
  }),
})

export type DaybookLayout = z.output<typeof daybookLayoutSchema>

/** Reads whatever was stored (or nothing) into a complete layout. */
export function readDaybookLayout(stored: unknown): DaybookLayout {
  const input =
    stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}

  return daybookLayoutSchema.parse({
    ...input,
    tally:
      input.tally && typeof input.tally === 'object' ? input.tally : {},
  })
}
