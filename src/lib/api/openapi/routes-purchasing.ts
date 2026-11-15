import { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import * as p from '@/lib/api/schemas/purchasing'
import { deletedResponse } from '@/lib/api/schemas/writes'

// Purchasing and stock. Lists answer { data: [...], meta: { nextCursor, hasMore } }
// and take ?limit= and ?cursor=; creates take an Idempotency-Key and answer 201
// with the saved record (the same shape as its GET).

type Err = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED'

type Read = {
  path: string
  tag: string
  summary: string
  capability: string
  query?: z.ZodType
  response: z.ZodType
}

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
  errors?: Err[]
}

const reads: Read[] = [
  { path: '/vendors', tag: 'Vendors', summary: 'List vendors by name (inactive ones only with includeInactive=true; cursor pagination)', capability: 'expense:read', query: p.vendorsQuery, response: z.array(p.vendorListItem) },
  { path: '/vendors/{id}', tag: 'Vendors', summary: 'One vendor with its recent expenses; ETag, 304 to a matching If-None-Match', capability: 'expense:read', response: p.vendorDetail },
  { path: '/vendors/{id}/statement', tag: 'Vendors', summary: "A vendor's account: open bills, bills and payments with a running balance, opening payable first", capability: 'purchase:read', response: p.vendorStatement },
  { path: '/payables', tag: 'Payables', summary: 'What the business owes its vendors: totals, ageing and a row per vendor', capability: 'purchase:read', response: p.payablesResponse },
  { path: '/purchase-orders', tag: 'Purchase orders', summary: 'List purchase orders, newest order date first (cursor pagination)', capability: 'purchase:read', query: p.purchaseOrdersQuery, response: z.array(p.purchaseOrderListItem) },
  { path: '/purchase-orders/{id}', tag: 'Purchase orders', summary: 'One purchase order with lines and its bills; ETag', capability: 'purchase:read', response: p.purchaseOrderDetail },
  { path: '/purchase-bills', tag: 'Purchase bills', summary: 'List purchase bills, newest bill date first (cursor pagination)', capability: 'purchase:read', query: p.purchaseBillsQuery, response: z.array(p.purchaseBillListItem) },
  { path: '/purchase-bills/{id}', tag: 'Purchase bills', summary: 'One purchase bill with lines, payments and receipts; ETag', capability: 'purchase:read', response: p.purchaseBillDetail },
  { path: '/goods-receipts', tag: 'Goods receipts', summary: 'List goods receipts, newest received date first (cursor pagination)', capability: 'purchase:read', query: p.goodsReceiptsQuery, response: z.array(p.goodsReceiptListItem) },
  { path: '/goods-receipts/{id}', tag: 'Goods receipts', summary: 'One goods receipt with its lines; ETag', capability: 'purchase:read', response: p.goodsReceiptDetail },
  { path: '/goods-receipts/receivable', tag: 'Goods receipts', summary: 'What can still be received against a posted bill (billId) or a sent purchase order (poId)', capability: 'purchase:read', query: p.receivableQuery, response: p.receivableResponse },
  { path: '/vendor-payments', tag: 'Vendor payments', summary: 'List payments to vendors, newest payment date first (cursor pagination)', capability: 'purchase:read', query: p.vendorPaymentsQuery, response: z.array(p.vendorPaymentListItem) },
  { path: '/vendor-payments/{id}', tag: 'Vendor payments', summary: 'One vendor payment with its allocations; ETag', capability: 'purchase:read', response: p.vendorPaymentDetail },
  { path: '/stock', tag: 'Stock', summary: 'Everything tracked for stock with on-hand, average cost, value and state, by name (cursor pagination)', capability: 'stock:read', query: p.stockQuery, response: z.array(p.stockListItem) },
  { path: '/stock/{kind}/{id}', tag: 'Stock', summary: 'The stock ledger of one item or material (kind is item or material), oldest first with a running balance', capability: 'stock:read', response: p.stockLedger },
]

for (const read of reads) {
  registerRoute({
    method: 'get',
    path: read.path,
    tag: read.tag,
    summary: read.summary,
    auth: 'company',
    capability: read.capability,
    query: read.query,
    response: read.response,
    errors: read.path.includes('{') || read.path.endsWith('receivable') ? ['NOT_FOUND'] : undefined,
  })
}

