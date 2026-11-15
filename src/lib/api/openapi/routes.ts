import { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import {
  acceptInvitationBody,
  acceptInvitationResponse,
  billingResponse,
  createCompanyBody,
  createCompanyResponse,
  deleteMeResponse,
  meResponse,
  metaResponse,
  permissionsResponse,
} from '@/lib/api/schemas'
import * as r from '@/lib/api/schemas/reads'
import * as w from '@/lib/api/schemas/writes'

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

registerRoute({
  method: 'get',
  path: '/billing',
  tag: 'Billing',
  summary: 'The company plan, entitlements and invoice usage (read-only: manage the plan on the web)',
  auth: 'company',
  response: billingResponse,
})

// ---------------------------------------------------------------------------
// Writes. Creates take an Idempotency-Key and answer 201 with the saved
// resource (the same shape as its GET, plus an ETag header). PATCH replaces the
// document (customers: only the fields sent change). Refusals: 404 for a record
// of another company, 409 CONFLICT for a state rule, 422 with `fields`.

type Write = {
  method: 'post' | 'patch' | 'delete'
  path: string
  tag: string
  summary: string
  capability: string
  body?: z.ZodType
  response: z.ZodType
  status?: number
  idempotent?: boolean
  errors?: ('NOT_FOUND' | 'CONFLICT' | 'PLAN_LIMIT_REACHED')[]
}

const writes: Write[] = [
  { method: 'post', path: '/customers', tag: 'Customers', summary: 'Create a customer (name and phone are enough); a phone another customer uses is 409', capability: 'customer:create', body: w.customerInputSchema, response: r.customerDetail, status: 201, idempotent: true, errors: ['CONFLICT'] },
  { method: 'patch', path: '/customers/{id}', tag: 'Customers', summary: 'Change a customer: only the fields sent change (null clears one)', capability: 'customer:update', body: w.customerPatchBody, response: r.customerDetail, errors: ['NOT_FOUND'] },

  { method: 'post', path: '/quotations', tag: 'Quotations', summary: 'Create a draft quotation; lines are priced by the same rules as the web (totals come back)', capability: 'quotation:create', body: w.quotationWriteBody, response: r.quotationDetail, status: 201, idempotent: true, errors: ['NOT_FOUND'] },
  { method: 'patch', path: '/quotations/{id}', tag: 'Quotations', summary: 'Replace a draft quotation (send the whole document); anything but a draft is 409', capability: 'quotation:update', body: w.quotationWriteBody, response: r.quotationDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/quotations/{id}/status', tag: 'Quotations', summary: 'Move a quotation along its status table (an illegal move is 409)', capability: 'quotation:update', body: w.quotationStatusBody, response: r.quotationDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/quotations/{id}/share', tag: 'Quotations', summary: 'The customer link (created on first use) with the WhatsApp message and click-to-chat link', capability: 'quotation:update', response: w.shareLinkResponse, idempotent: true, errors: ['NOT_FOUND'] },
  { method: 'post', path: '/quotations/{id}/convert', tag: 'Quotations', summary: 'Turn an accepted quotation into a confirmed order (201, the order)', capability: 'order:create', response: r.orderDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/orders', tag: 'Orders', summary: 'Create an order (an advance becomes a receipt tied to it)', capability: 'order:create', body: w.orderJsonSchema, response: r.orderDetail, status: 201, idempotent: true, errors: ['NOT_FOUND'] },
  { method: 'patch', path: '/orders/{id}', tag: 'Orders', summary: 'Replace an order (send the whole document); its status never changes here; an invoiced, cancelled or dispatched order is 409', capability: 'order:update', body: w.orderJsonSchema, response: r.orderDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/orders/{id}/status', tag: 'Orders', summary: 'Move an order along its status table; IN_PRODUCTION creates its stage tasks', capability: 'order:update', body: w.orderStatusBody, response: r.orderDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/invoices', tag: 'Invoices', summary: 'Create an invoice: { orderId } alone drafts one from a completed order, otherwise a whole invoice (status ISSUED counts against the plan quota)', capability: 'invoice:create', body: w.invoiceCreateDocBody, response: r.invoiceDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'PLAN_LIMIT_REACHED'] },
  { method: 'patch', path: '/invoices/{id}', tag: 'Invoices', summary: 'Replace a draft invoice (send the whole document); an issued or cancelled one is 409', capability: 'invoice:update', body: w.invoiceInputSchema, response: r.invoiceDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/invoices/{id}/issue', tag: 'Invoices', summary: 'Issue a draft invoice. Uses one of the plan invoices: 402 PLAN_LIMIT_REACHED when a Free company has used its free ones and billing is enforced', capability: 'invoice:update', response: r.invoiceDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'PLAN_LIMIT_REACHED'] },
  { method: 'post', path: '/invoices/{id}/cancel', tag: 'Invoices', summary: 'Cancel an invoice (409 while payments are applied; never plan-limited; does not free a slot)', capability: 'invoice:update', response: r.invoiceDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/invoices/{id}/share', tag: 'Invoices', summary: 'The customer link of an issued invoice (created on first use) with the WhatsApp message and link; a draft is 409', capability: 'invoice:update', response: w.shareLinkResponse, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/payments', tag: 'Payments', summary: 'Record a receipt; allocations and openingApplied say what it settles, with the web form auto-apply rules when neither is sent', capability: 'payment:create', body: w.paymentCreateBody, response: r.paymentDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/payments/{id}', tag: 'Payments', summary: 'Delete a receipt (its allocations go with it); an order advance is 409', capability: 'payment:delete', response: w.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/expenses', tag: 'Expenses', summary: 'Record an expense, optionally with a receipt photo (receiptUploadId from POST /uploads)', capability: 'expense:create', body: w.expenseWriteBody, response: r.expenseDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'patch', path: '/expenses/{id}', tag: 'Expenses', summary: 'Replace an expense (send the whole record); receiptUploadId left out keeps the receipt, null removes it', capability: 'expense:update', body: w.expenseWriteBody, response: r.expenseDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/expenses/{id}', tag: 'Expenses', summary: 'Delete an expense', capability: 'expense:delete', response: w.deletedResponse, errors: ['NOT_FOUND'] },

  { method: 'post', path: '/production/tasks/{id}/start', tag: 'Production', summary: 'Start or resume a stage (next in line, unless an administrator sends force)', capability: 'production:update', body: w.startTaskBody, response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/production/tasks/{id}/complete', tag: 'Production', summary: 'Finish an in-progress stage; starts the next one unless startNext is false', capability: 'production:update', body: w.completeTaskBody, response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/production/tasks/{id}/hold', tag: 'Production', summary: 'Put an in-progress stage on hold', capability: 'production:update', body: w.taskReasonBody, response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/production/tasks/{id}/skip', tag: 'Production', summary: 'Skip an unfinished stage', capability: 'production:update', body: w.taskReasonBody, response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/production/tasks/{id}/reopen', tag: 'Production', summary: 'Reopen the latest finished stage', capability: 'production:update', response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/production/tasks/{id}/assign', tag: 'Production', summary: 'Assign a stage to a person of this company (userId null clears it)', capability: 'production:update', body: w.assignTaskBody, response: r.productionTask, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'patch', path: '/production/tasks/{id}/notes', tag: 'Production', summary: "Replace a stage's notes", capability: 'production:update', body: w.taskNotesBody, response: r.productionTask, errors: ['NOT_FOUND'] },
]

for (const write of writes) {
  registerRoute({
    method: write.method,
    path: write.path,
    tag: write.tag,
    summary: write.summary,
    auth: 'company',
    capability: write.capability,
    body: write.body,
    response: write.response,
    status: write.status,
    idempotent: write.idempotent,
    errors: write.errors,
  })
}

registerRoute({
  method: 'post',
  path: '/uploads',
  tag: 'Uploads',
  summary: 'Upload a file (multipart: file + purpose). Needs expense:create, payment:create or quotation:update by purpose; 10 MB, images or PDF',
  auth: 'company',
  multipart: true,
  body: w.uploadBody,
  response: w.uploadResponse,
  status: 201,
})

registerRoute({
  method: 'get',
  path: '/uploads/{id}',
  tag: 'Uploads',
  summary: 'The uploaded file, streamed with its own content type (the company it was uploaded in only)',
  auth: 'company',
  rawResponse: { description: 'The file (image or PDF)' },
  errors: ['NOT_FOUND'],
})

registerRoute({
  method: 'post',
  path: '/devices',
  tag: 'Devices',
  summary: 'Register this phone for push notifications (an upsert by Expo token; X-Company-Id optionally records the active company)',
  auth: 'user',
  idempotent: true,
  body: w.deviceBody,
  response: w.deviceResponse,
})

registerRoute({
  method: 'delete',
  path: '/devices/{id}',
  tag: 'Devices',
  summary: "Stop pushes to a phone (the person's own device only)",
  auth: 'user',
  response: w.deletedResponse,
  errors: ['NOT_FOUND'],
})
