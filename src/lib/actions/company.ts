'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requireCapability } from '@/lib/session'
import { companySettingSchema } from '@/lib/validation/company'
import { deleteUpload } from '@/lib/storage'
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
    bankAccountName: formData.get('bankAccountName'),
    bankName: formData.get('bankName'),
    bankBranch: formData.get('bankBranch'),
    accountNumber: formData.get('accountNumber'),
    ifscCode: formData.get('ifscCode'),
    upiId: formData.get('upiId'),
    invoiceTerms: formData.get('invoiceTerms'),
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields',
      fieldErrors: fieldErrorsFrom(parsed.error),
      values: rawValues(formData),
    }
  }

  await prisma.companySetting.upsert({
    where: { id: 'default' },
    update: { ...parsed.data, updatedById: user.id },
    create: { id: 'default', ...parsed.data, updatedById: user.id },
  })

  revalidatePath('/settings/company')

  return { status: 'success', message: 'Company details saved' }
}

export async function removeUpiQr(): Promise<SimpleResult> {
  const user = await requireCapability('settings:update')

  const setting = await prisma.companySetting.findUnique({
    where: { id: 'default' },
    select: { upiQrStoredName: true },
  })

  if (!setting?.upiQrStoredName) {
    return { ok: false, error: 'No QR code to remove' }
  }

  await deleteUpload(setting.upiQrStoredName)

  await prisma.companySetting.update({
    where: { id: 'default' },
    data: { upiQrStoredName: null, upiQrMimeType: null, updatedById: user.id },
  })

  revalidatePath('/settings/company')

  return { ok: true, message: 'QR code removed' }
}
