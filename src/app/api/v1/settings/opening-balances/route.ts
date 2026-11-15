import { apiRoute, reply } from '@/lib/api/handler'
import { mustMap } from '@/lib/api/master'
import { openingBalanceRows } from '@/lib/api/reads/master'
import { openingBalancesBody } from '@/lib/api/schemas/master'
import { userActorOf } from '@/lib/api/writes'
import { saveOpeningBalances } from '@/lib/services/adjustments'

/** What each payment mode held when the books were opened (amount and as-of date are null until entered). */
export const GET = apiRoute({ auth: 'company', capability: 'settings:update' }, async () =>
  reply(await openingBalanceRows()),
)

/**
 * Saves the opening cash and bank balance of the modes sent (a null amount
 * removes that entry; modes not sent are left alone). Repeating it is safe, so
 * there is no idempotency key. Answers the whole list.
 */
export const PUT = apiRoute(
  { auth: 'company', capability: 'settings:update', body: openingBalancesBody },
  async ({ body, user }) => {
    mustMap(
      await saveOpeningBalances(
        userActorOf(user),
        body.balances.map((row) => ({
          channelId: row.channelId,
          amount: row.amount === null ? '' : String(row.amount),
          asOf: row.asOf ?? '',
        })),
      ),
      [
        [/no longer exists/i, 'NOT_FOUND'],
        [/./, 'VALIDATION_FAILED', 'balances'],
      ],
    )

    return reply(await openingBalanceRows())
  },
)
