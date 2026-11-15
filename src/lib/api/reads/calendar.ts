import { ApiError } from '@/lib/api/errors'
import { money } from '@/lib/api/reads/format'
import { LAYER_KEYS, addDays, isDayKey, parseLayers, type LayerKey } from '@/lib/calendar'
import { can } from '@/lib/permissions'
import type { CalendarItem } from '@/lib/queries/calendar'
import type { UserRole } from '@/generated/prisma/enums'

/** The longest range one call may ask for (the app shows a month, plus padding). */
export const MAX_CALENDAR_DAYS = 62

/** Layers this role may see: each needs the capability of what it shows. */
export function allowedLayers(role: UserRole): LayerKey[] {
  return LAYER_KEYS.filter((layer) => {
    if (layer === 'orders') return can(role, 'order:read')
    if (layer === 'deliveries') return can(role, 'dispatch:read')
    if (layer === 'invoices') return can(role, 'invoice:read')

    return can(role, 'payment:read')
  })
}

/**
 * The layers to read: those asked for (all when none are) that the role may see.
 * Asking for a layer the role may not see is refused rather than silently emptied.
 */
export function resolveLayers(role: UserRole, raw: string | undefined): LayerKey[] {
  const allowed = allowedLayers(role)

  if (allowed.length === 0) throw new ApiError('FORBIDDEN', 'You do not have permission to do that.')

  if (raw === undefined) return allowed

  const asked = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const unknown = asked.filter((layer) => !(LAYER_KEYS as readonly string[]).includes(layer))

  if (unknown.length > 0) {
    throw new ApiError('VALIDATION_FAILED', 'Unknown calendar layer.', {
      fields: { layers: `Use ${LAYER_KEYS.join(', ')}` },
    })
  }

  const denied = asked.filter((layer) => !allowed.includes(layer as LayerKey))

  if (denied.length > 0) {
    throw new ApiError('FORBIDDEN', 'You do not have permission to do that.')
  }

  return parseLayers(raw, allowed)
}

export function assertRange(from: string, to: string) {
  if (!isDayKey(from) || !isDayKey(to) || to <= from) {
    throw new ApiError('VALIDATION_FAILED', 'The range is not valid.', {
      fields: { to: 'to must be after from' },
    })
  }

  if (to > addDays(from, MAX_CALENDAR_DAYS)) {
    throw new ApiError('VALIDATION_FAILED', 'The range is too long.', {
      fields: { to: `At most ${MAX_CALENDAR_DAYS} days` },
    })
  }
}

/** One calendar entry for the wire: money as decimal strings, everything else as the query gives it. */
export function calendarItemOut(item: CalendarItem) {
  switch (item.kind) {
    case 'order':
      return { ...item, total: money(item.total), received: money(item.received), balance: money(item.balance) }
    case 'invoice':
      return { ...item, total: money(item.total), due: money(item.due) }
    case 'payments':
      return {
        ...item,
        total: money(item.total),
        payments: item.payments.map((payment) => ({ ...payment, amount: money(payment.amount) })),
      }
    default:
      return item
  }
}
