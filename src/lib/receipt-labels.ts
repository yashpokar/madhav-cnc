import type { MovementType } from '@/lib/stock-rules'

export const RECEIPT_STATUS_LABELS = {
  POSTED: 'Posted',
  CANCELLED: 'Cancelled',
} as const

export const RECEIPT_STATUS_COLORS = {
  POSTED: 'lime',
  CANCELLED: 'red',
} as const

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  OPENING: 'Opening stock',
  PURCHASE: 'Purchase',
  PURCHASE_RETURN: 'Purchase return',
  ADJUSTMENT: 'Adjustment',
  ISSUE: 'Issue',
}

export const STOCK_STATE_LABELS = {
  negative: 'Negative',
  out: 'Out',
  low: 'Low',
  ok: 'OK',
} as const

export const STOCK_STATE_COLORS = {
  negative: 'red',
  out: 'red',
  low: 'amber',
  ok: 'lime',
} as const
