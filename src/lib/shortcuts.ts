/** Pure keyboard-shortcut logic; the DOM wiring lives in components/shortcuts.tsx. */

export const GO_TARGETS = {
  d: { href: '/', label: 'Dashboard' },
  o: { href: '/orders', label: 'Orders' },
  i: { href: '/invoices', label: 'Invoices' },
  p: { href: '/payments', label: 'Payments' },
  c: { href: '/customers', label: 'Customers' },
} as const

export type GoKey = keyof typeof GO_TARGETS

/** A "g" press only counts as a chord starter for this long. */
export const CHORD_MS = 1200

export type ShortcutAction =
  | { type: 'create' }
  | { type: 'help' }
  | { type: 'focus-search' }
  | { type: 'go'; href: string }

export type ChordState = { pendingG: boolean; at: number }

export const IDLE_CHORD: ChordState = { pendingG: false, at: 0 }

/** Which keys are listed in the cheat sheet, in display order. */
export const SHORTCUT_LIST: readonly { keys: string[]; label: string }[] = [
  { keys: ['⌘/Ctrl', 'K'], label: 'Search and quick create' },
  { keys: ['C'], label: 'Open the Create menu' },
  { keys: ['G', 'D'], label: 'Go to Dashboard' },
  { keys: ['G', 'O'], label: 'Go to Orders' },
  { keys: ['G', 'I'], label: 'Go to Invoices' },
  { keys: ['G', 'P'], label: 'Go to Payments' },
  { keys: ['G', 'C'], label: 'Go to Customers' },
  { keys: ['/'], label: 'Focus the list search' },
  { keys: ['?'], label: 'Show this cheat sheet' },
]

export type KeyTarget = {
  tagName?: string
  isContentEditable?: boolean
  /** Set when the target sits inside an open dialog or menu. */
  inDialog?: boolean
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/** True when a bare-key shortcut must not fire. */
export function isTypingContext(target: KeyTarget | null, dialogOpen: boolean): boolean {
  if (dialogOpen) return true
  if (!target) return false

  return Boolean(
    (target.tagName && TYPING_TAGS.has(target.tagName.toUpperCase())) ||
      target.isContentEditable ||
      target.inDialog,
  )
}

/**
 * Feeds one key press through the shortcut table. Returns the action to run
 * (if any) and the next chord state. Modified keys are never shortcuts here.
 */
export function resolveKey(
  state: ChordState,
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean },
  now: number,
): { action: ShortcutAction | null; state: ChordState } {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return { action: null, state: IDLE_CHORD }
  }

  const key = event.key
  const chordLive = state.pendingG && now - state.at <= CHORD_MS

  if (chordLive) {
    const target = GO_TARGETS[key.toLowerCase() as GoKey]

    if (target) return { action: { type: 'go', href: target.href }, state: IDLE_CHORD }
  }

  if (key === 'g' || key === 'G') return { action: null, state: { pendingG: true, at: now } }
  if (key === 'c') return { action: { type: 'create' }, state: IDLE_CHORD }
  if (key === '/') return { action: { type: 'focus-search' }, state: IDLE_CHORD }
  if (key === '?') return { action: { type: 'help' }, state: IDLE_CHORD }

  return { action: null, state: IDLE_CHORD }
}
