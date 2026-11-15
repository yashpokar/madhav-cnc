import type { z } from 'zod'
import { registerRoute } from '@/lib/api/openapi/registry'
import * as r from '@/lib/api/schemas/reads'
import * as s from '@/lib/api/schemas/sales'
import { shareLinkResponse } from '@/lib/api/schemas/writes'

// Sales-side gap endpoints (customers, quotations, orders, invoices, payments).

type Spec = {
  method: 'post' | 'patch' | 'delete'
  path: string
  tag: string
  summary: string
  capability: string
  body?: z.ZodType
  response: z.ZodType
  status?: number
  idempotent?: boolean
  errors?: ('NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED')[]
}

const specs: Spec[] = [
  { method: 'delete', path: '/customers/{id}', tag: 'Customers', summary: 'Delete a customer; 409 while it has quotations, orders, invoices, receipts or notes (set it INACTIVE instead)', capability: 'customer:delete', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'delete', path: '/quotations/{id}', tag: 'Quotations', summary: 'Delete a quotation; 409 while orders or later revisions point at it', capability: 'quotation:delete', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/quotations/{id}/revision', tag: 'Quotations', summary: 'Create a draft revision copied from this quotation (201, the new quotation)', capability: 'quotation:create', response: r.quotationDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/quotations/{id}/share', tag: 'Quotations', summary: 'Revoke the customer link (409 when there is no active link)', capability: 'quotation:update', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/quotations/{id}/comments', tag: 'Quotations', summary: 'Add a staff comment (optionally on one image)', capability: 'quotation:update', body: s.staffCommentBody, response: s.messageResponse, status: 201, idempotent: true, errors: ['NOT_FOUND', 'VALIDATION_FAILED'] },
  { method: 'post', path: '/quotations/{id}/attachments', tag: 'Quotations', summary: 'Attach an uploaded image (POST /uploads, purpose quotation_attachment); clears a customer approval; a confirmed quotation is 409', capability: 'quotation:update', body: s.attachUploadBody, response: s.attachmentResponse, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'patch', path: '/quotations/{id}/attachments/{attachmentId}', tag: 'Quotations', summary: "Replace an image's comment", capability: 'quotation:update', body: s.attachmentCommentBody, response: s.messageResponse, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/quotations/{id}/attachments/{attachmentId}', tag: 'Quotations', summary: 'Remove an image from the current set (restorable); clears a customer approval', capability: 'quotation:update', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/quotations/{id}/attachments/{attachmentId}/restore', tag: 'Quotations', summary: 'Put a removed image back in the current set', capability: 'quotation:update', response: s.messageResponse, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'delete', path: '/orders/{id}', tag: 'Orders', summary: 'Delete an order (same rules as the web; an invoiced or dispatched one is 409)', capability: 'order:delete', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/orders/{id}/tracking', tag: 'Orders', summary: 'The customer tracking link (the active one, a new one, or replace: true for a fresh one) with the WhatsApp message', capability: 'order:update', body: s.trackingBody, response: s.trackingLinkResponse, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'delete', path: '/orders/{id}/tracking', tag: 'Orders', summary: 'Revoke the tracking link (409 when there is none)', capability: 'order:update', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'delete', path: '/invoices/{id}', tag: 'Invoices', summary: 'Delete a draft invoice (anything else is 409)', capability: 'invoice:delete', response: s.deletedResponse, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/invoices/{id}/duplicate', tag: 'Invoices', summary: 'A new draft with the same lines (201, the new invoice)', capability: 'invoice:create', response: r.invoiceDetail, status: 201, idempotent: true, errors: ['NOT_FOUND'] },
  { method: 'post', path: '/invoices/{id}/payments', tag: 'Invoices', summary: 'Record a receipt against this invoice (201, the invoice)', capability: 'payment:create', body: s.invoicePaymentBody, response: r.invoiceDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/invoices/{id}/payments/{paymentId}', tag: 'Invoices', summary: "Unapply a payment (a paymentId of the invoice's payments) from this invoice; the last allocation removes the receipt; answers the invoice", capability: 'payment:delete', response: r.invoiceDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/invoices/{id}/write-off', tag: 'Invoices', summary: 'Write off part of what is due (201, the invoice)', capability: 'payment:update', body: s.writeOffBody, response: r.invoiceDetail, status: 201, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
  { method: 'delete', path: '/invoices/{id}/write-offs/{writeOffId}', tag: 'Invoices', summary: 'Reverse a write-off; answers the invoice', capability: 'payment:update', response: r.invoiceDetail, errors: ['NOT_FOUND', 'CONFLICT'] },
  { method: 'post', path: '/invoices/{id}/share/regenerate', tag: 'Invoices', summary: 'Replace the customer link (the old one stops opening); issued invoices only', capability: 'invoice:update', response: shareLinkResponse, idempotent: true, errors: ['NOT_FOUND', 'CONFLICT'] },

  { method: 'patch', path: '/payments/{id}/allocations', tag: 'Payments', summary: 'Replace what a receipt settles (allocations per invoice, openingApplied for the opening balance)', capability: 'payment:update', body: s.allocationsBody, response: r.paymentDetail, errors: ['NOT_FOUND', 'CONFLICT', 'VALIDATION_FAILED'] },
]

for (const spec of specs) {
  registerRoute({
    method: spec.method,
    path: spec.path,
    tag: spec.tag,
    summary: spec.summary,
    auth: 'company',
    capability: spec.capability,
    body: spec.body,
    response: spec.response,
    status: spec.status,
    idempotent: spec.idempotent,
    errors: spec.errors,
  })
}
