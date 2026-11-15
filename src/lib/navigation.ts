import { FEATURES } from '@/lib/features'
import type { IndustryModules, IndustryTemplate } from '@/lib/industry'
import type { Action, Resource } from '@/lib/permissions'

export type NavGroup = 'Overview' | 'Sell' | 'Buy' | 'Money' | 'People' | 'Catalogue' | 'Administration' | 'Settings'

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
  { href: '/purchase-orders', label: 'Purchase orders', capability: 'purchase:read', group: 'Buy' },
  { href: '/purchase-bills', label: 'Purchase bills', capability: 'purchase:read', group: 'Buy' },
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
  // Not superAdminOnly: any administrator of the active company manages its team.
  { href: '/settings/team', label: 'Team', capability: 'user:update', group: 'Settings' },
  { href: '/settings/company', label: 'Company details', capability: 'settings:update', group: 'Settings' },
  { href: '/settings/payment-modes', label: 'Payment modes', capability: 'settings:update', group: 'Settings' },
  { href: '/settings/opening-balances', label: 'Opening balances', capability: 'settings:update', group: 'Settings' },
]

const MODULE_BY_HREF: Record<string, keyof IndustryModules> = {
  '/production': 'production',
  '/dispatch': 'dispatch',
  '/partners': 'partners',
}

/**
 * Presentation only: hides entries for modules the company's industry marks
 * irrelevant and applies the industry's word for orders. Permissions, data and
 * URLs are untouched, so a hidden page still opens if someone goes to it.
 */
export function applyIndustry(entries: readonly NavEntry[], industry: IndustryTemplate): NavEntry[] {
  return entries
    .filter((entry) => {
      const area = MODULE_BY_HREF[entry.href]

      return !area || industry.modules[area]
    })
    .map((entry) => (entry.href === '/orders' ? { ...entry, label: industry.terms.orders } : entry))
}
