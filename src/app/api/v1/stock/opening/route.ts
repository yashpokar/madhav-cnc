import { apiRoute } from '@/lib/api/handler'
import { decimal } from '@/lib/api/reads/format'
import { stockOpeningBody } from '@/lib/api/schemas/purchasing'
import { actorOf, must, saved } from '@/lib/api/writes'
import { openingStockLogged } from '@/lib/services/stock'

/** Sets the opening stock: a quantity and what each unit cost. Once per item or material; after that, adjust. */
export const POST = apiRoute(
  { auth: 'company', capability: 'stock:create', body: stockOpeningBody, idempotent: true },
  async ({ body, user }) => {
    const result = must(
      await openingStockLogged(actorOf(user), {
        target: { kind: body.kind, id: body.id },
        qty: body.qty,
        unitCost: body.unitCost,
        date: body.date,
      }),
    )

    return saved({ kind: body.kind, id: body.id, onHand: decimal(result.onHand) }, 201)
  },
)
