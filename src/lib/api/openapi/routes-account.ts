import { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import * as a from '@/lib/api/schemas/account'
import { deletedResponse } from '@/lib/api/schemas/writes'

// Industries, team, invitations, billing history, search and export.

registerRoute({
  method: 'get',
  path: '/industries',
  tag: 'Account',
  summary: 'Industry templates: terms, modules, stages, units and expense categories (ETag)',
  auth: 'user',
  response: z.array(a.industryTemplate),
})

registerRoute({
  method: 'get',
  path: '/team/members',
  tag: 'Team',
  summary: 'The people who can open this company',
  auth: 'company',
  capability: 'user:update',
  response: z.array(a.teamMember),
})

registerRoute({
  method: 'post',
  path: '/team/members',
  tag: 'Team',
  summary: 'Add an existing account by exact email (409 when already a member; 422 when no account has that email)',
  auth: 'company',
  capability: 'user:update',
  idempotent: true,
  body: a.addMemberBody,
  response: a.teamMember,
  status: 201,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'patch',
  path: '/team/members/{userId}',
  tag: 'Team',
  summary: "Change a member's role in this company (the last administrator cannot be demoted: 409)",
  auth: 'company',
  capability: 'user:update',
  body: a.memberRoleBody,
  response: a.teamMember,
  errors: ['NOT_FOUND', 'CONFLICT'],
})

registerRoute({
  method: 'delete',
  path: '/team/members/{userId}',
  tag: 'Team',
  summary: 'Remove a member from this company (their account stays; the last administrator cannot be removed: 409)',
  auth: 'company',
  capability: 'user:update',
  response: a.memberRemovedResponse,
  errors: ['NOT_FOUND', 'CONFLICT'],
})

registerRoute({
  method: 'get',
  path: '/invitations',
  tag: 'Team',
  summary: 'Open and just-lapsed invitations, each with the link and the WhatsApp text and click-to-chat link',
  auth: 'company',
  capability: 'user:update',
  response: z.array(a.invitation),
})

registerRoute({
  method: 'post',
  path: '/invitations',
  tag: 'Team',
  summary: 'Create a join link for a role (capped per company; a refusal is 409)',
  auth: 'company',
  capability: 'user:update',
  idempotent: true,
  body: a.invitationBody,
  response: a.invitation,
  status: 201,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'delete',
  path: '/invitations/{id}',
  tag: 'Team',
  summary: 'Revoke an open invitation; its link stops working (one no longer open is 409)',
  auth: 'company',
  capability: 'user:update',
  response: deletedResponse,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'post',
  path: '/invitations/{id}/regenerate',
  tag: 'Team',
  summary: 'A fresh link and expiry for an unused invitation (resend); the old link stops working',
  auth: 'company',
  capability: 'user:update',
  idempotent: true,
  response: a.invitation,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'get',
  path: '/invitations/preview',
  tag: 'Onboarding',
  summary: 'What the join screen shows for a token (company, role, inviter, whether it still works); 404 for an unknown token',
  auth: 'user',
  query: a.invitationPreviewQuery,
  response: a.invitationPreview,
  errors: ['NOT_FOUND'],
})

registerRoute({
  method: 'get',
  path: '/billing/payments',
  tag: 'Billing',
  summary: "The company's plan payments, newest first (last 20)",
  auth: 'company',
  capability: 'settings:update',
  response: z.array(a.billingPayment),
})

registerRoute({
  method: 'post',
  path: '/billing/checkout',
  tag: 'Billing',
  summary: 'Start a yearly plan purchase; returns the payment page to open in the system browser',
  auth: 'company',
  capability: 'settings:update',
  idempotent: true,
  body: a.checkoutBody,
  response: a.checkoutResponse,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'get',
  path: '/search',
  tag: 'Search',
  summary: 'Global search (2+ characters) over customers, quotations, orders, invoices, partners and items the role may read',
  auth: 'company',
  query: a.searchQuery,
  response: z.array(a.searchHit),
})

registerRoute({
  method: 'get',
  path: '/export/{kind}',
  tag: 'Export',
  summary: 'CSV of a list (customers, quotations, orders, invoices, payments, expenses, purchase-bills, purchase-orders, vendor-payments, stock); needs the kind\'s read capability',
  auth: 'company',
  query: a.exportQuery,
  rawResponse: { description: 'text/csv (UTF-8 with BOM)' },
  errors: ['NOT_FOUND', 'FORBIDDEN'],
})
