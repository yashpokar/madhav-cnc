import { z } from 'zod'

const label = (fallback: string) => z.string().trim().min(1).max(40).catch(fallback)

/**
 * How the day book looks. Every field has a default and a bad or missing
 * value falls back to it, so a layout saved by an older version (or none at
 * all) always reads cleanly.
 */
export const daybookLayoutSchema = z.object({
  density: z.enum(['comfortable', 'compact']).catch('comfortable'),
  sides: z.enum(['side-by-side', 'stacked']).catch('side-by-side'),
  showBroughtForward: z.boolean().catch(true),
  showCarriedForward: z.boolean().catch(true),
  tally: z
    .object({
      show: z.boolean().catch(true),
      order: z.enum(['banks-first', 'notes-first']).catch('banks-first'),
      showBanks: z.boolean().catch(true),
      showNotes: z.boolean().catch(true),
      showCount: z.boolean().catch(true),
      showTotal: z.boolean().catch(true),
      titleLabel: label('Banks and cash counted'),
      modeLabel: label('Mode'),
      countLabel: label('Count'),
      amountLabel: label('Amount'),
      totalLabel: label('Grand TOTAL'),
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
