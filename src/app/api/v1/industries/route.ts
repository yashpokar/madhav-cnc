import { apiRoute, replyWithEtag } from '@/lib/api/handler'
import { INDUSTRY_LIST } from '@/lib/industry'

// Industry templates change only with a deploy: what a new company starts with
// (stages, expense categories, units) and which areas and words the app uses.
const INDUSTRIES = INDUSTRY_LIST.map((template) => ({
  key: template.key,
  label: template.label,
  description: template.description,
  units: template.units,
  defaultUnits: template.defaultUnits,
  stages: template.stages,
  expenseCategories: template.expenseCategories,
  defaultGstRate: template.defaultGstRate,
  modules: template.modules,
  terms: template.terms,
}))

export const GET = apiRoute({ auth: 'user' }, async ({ request }) =>
  replyWithEtag(request, INDUSTRIES, { headers: { 'Cache-Control': 'private, max-age=3600' } }),
)
