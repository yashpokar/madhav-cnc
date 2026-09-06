export type FormState =
  | { status: 'idle' }
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string>
      values?: Record<string, string>
    }
  | { status: 'success'; message: string; id?: string }

export function fieldErrorsFrom(error: {
  issues: { path: PropertyKey[]; message: string }[]
}) {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.')

    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message
    }
  }

  return fieldErrors
}

export function rawValues(formData: FormData) {
  const values: Record<string, string> = {}

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      values[key] = value
    }
  }

  return values
}
