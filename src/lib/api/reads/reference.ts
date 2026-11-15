import { INDIA_STATES } from '@/lib/india-geo'
import { fieldsFor, methodFor, type FieldDef } from '@/lib/payment-methods'
import type { PaymentModeOption } from '@/lib/queries/payment-modes'

/** A field as the app needs it: the regex as source text, no functions. */
function fieldOut(field: FieldDef) {
  return {
    key: field.key,
    label: field.label,
    ...(field.labelOut ? { labelOut: field.labelOut } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.help ? { help: field.help } : {}),
    required: Boolean(field.required),
    type: field.type ?? 'text',
    ...(field.options ? { options: field.options } : {}),
    ...(field.pattern ? { pattern: field.pattern.source } : {}),
    ...(field.patternMessage ? { patternMessage: field.patternMessage } : {}),
    maxLength: field.maxLength,
    ...(field.inputMode ? { inputMode: field.inputMode } : {}),
  }
}

export function methodSchemaOut(mode: PaymentModeOption) {
  const method = methodFor(mode.kind)

  return {
    id: mode.id,
    name: mode.name,
    kind: mode.kind,
    label: method?.label ?? mode.kind,
    primaryField: method?.primary ?? null,
    fields: fieldsFor(mode.kind, 'in').map(fieldOut),
    fieldsOut: fieldsFor(mode.kind, 'out').map(fieldOut),
  }
}

/** Static: every state and union territory with its GST code and city suggestions. */
export function statesOut() {
  return INDIA_STATES.map((state) => ({
    name: state.name,
    code: state.code,
    gstCode: state.gstCode,
    isUnionTerritory: state.isUnionTerritory,
    cities: state.cities,
  }))
}
