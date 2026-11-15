import { z } from 'zod'
import {
  DiscountType,
  OrderStatus,
} from '@/generated/prisma/enums'
import { scheduleFromFields } from '@/lib/calendar'
import { quotationLineSchema } from '@/lib/validation/quotations'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

const requiredDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')
  .transform((value) => new Date(`${value}T00:00:00Z`))

const optionalDate = z
  .union([
    z.literal(''),
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  ])
  .optional()
  .transform((value) => (value ? new Date(`${value}T00:00:00Z`) : null))

const optionalDay = z
  .union([z.literal(''), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')])
  .optional()

const optionalTime = z
  .union([z.literal(''), z.null(), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time')])
  .optional()

export const orderLineSchema = quotationLineSchema

const orderShape = {
  customerId: z.string().trim().min(1, 'Select a customer'),
  architectId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  carpenterId: z
    .union([z.literal(''), z.null(), z.string()])
    .optional()
    .transform((value) => (value ? value : null)),
  subject: optionalText(200),
  customerPoNumber: optionalText(60),
  orderDate: requiredDate,
  dueDate: optionalDate,
  startDate: optionalDay,
  startTime: optionalTime,
  endDate: optionalDay,
  endTime: optionalTime,
  venue: optionalText(200),
  headcount: z
    .union([z.literal(''), z.null(), z.coerce.number().int('Whole number').min(0).max(1_000_000)])
    .optional()
    .transform((value) => (value === '' || value === null || value === undefined ? null : value)),
  siteAddress: optionalText(300),
  siteCity: optionalText(100),
  sitePincode: z
    .union([
      z.literal(''),
      z.null(),
      z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
    ])
    .optional()
    .transform((value) => (value ? value : null)),
  status: z.enum(OrderStatus).default('DRAFT'),
  discountType: z.enum(DiscountType).default('NONE'),
  discountValue: z.coerce.number().min(0).max(99_999_999).default(0),
  advanceAmount: z.coerce.number().min(0).max(99_999_999).default(0),
  advanceChannelId: z.string().trim().default(''),
  /** The advance's method fields as posted (JSON); validated against the chosen method on the server. */
  advancePaymentDetails: z.string().max(4000).default(''),
  transportCharge: z.coerce.number().min(0).max(9_999_999).default(0),
  transportTaxRatePercent: z.coerce.number().min(0).max(100).default(0),
  notes: optionalText(2000),
  terms: optionalText(2000),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line'),
}

type ScheduleFields = {
  startDate?: string | null
  startTime?: string | null
  endDate?: string | null
  endTime?: string | null
}

function checkSchedule(value: ScheduleFields, context: z.RefinementCtx) {
  if (!value.startDate && (value.startTime || value.endDate || value.endTime)) {
    context.addIssue({ code: 'custom', path: ['startDate'], message: 'Choose a start date' })

    return
  }

  const { startsAt, endsAt } = scheduleFromFields(value)

  if (startsAt && endsAt && endsAt < startsAt) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'Ends before it starts' })
  }
}

function splitSchedule<T extends ScheduleFields>({
  startDate,
  startTime,
  endDate,
  endTime,
  ...rest
}: T) {
  return {
    ...(rest as Omit<T, keyof ScheduleFields>),
    ...scheduleFromFields({ startDate, startTime, endDate, endTime }),
  }
}

/** What a web form posts: the advance's method fields arrive as a JSON string. */
export const orderInputSchema = z
  .object(orderShape)
  .superRefine(checkSchedule)
  .transform(splitSchedule)

/**
 * The same order for the service layer and the API: JSON-native, so the
 * advance's method fields may be an object as well as a JSON string. Dates are
 * 'yyyy-mm-dd' strings, the schedule 'HH:mm' strings; the output is identical.
 */
export const orderJsonSchema = z
  .object({
    ...orderShape,
    advancePaymentDetails: z
      .union([z.string().max(4000), z.record(z.string(), z.unknown())])
      .default(''),
  })
  .superRefine(checkSchedule)
  .transform(splitSchedule)

export type OrderData = z.output<typeof orderInputSchema>
/** What the order service takes (what `orderJsonSchema` produces). */
export type OrderServiceInput = z.output<typeof orderJsonSchema>
