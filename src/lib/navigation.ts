import type { Action, Resource } from '@/lib/permissions'

export type NavEntry = {
  href: string
  label: string
  capability: `${Resource}:${Action}`
}

export const NAV_ENTRIES: readonly NavEntry[] = [
  { href: '/', label: 'Dashboard', capability: 'order:read' },
  { href: '/customers', label: 'Customers', capability: 'customer:read' },
  { href: '/partners', label: 'Architects & Carpenters', capability: 'partner:read' },
  { href: '/items', label: 'Items', capability: 'item:read' },
  { href: '/quotations', label: 'Quotations', capability: 'quotation:read' },
  { href: '/orders', label: 'Orders', capability: 'order:read' },
  { href: '/production', label: 'Production', capability: 'production:read' },
  { href: '/dispatch', label: 'Dispatch', capability: 'dispatch:read' },
  { href: '/invoices', label: 'Invoices', capability: 'invoice:read' },
  { href: '/notes', label: 'Credit & debit notes', capability: 'note:read' },
  { href: '/expenses', label: 'Expenses', capability: 'expense:read' },
]

export const ADMIN_ENTRIES: readonly NavEntry[] = [
  { href: '/admin/users', label: 'Users', capability: 'user:update' },
  {
    href: '/settings/company',
    label: 'Company details',
    capability: 'settings:update',
  },
]
