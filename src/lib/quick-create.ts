/** Matches typed text such as "new invoice" against the Create actions a person may use. */

export type CreateCommand = { key: string; label: string; href: string; words: string[] }

/** "Orders" / "Events" / "Bookings" to the singular word the industry uses. */
export function singularTerm(plural: string): string {
  return plural.replace(/ies$/i, 'y').replace(/s$/i, '') || 'Order'
}

const PREFIX = /^(new|add|create|make|\+)\s*/i

/**
 * A leading "new/add/create" is dropped and the rest must be a prefix of the
 * label or one of its alias words. A bare verb lists every command. Plain text
 * without a verb needs two characters to match.
 */
export function matchCreateCommands(query: string, commands: readonly CreateCommand[]): CreateCommand[] {
  const raw = query.trim().toLowerCase()

  if (!raw) return []

  const hasVerb = PREFIX.test(raw)
  const rest = raw.replace(PREFIX, '').trim()

  if (!hasVerb && rest.length < 2) return []

  return commands.filter(
    (command) =>
      rest === '' || [command.label, ...command.words].some((word) => word.toLowerCase().startsWith(rest)),
  )
}
