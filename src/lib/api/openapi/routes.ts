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

registerRoute({
  method: 'get',
  path: '/billing',
  tag: 'Billing',
  summary: 'The company plan, entitlements and invoice usage (read-only: manage the plan on the web)',
  auth: 'company',
  response: billingResponse,
})
