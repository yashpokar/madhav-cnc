import { FEATURES } from '@/lib/features'
import type { Action, Resource } from '@/lib/permissions'

export type NavGroup = 'Overview' | 'Sell' | 'Money' | 'People' | 'Catalogue' | 'Administration' | 'Settings'

export type NavEntry = {
  href: string
  label: string
  capability: `${Resource}:${Action}`
  group?: NavGroup
  /** Only platform super-admins (global ADMIN) see and may open this. */
  superAdminOnly?: boolean
}

/** Grouped by the job being done, in the order people usually do it. */
const ALL_NAV_ENTRIES: readonly NavEntry[] = [
  { href: '/', label: 'Dashboard', capability: 'order:read', group: 'Overview' },
  { href: '/quotations', label: 'Quotations', capability: 'quotation:read', group: 'Sell' },
  { href: '/orders', label: 'Orders', capability: 'order:read', group: 'Sell' },
  { href: '/production', label: 'Production', capability: 'production:read', group: 'Sell' },
  { href: '/dispatch', label: 'Dispatch', capability: 'dispatch:read', group: 'Sell' },
  { href: '/invoices', label: 'Invoices', capability: 'invoice:read', group: 'Money' },
  { href: '/payments', label: 'Payments', capability: 'payment:read', group: 'Money' },
  { href: '/expenses', label: 'Expenses', capability: 'expense:read', group: 'Money' },
  { href: '/notes', label: 'Credit & debit notes', capability: 'note:read', group: 'Money' },
  { href: '/reports', label: 'Reports', capability: 'invoice:read', group: 'Money' },
  { href: '/statement', label: 'Order statement', capability: 'order:read', group: 'Money' },
  { href: '/customers', label: 'Customers', capability: 'customer:read', group: 'People' },
  { href: '/vendors', label: 'Vendors', capability: 'expense:read', group: 'People' },
  { href: '/partners', label: 'Architects & Carpenters', capability: 'partner:read', group: 'People' },
  { href: '/items', label: 'Items', capability: 'item:read', group: 'Catalogue' },
]

export const NAV_ENTRIES: readonly NavEntry[] = ALL_NAV_ENTRIES.filter(
  (entry) => FEATURES.notes || entry.href !== '/notes',
)

export const ADMIN_ENTRIES: readonly NavEntry[] = [
  { href: '/admin/users', label: 'Users', capability: 'user:update', group: 'Administration', superAdminOnly: true },
  { href: '/admin/companies', label: 'Companies', capability: 'user:update', group: 'Administration', superAdminOnly: true },
  { href: '/admin/activity', label: 'Activity log', capability: 'user:update', group: 'Administration', superAdminOnly: true },
  { href: '/settings/company', label: 'Company details', capability: 'settings:update', group: 'Settings' },
  { href: '/settings/payment-modes', label: 'Payment modes', capability: 'settings:update', group: 'Settings' },
]