const writes: Write[] = [
  { method: 'post', path: '/vendors', tag: 'Vendors', summary: 'Create a vendor; a name another vendor has is 409', capability: 'expense:create', body: p.vendorWriteBody, response: p.vendorDetail, status: 201, idempotent: true, errors: ['CONFLICT'] },
  { method: 'patch', path: '/vendors/{id}', tag: 'Vendors', summary: 'Replace a vendor (send the whole record); a rename also renames the payee on its past expenses', capability: 'expense:update', body: p.vendorWriteBody, response: p.vendorDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/vendors/{id}', tag: 'Vendors', summary: 'Delete a vendor; 409 while it has expenses (mark it inactive instead)', capability: 'expense:delete', response: deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/purchase-orders', tag: 'Purchase orders', summary: 'Create a draft purchase order', capability: 'purchase:create', body: p.purchaseOrderWriteBody, response: p.purchaseOrderDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/purchase-orders/{id}', tag: 'Purchase orders', summary: 'Replace a purchase order (send the whole document); a received or cancelled one is 409', capability: 'purchase:update', body: p.purchaseOrderWriteBody, response: p.purchaseOrderDetail, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/purchase-orders/{id}/status', tag: 'Purchase orders', summary: 'Move a purchase order along its status table (an illegal move is 409)', capability: 'purchase:update', body: p.purchaseOrderStatusBody, response: p.purchaseOrderDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/purchase-orders/{id}/create-bill', tag: 'Purchase orders', summary: "Copy the order's lines into a new draft bill linked to it (201, the bill); a cancelled order is 409", capability: 'purchase:create', response: p.purchaseBillDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/purchase-orders/{id}', tag: 'Purchase orders', summary: 'Delete a draft or cancelled purchase order with no bills or receipts (409 otherwise)', capability: 'purchase:delete', response: deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/purchase-bills', tag: 'Purchase bills', summary: 'Create a draft purchase bill; lines are priced with the web GST rules (totals come back)', capability: 'purchase:create', body: p.purchaseBillWriteBody, response: p.purchaseBillDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/purchase-bills/{id}', tag: 'Purchase bills', summary: 'Replace a draft bill (send the whole document); a posted or cancelled bill is 409', capability: 'purchase:update', body: p.purchaseBillWriteBody, response: p.purchaseBillDetail, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/purchase-bills/{id}/status', tag: 'Purchase bills', summary: 'Draft, posted or cancelled; receiveNow with POSTED also receives the goods (needs stock:create too)', capability: 'purchase:update', body: p.purchaseBillStatusBody, response: p.purchaseBillDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/purchase-bills/{id}/duplicate', tag: 'Purchase bills', summary: 'A new draft with the same lines (201, the copy)', capability: 'purchase:create', response: p.purchaseBillDetail, status: 201, idempotent: true, errors: ['NOT_FOUND'] },
  { method: 'delete', path: '/purchase-bills/{id}', tag: 'Purchase bills', summary: 'Delete a bill; 409 for a posted bill or one with payments or receipts', capability: 'purchase:delete', response: deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/goods-receipts', tag: 'Goods receipts', summary: 'Receive goods against a posted bill (billId) or sent order (poId); adds to stock', capability: 'stock:create', body: p.goodsReceiptCreateBody, response: p.goodsReceiptDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/goods-receipts/{id}/cancel', tag: 'Goods receipts', summary: 'Cancel a receipt and reverse its stock; stock below zero is 409 unless an administrator sends allowNegative', capability: 'stock:update', body: p.goodsReceiptCancelBody, response: p.goodsReceiptDetail, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'post', path: '/vendor-payments', tag: 'Vendor payments', summary: 'Record a payment to a vendor; allocations and openingApplied say what it settles, with the web auto-apply rules when neither is sent', capability: 'purchase:update', body: p.vendorPaymentCreateBody, response: p.vendorPaymentDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/vendor-payments/{id}/allocations', tag: 'Vendor payments', summary: 'Replace what a payment settles (bills and the opening payable)', capability: 'purchase:update', body: p.vendorAllocationsBody, response: p.vendorPaymentDetail, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/vendor-payments/{id}', tag: 'Vendor payments', summary: 'Delete a payment (its allocations go with it, so the bills owe again)', capability: 'purchase:delete', response: deletedResponse, errors: ['NOT_FOUND'] },

  { method: 'post', path: '/stock/adjustments', tag: 'Stock', summary: 'Add (+) or remove (-) stock by hand with a reason; below zero is 409 unless an administrator sends allowNegative', capability: 'stock:create', body: p.stockAdjustBody, response: p.stockResultResponse, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/stock/opening', tag: 'Stock', summary: 'Set the opening stock (quantity and unit cost); once per item or material', capability: 'stock:create', body: p.stockOpeningBody, response: p.stockResultResponse, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'patch', path: '/stock/{kind}/{id}/reorder-level', tag: 'Stock', summary: 'Set or clear (null) the level at which a tracked item or material counts as low', capability: 'item:update', body: p.reorderLevelBody, response: p.reorderLevelResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
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
