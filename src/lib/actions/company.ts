'use server'

import { revalidatePath } from 'next/cache'
import { requireCapability } from '@/lib/session'
import { saveCompanySetting } from '@/lib/services/company-settings'
import { companySettingSchema } from '@/lib/validation/company'
import { fieldErrorsFrom, rawValues, type FormState } from '@/lib/form-state'
import type { SimpleResult } from '@/lib/actions/quotations'

export type { FormState, SimpleResult }

export async function updateCompanySetting(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireCapability('settings:update')

  const parsed = companySettingSchema.safeParse({
    companyName: formData.get('companyName'),
    addressLine: formData.get('addressLine'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    gstin: formData.get('gstin'),
    pan: formData.get('pan'),
    defaultAdvancePercent: formData.get('defaultAdvancePercent') || 0,
    invoiceTerms: formData.get('invoiceTerms'),
    signatoryName: formData.get('signatoryName'),
    signatoryTitle: formData.get('signatoryTitle'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  await saveCompanySetting(user, parsed.data)

  revalidatePath('/settings/company')

  return { status: 'success', message: 'Business profile saved' }
}
