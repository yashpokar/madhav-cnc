import { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import {
  acceptInvitationBody,
  acceptInvitationResponse,
  createCompanyBody,
  createCompanyResponse,
  deleteMeResponse,
  meResponse,
  metaResponse,
  permissionsResponse,
} from '@/lib/api/schemas'
import * as r from '@/lib/api/schemas/reads'

// One registration per route file under src/app/api/v1 (a test checks none is missing).

registerRoute({
  method: 'get',
  path: '/meta',
  tag: 'App',
  summary: 'API version, minimum app versions and maintenance flag',
  auth: 'none',
  response: metaResponse,
})

registerRoute({
  method: 'get',
  path: '/me',
  tag: 'Account',
  summary: 'The signed-in person and the companies they may open',
  auth: 'user',
  response: meResponse,
  errors: ['ACCOUNT_DEACTIVATED'],
})

registerRoute({
  method: 'delete',
  path: '/me',
  tag: 'Account',
  summary: 'Delete the account (anonymises it; refused with 409 for the last administrator of a company with other members)',
  auth: 'user',
  response: deleteMeResponse,
  errors: ['CONFLICT'],
})

registerRoute({
  method: 'get',
  path: '/me/permissions',
  tag: 'Account',
  summary: 'What the person may do in the company named by X-Company-Id',
  auth: 'company',
  response: permissionsResponse,
})

registerRoute({
  method: 'post',
  path: '/companies',
  tag: 'Onboarding',
  summary: 'Create the first company (the caller becomes its administrator)',
  auth: 'user',
  idempotent: true,
  body: createCompanyBody,
  response: createCompanyResponse,
  status: 201,
  errors: ['VALIDATION_FAILED', 'CONFLICT', 'IDEMPOTENCY_KEY_REUSED'],
})

registerRoute({
  method: 'post',
  path: '/invitations/accept',
  tag: 'Onboarding',
  summary: 'Join a company with an invitation token',
  auth: 'user',
  idempotent: true,
  body: acceptInvitationBody,
  response: acceptInvitationResponse,
  errors: ['VALIDATION_FAILED', 'CONFLICT', 'IDEMPOTENCY_KEY_REUSED'],
})

registerRoute({
  method: 'get',
  path: '/openapi.json',
  tag: 'App',
  summary: 'This specification',
  auth: 'none',
  rawResponse: { description: 'The OpenAPI 3.0 document' },
})

// ---------------------------------------------------------------------------
// Reads. Lists answer { data: [...], meta: { nextCursor, hasMore } } and take
// ?limit= (25, at most 100) and ?cursor= (the previous page's nextCursor).

type Resource = {
  path: string
  tag: string
  noun: string
  capability: string
  query: z.ZodType
  list: z.ZodType
  detail: z.ZodType
}

const resources: Resource[] = [
  { path: '/customers', tag: 'Customers', noun: 'customer', capability: 'customer:read', query: r.customersQuery, list: r.customerListItem, detail: r.customerDetail },
  { path: '/items', tag: 'Items', noun: 'item', capability: 'item:read', query: r.itemsQuery, list: r.itemListItem, detail: r.itemDetail },
  { path: '/quotations', tag: 'Quotations', noun: 'quotation', capability: 'quotation:read', query: r.quotationsQuery, list: r.quotationListItem, detail: r.quotationDetail },
  { path: '/orders', tag: 'Orders', noun: 'order', capability: 'order:read', query: r.ordersQuery, list: r.orderListItem, detail: r.orderDetail },
  { path: '/invoices', tag: 'Invoices', noun: 'invoice', capability: 'invoice:read', query: r.invoicesQuery, list: r.invoiceListItem, detail: r.invoiceDetail },
  { path: '/payments', tag: 'Payments', noun: 'payment', capability: 'payment:read', query: r.paymentsQuery, list: r.paymentListItem, detail: r.paymentDetail },
  { path: '/expenses', tag: 'Expenses', noun: 'expense', capability: 'expense:read', query: r.expensesQuery, list: r.expenseListItem, detail: r.expenseDetail },
]

for (const resource of resources) {
  registerRoute({
    method: 'get',
    path: resource.path,
    tag: resource.tag,
    summary: `List ${resource.noun}s, newest first (cursor pagination)`,
    auth: 'company',
    capability: resource.capability,
    query: resource.query,
    response: z.array(resource.list),
  })

  registerRoute({
    method: 'get',
    path: `${resource.path}/{id}`,
    tag: resource.tag,
    summary: `One ${resource.noun}; sends an ETag and answers 304 to a matching If-None-Match`,
    auth: 'company',
    capability: resource.capability,
    response: resource.detail,
    errors: ['NOT_FOUND'],
  })
}

registerRoute({
  method: 'get',
  path: '/dashboard/summary',
  tag: 'Dashboard',
  summary: 'The home screen numbers; each block is null when the role lacks the capability behind it',
  auth: 'company',
  response: r.dashboardSummary,
})

registerRoute({
  method: 'get',
  path: '/calendar',
  tag: 'Calendar',
  summary: 'Bookings, deliveries, invoice due dates and receipts for a date range (layers need order:read, dispatch:read, invoice:read, payment:read)',
  auth: 'company',
  query: r.calendarQuery,
  response: r.calendarResponse,
  errors: ['FORBIDDEN'],
})

registerRoute({
  method: 'get',
  path: '/production/tasks',
  tag: 'Production',
  summary: 'Open production tasks of the orders in production (cursor pagination)',
  auth: 'company',
  capability: 'production:read',
  query: r.productionTasksQuery,
  response: z.array(r.productionTask),
})

registerRoute({
  method: 'get',
  path: '/payment-methods',
  tag: 'Reference',
  summary: "The company's payment methods with the field schema to render a receipt or expense form",
  auth: 'company',
  capability: 'payment:read',
  response: z.array(r.paymentMethodItem),
})

registerRoute({
  method: 'get',
  path: '/expense-categories',
  tag: 'Reference',
  summary: "The company's active expense categories",
  auth: 'company',
  capability: 'expense:read',
  response: z.array(r.expenseCategoryItem),
})

registerRoute({
  method: 'get',
  path: '/states',
  tag: 'Reference',
  summary: 'Indian states and union territories with GST codes and city suggestions (cached for a day; ETag)',
  auth: 'none',
  response: r.statesResponse,
})
