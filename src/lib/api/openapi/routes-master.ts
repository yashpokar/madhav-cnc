import { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import * as r from '@/lib/api/schemas/reads'
import * as m from '@/lib/api/schemas/master'
import { deletedResponse } from '@/lib/api/schemas/writes'

// Master data and settings: items, materials, partners, payment modes, expense
// categories, the business profile, production stages, balance adjustments,
// opening balances, credit and debit notes and delivery challans.
// Settings lists (materials, stages, payment modes) answer the WHOLE list after
// every change, so a screen can replace its copy.

type Err = 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED'

type Spec = {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  path: string
  tag: string
  summary: string
  capability: string
  query?: z.ZodType
  body?: z.ZodType
  multipart?: boolean
  response?: z.ZodType
  rawResponse?: { description: string }
  status?: number
  idempotent?: boolean
  errors?: Err[]
}

const nf: Err[] = ['NOT_FOUND']
const nfc: Err[] = ['NOT_FOUND', 'CONFLICT']
const all: Err[] = ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED']

const specs: Spec[] = [
  // items
  { method: 'post', path: '/items', tag: 'Items', summary: 'Add an item to the catalogue (the code is assigned; a service is never stock-tracked)', capability: 'item:create', body: m.itemWriteBody, response: r.itemDetail, status: 201, idempotent: true, errors: ['VALIDATION_FAILED'] },
  { method: 'patch', path: '/items/{id}', tag: 'Items', summary: 'Change an item: only the fields sent change (null clears an optional one)', capability: 'item:update', body: m.itemPatchBody, response: r.itemDetail, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/items/{id}', tag: 'Items', summary: 'Delete an item; 409 while it is on a quotation, order or invoice line (mark it inactive instead)', capability: 'item:delete', response: deletedResponse, errors: nfc },

  // materials
  { method: 'get', path: '/materials', tag: 'Materials', summary: 'Every material (item category) in the order set up, inactive ones included', capability: 'item:read', response: z.array(m.materialRow) },
  { method: 'post', path: '/materials', tag: 'Materials', summary: 'Add a material at the end; a name already used is 409. Answers the whole updated list', capability: 'item:create', body: m.materialCreateBody, response: z.array(m.materialRow), status: 201, idempotent: true, errors: ['CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/materials/{id}', tag: 'Materials', summary: 'Rename, show or hide (409 while active items use it), turn stock tracking on or off and set the reorder level; answers the whole list', capability: 'item:update', body: m.materialPatchBody, response: z.array(m.materialRow), errors: all },
  { method: 'post', path: '/materials/{id}/move', tag: 'Materials', summary: 'Move a material one place up or down; answers the whole list', capability: 'item:update', body: m.directionBody, response: z.array(m.materialRow), idempotent: true, errors: nfc },
  { method: 'delete', path: '/materials/{id}', tag: 'Materials', summary: 'Delete a material; 409 while items use it', capability: 'item:delete', response: deletedResponse, errors: nfc },

  // partners
  { method: 'get', path: '/partners', tag: 'Partners', summary: 'Architects and carpenters by name (cursor pagination); includeInactive=true adds the inactive ones', capability: 'partner:read', query: m.partnersQuery, response: z.array(m.partnerListItem) },
  { method: 'get', path: '/partners/{id}', tag: 'Partners', summary: 'One partner; sends an ETag and answers 304 to a matching If-None-Match', capability: 'partner:read', response: m.partnerDetail, errors: nf },
  { method: 'post', path: '/partners', tag: 'Partners', summary: 'Add a partner (the code is assigned)', capability: 'partner:create', body: m.partnerWriteBody, response: m.partnerDetail, status: 201, idempotent: true, errors: ['VALIDATION_FAILED'] },
  { method: 'patch', path: '/partners/{id}', tag: 'Partners', summary: "Change a partner: only the fields sent change; the type is fixed once created", capability: 'partner:update', body: m.partnerPatchBody, response: m.partnerDetail, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/partners/{id}/active', tag: 'Partners', summary: 'Show or hide a partner in the pickers', capability: 'partner:update', body: m.activeBody, response: m.partnerDetail, idempotent: true, errors: nf },
  { method: 'delete', path: '/partners/{id}', tag: 'Partners', summary: 'Delete a partner; 409 while customers, quotations or orders point at it (mark it inactive instead)', capability: 'partner:delete', response: deletedResponse, errors: nfc },

  // payment modes
  { method: 'get', path: '/settings/payment-modes', tag: 'Settings', summary: "The company's payment modes with receiving details and usage, hidden ones too", capability: 'settings:update', response: z.array(m.paymentModeRow) },
  { method: 'post', path: '/settings/payment-modes', tag: 'Settings', summary: 'Add a payment mode at the end; a name already used is 409. Answers the whole updated list', capability: 'settings:update', body: m.paymentModeWriteBody, response: z.array(m.paymentModeRow), status: 201, idempotent: true, errors: ['CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/settings/payment-modes/{id}', tag: 'Settings', summary: 'Change a mode: only the fields sent change; isActive hides or shows it (at least one must stay active, 409); answers the whole list', capability: 'settings:update', body: m.paymentModePatchBody, response: z.array(m.paymentModeRow), errors: all },
  { method: 'post', path: '/settings/payment-modes/{id}/move', tag: 'Settings', summary: 'Move a mode one place up or down; answers the whole list', capability: 'settings:update', body: m.directionBody, response: z.array(m.paymentModeRow), idempotent: true, errors: nf },
  { method: 'delete', path: '/settings/payment-modes/{id}', tag: 'Settings', summary: 'Delete a mode that was never used (409 otherwise: hide it instead)', capability: 'settings:update', response: deletedResponse, errors: nfc },
  { method: 'get', path: '/settings/payment-modes/{id}/qr', tag: 'Settings', summary: "The mode's QR code image (needs payment:read)", capability: 'payment:read', rawResponse: { description: 'The QR image' }, errors: nf },
  { method: 'post', path: '/settings/payment-modes/{id}/qr', tag: 'Settings', summary: "Replace the mode's QR code (multipart: file; PNG, JPEG or WebP, 10 MB); answers the mode", capability: 'settings:update', multipart: true, body: m.assetUploadBody, response: m.paymentModeRow, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/settings/payment-modes/{id}/qr', tag: 'Settings', summary: "Remove the mode's QR code (404 when none)", capability: 'settings:update', response: deletedResponse, errors: nf },

  // expense categories
  { method: 'get', path: '/settings/expense-categories', tag: 'Settings', summary: 'Every expense category, inactive ones included, with how many expenses use it', capability: 'expense:read', response: z.array(m.expenseCategoryRow) },
  { method: 'post', path: '/expense-categories', tag: 'Reference', summary: 'Add an expense category; a name already used is 409', capability: 'expense:create', body: m.expenseCategoryWriteBody, response: m.expenseCategoryRow, status: 201, idempotent: true, errors: ['CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/expense-categories/{id}', tag: 'Reference', summary: 'Change a category: only the fields sent change', capability: 'expense:update', body: m.expenseCategoryPatchBody, response: m.expenseCategoryRow, errors: all },
  { method: 'delete', path: '/expense-categories/{id}', tag: 'Reference', summary: 'Delete a category; 409 while expenses use it (mark it inactive instead)', capability: 'expense:delete', response: deletedResponse, errors: nfc },

  // business profile
  { method: 'get', path: '/settings/company', tag: 'Settings', summary: 'The business profile printed on documents; ETag', capability: 'settings:update', response: m.companyProfile },
  { method: 'patch', path: '/settings/company', tag: 'Settings', summary: 'Change the profile: only the fields sent change (null clears an optional one)', capability: 'settings:update', body: m.companyPatchBody, response: m.companyProfile, errors: ['VALIDATION_FAILED'] },
  { method: 'get', path: '/settings/company/{asset}', tag: 'Settings', summary: 'The logo, signature or stamp image (asset is logo, signature or stamp)', capability: 'settings:update', rawResponse: { description: 'The image' }, errors: nf },
  { method: 'post', path: '/settings/company/{asset}', tag: 'Settings', summary: 'Replace the logo, signature or stamp (multipart: file; PNG, JPEG or WebP, 10 MB); answers the profile', capability: 'settings:update', multipart: true, body: m.assetUploadBody, response: m.companyProfile, errors: ['VALIDATION_FAILED'] },
  { method: 'delete', path: '/settings/company/{asset}', tag: 'Settings', summary: 'Remove the logo, signature or stamp (404 when none)', capability: 'settings:update', response: deletedResponse, errors: nf },

  // stages
  { method: 'get', path: '/settings/stages', tag: 'Settings', summary: 'Production stages in order, retired ones included, with their task counts', capability: 'settings:update', response: z.array(m.stageRow) },
  { method: 'post', path: '/settings/stages', tag: 'Settings', summary: 'Add a stage at the end; a name already used is 409. Answers the whole updated list', capability: 'settings:update', body: m.stageCreateBody, response: z.array(m.stageRow), status: 201, idempotent: true, errors: ['CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/settings/stages/{id}', tag: 'Settings', summary: 'Rename, link to an order status, retire or enable a stage (retiring is 409 while open tasks sit in it); answers the whole list', capability: 'settings:update', body: m.stagePatchBody, response: z.array(m.stageRow), errors: all },
  { method: 'post', path: '/settings/stages/{id}/move', tag: 'Settings', summary: 'Move a stage one place up or down; answers the whole list', capability: 'settings:update', body: m.directionBody, response: z.array(m.stageRow), idempotent: true, errors: nfc },
  { method: 'delete', path: '/settings/stages/{id}', tag: 'Settings', summary: 'Delete a stage with no tasks on record (409 otherwise: retire it instead)', capability: 'settings:update', response: deletedResponse, errors: nfc },

  // adjustments
  { method: 'get', path: '/adjustments', tag: 'Adjustments', summary: 'Balance adjustments, newest first (cursor pagination)', capability: 'payment:read', query: m.adjustmentsQuery, response: z.array(m.adjustmentItem) },
  { method: 'get', path: '/adjustments/{id}', tag: 'Adjustments', summary: 'One adjustment; ETag', capability: 'payment:read', response: m.adjustmentItem, errors: nf },
  { method: 'post', path: '/adjustments', tag: 'Adjustments', summary: "Move a payment mode's balance or what a customer owes without a source document (reason and note required)", capability: 'settings:update', body: m.adjustmentWriteBody, response: m.adjustmentItem, status: 201, idempotent: true, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/adjustments/{id}', tag: 'Adjustments', summary: 'Correct the amount, date, reason or note (send the whole body); what was adjusted stays fixed', capability: 'settings:update', body: m.adjustmentWriteBody, response: m.adjustmentItem, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/adjustments/{id}/reverse', tag: 'Adjustments', summary: 'Reverse an adjustment with a linked opposite entry dated today (the original stays); send X-Audit-Reason. 409 when already reversed or itself a reversal', capability: 'settings:update', response: m.adjustmentItem, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/adjustments/{id}', tag: 'Adjustments', summary: 'Delete (reverse) an adjustment: the balance is back as it was', capability: 'settings:update', response: deletedResponse, errors: nf },

  // opening balances
  { method: 'get', path: '/settings/opening-balances', tag: 'Settings', summary: 'What each payment mode held when the books were opened', capability: 'settings:update', response: z.array(m.openingBalanceRow) },
  { method: 'put', path: '/settings/opening-balances', tag: 'Settings', summary: 'Save the opening balance of the modes sent (a null amount removes an entry); answers the whole list. Repeating it is safe', capability: 'settings:update', body: m.openingBalancesBody, response: z.array(m.openingBalanceRow), errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },

  // notes
  { method: 'get', path: '/notes', tag: 'Notes', summary: 'Credit and debit notes, newest first (cursor pagination)', capability: 'note:read', query: m.notesQuery, response: z.array(m.noteListItem) },
  { method: 'get', path: '/notes/{id}', tag: 'Notes', summary: 'One note with its lines; ETag', capability: 'note:read', response: m.noteDetail, errors: nf },
  { method: 'post', path: '/notes', tag: 'Notes', summary: 'Raise a credit or debit note; lines are priced with the web GST rules (totals come back)', capability: 'note:create', body: m.noteWriteBody, response: m.noteDetail, status: 201, idempotent: true, errors: ['VALIDATION_FAILED'] },
  { method: 'patch', path: '/notes/{id}', tag: 'Notes', summary: 'Replace a draft note (send the whole document); an issued note is 409', capability: 'note:update', body: m.noteWriteBody, response: m.noteDetail, errors: all },
  { method: 'post', path: '/notes/{id}/status', tag: 'Notes', summary: 'Issue, cancel or move back to draft; the same status again is 409', capability: 'note:update', body: m.noteStatusBody, response: m.noteDetail, idempotent: true, errors: nfc },
  { method: 'delete', path: '/notes/{id}', tag: 'Notes', summary: 'Delete a note; an issued one must be cancelled first (409)', capability: 'note:delete', response: deletedResponse, errors: nfc },

  // dispatches
  { method: 'get', path: '/dispatches', tag: 'Dispatch', summary: 'Delivery challans, newest first (cursor pagination)', capability: 'dispatch:read', query: m.dispatchesQuery, response: z.array(m.dispatchListItem) },
  { method: 'get', path: '/dispatches/{id}', tag: 'Dispatch', summary: 'One challan with its lines; ETag', capability: 'dispatch:read', response: m.dispatchDetail, errors: nf },
  { method: 'get', path: '/dispatches/dispatchable-orders', tag: 'Dispatch', summary: 'Orders a challan can be made for', capability: 'dispatch:read', response: z.array(m.dispatchableOrder) },
  { method: 'get', path: '/dispatches/dispatchable-orders/{orderId}', tag: 'Dispatch', summary: 'One order with, per line, what was ordered, already sent and still left to send; ETag', capability: 'dispatch:read', response: m.dispatchableOrderDetail, errors: nf },
  { method: 'post', path: '/dispatches', tag: 'Dispatch', summary: 'Make a challan: the order must be confirmed and no line may exceed what is left to send', capability: 'dispatch:create', body: m.dispatchWriteBody, response: m.dispatchDetail, status: 201, idempotent: true, errors: all },
  { method: 'patch', path: '/dispatches/{id}', tag: 'Dispatch', summary: 'Replace a challan (send the whole document); one already delivered is 409', capability: 'dispatch:update', body: m.dispatchWriteBody, response: m.dispatchDetail, errors: all },
  { method: 'post', path: '/dispatches/{id}/status', tag: 'Dispatch', summary: 'Move a challan along its status table (an illegal move is 409)', capability: 'dispatch:update', body: m.dispatchStatusBody, response: m.dispatchDetail, idempotent: true, errors: nfc },
  { method: 'post', path: '/dispatches/{id}/receipt', tag: 'Dispatch', summary: 'Record who received the goods', capability: 'dispatch:update', body: m.dispatchReceiptBody, response: m.dispatchDetail, idempotent: true, errors: all },
  { method: 'delete', path: '/dispatches/{id}', tag: 'Dispatch', summary: 'Delete a draft or cancelled challan (409 once goods have left)', capability: 'dispatch:delete', response: deletedResponse, errors: nfc },
]

for (const spec of specs) {
  registerRoute({
    method: spec.method,
    path: spec.path,
    tag: spec.tag,
    summary: spec.summary,
    auth: 'company',
    capability: spec.capability,
    query: spec.query,
    body: spec.body,
    multipart: spec.multipart,
    response: spec.response,
    rawResponse: spec.rawResponse,
    status: spec.status,
    idempotent: spec.idempotent,
    errors: spec.errors,
  })
}
