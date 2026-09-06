import { z } from 'zod'
import { DispatchStatus, UnitOfMeasure } from '@/generated/prisma/enums'

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

export const dispatchLineSchema = z.object({
  orderLineId: z.string().trim().min(1),
  description: z.string().trim().min(1, 'Description is required').max(500),
  unit: z.enum(UnitOfMeasure),
  quantity: z.coerce
    .number()
    .gt(0, 'Quantity must be greater than zero')
    .max(9_999_999),
})

export const dispatchInputSchema = z.object({
  orderId: z.string().trim().min(1, 'Select an order'),
  dispatchDate: requiredDate,
  status: z.enum(DispatchStatus).default('DRAFT'),
  vehicleNumber: optionalText(30),
  driverName: optionalText(120),
  driverPhone: optionalText(20),
  transporterName: optionalText(150),
  lrNumber: optionalText(60),
  deliveryAddress: optionalText(300),
  deliveryCity: optionalText(100),
  deliveryPincode: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  notes: optionalText(1000),
  lines: z.array(dispatchLineSchema).min(1, 'Add at least one line to dispatch'),
})

export type DispatchData = z.output<typeof dispatchInputSchema>
