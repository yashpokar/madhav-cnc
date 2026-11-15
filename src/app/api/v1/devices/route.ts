import { COMPANY_HEADER, requireApiCompany } from '@/lib/api/auth'
import { apiRoute } from '@/lib/api/handler'
import { deviceBody } from '@/lib/api/schemas/writes'
import { saved } from '@/lib/api/writes'
import { prisma } from '@/lib/prisma'

/**
 * Registers this phone for push notifications. Idempotent: the same Expo push
 * token is updated in place (and moves to this person if the phone changed
 * hands). It belongs to the person, not a company; X-Company-Id, when sent,
 * records which company they are working in. Sign-out should call DELETE.
 */
export const POST = apiRoute({ auth: 'user', body: deviceBody, idempotent: true }, async ({ request, user, body }) => {
  // The company is only recorded; it is checked like everywhere else when sent.
  const companyId = request.headers.get(COMPANY_HEADER)?.trim()
    ? (await requireApiCompany(user, request)).companyId
    : null

  const device = await prisma.deviceToken.upsert({
    where: { expoPushToken: body.expoPushToken },
    create: {
      userId: user.id,
      companyId,
      expoPushToken: body.expoPushToken,
      platform: body.platform,
      appVersion: body.appVersion ?? null,
      locale: body.locale ?? null,
    },
    update: {
      userId: user.id,
      companyId,
      platform: body.platform,
      appVersion: body.appVersion ?? null,
      locale: body.locale ?? null,
      lastSeenAt: new Date(),
      revokedAt: null,
    },
    select: { id: true, expoPushToken: true, platform: true, companyId: true, appVersion: true, locale: true },
  })

  return saved(device)
})
