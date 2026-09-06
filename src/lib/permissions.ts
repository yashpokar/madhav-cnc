import type { UserRole } from '@/generated/prisma/enums'

export const RESOURCES = [
  'customer',
  'partner',
  'item',
  'quotation',
  'order',
  'production',
  'dispatch',
  'invoice',
  'payment',
  'expense',
  'note',
  'user',
  'settings',
] as const

export type Resource = (typeof RESOURCES)[number]
export type Action = 'read' | 'create' | 'update' | 'delete'
export type Capability = `${Resource}:${Action}` | `${Resource}:*` | '*:read' | '*'

const ROLE_CAPABILITIES: Record<UserRole, readonly Capability[]> = {
  ADMIN: ['*'],
  SALES: [
    'customer:*',
    'partner:*',
    'quotation:*',
    'order:*',
    'item:read',
    'production:read',
    'dispatch:read',
    'invoice:read',
    'payment:read',
  ],
  OPERATOR: [
    'production:*',
    'order:read',
    'item:read',
    'customer:read',
    'partner:read',
  ],
  DISPATCH: [
    'dispatch:*',
    'order:read',
    'item:read',
    'customer:read',
    'partner:read',
    'production:read',
  ],
  ACCOUNTANT: [
    'invoice:*',
    'payment:*',
    'expense:*',
    'note:*',
    'order:read',
    'quotation:read',
    'customer:read',
    'partner:read',
    'item:read',
    'dispatch:read',
  ],
  VIEWER: ['*:read'],
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  SALES: 'Sales',
  OPERATOR: 'Operator',
  DISPATCH: 'Dispatch',
  ACCOUNTANT: 'Accountant',
  VIEWER: 'Viewer',
}

export function can(role: UserRole, capability: `${Resource}:${Action}`): boolean {
  const granted = ROLE_CAPABILITIES[role]

  if (!granted) {
    return false
  }

  const [resource, action] = capability.split(':') as [Resource, Action]

  return granted.some((entry) => {
    if (entry === '*') return true
    if (entry === '*:read') return action === 'read'

    const [grantedResource, grantedAction] = entry.split(':')

    if (grantedResource !== resource) return false

    return grantedAction === '*' || grantedAction === action
  })
}

export function capabilitiesFor(role: UserRole): readonly Capability[] {
  return ROLE_CAPABILITIES[role] ?? []
}
