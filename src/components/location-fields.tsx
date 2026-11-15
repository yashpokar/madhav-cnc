'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CitySelect } from '@/components/city-select'
import { Field, Label } from '@/components/catalyst/fieldset'
import { PincodeInput } from '@/components/pincode-input'
import { StateSelect } from '@/components/state-select'
import {
  INDIA_STATES,
  canonicalCity,
  isValidPincode,
  normaliseState,
  stateFromGstin,
  stateFromPincode,
} from '@/lib/india-geo'
import { lookupPincode, type PincodeSuggestion } from '@/lib/pincode-lookup'

type Names = {
  /** Pass null when the record has no state column: it is then not submitted. */
  state: string | null
  city: string
  pincode: string
}

const DEFAULT_NAMES: Names = { state: 'state', city: 'city', pincode: 'pincode' }

/** The one state whose city list has this city, if there is exactly one. */
function stateOfCity(city: string): string {
  const matches = INDIA_STATES.filter((state) => canonicalCity(state.name, city))

  return matches.length === 1 ? matches[0].name : ''
}

const chip =
  'inline-flex items-center rounded-full bg-accent-50 px-2.5 py-1 text-xs font-medium text-accent-700 ring-1 ring-accent-600/20 hover:bg-accent-100 dark:bg-accent-500/10 dark:text-accent-300'

/**
 * State, city and pincode for an Indian address, in that order. The values are
 * submitted through hidden inputs under the same names the forms used when
 * these were three plain text boxes, so server actions are unchanged.
 *
 * - State stores the canonical registry name; unknown legacy text is kept.
 * - City lists the state's cities but accepts any text.
 * - A valid pincode can suggest (or fill, when empty) the state and city.
 * - A GSTIN in the same form (input named by `gstinFieldName`) can suggest the
 *   state, or gently flag when it disagrees.
 */
export function LocationFields({
  defaultState,
  defaultCity,
  defaultPincode,
  names,
  errors,
  gstinFieldName = 'gstin',
  className = 'grid grid-cols-1 gap-6 sm:grid-cols-3',
  city: controlledCity,
  pincode: controlledPincode,
  onCityChange,
  onPincodeChange,
}: {
  defaultState?: string | null
  defaultCity?: string | null
  defaultPincode?: string | null
  names?: Partial<Names>
  errors?: { state?: string; city?: string; pincode?: string }
  gstinFieldName?: string | null
  className?: string
  /**
   * Optional controlled city/pincode, for forms that fill them from elsewhere
   * (e.g. a site address copied from the customer).
   */
  city?: string
  pincode?: string
  onCityChange?: (city: string) => void
  onPincodeChange?: (pincode: string) => void
}) {
  const fieldNames = { ...DEFAULT_NAMES, ...names }
  const storesState = fieldNames.state !== null
  const initialState = defaultState?.trim()
    ? (normaliseState(defaultState)?.name ?? defaultState.trim())
    : ''

  const [explicitState, setExplicitState] = useState<string | null>(
    initialState || null,
  )
  const [ownCity, setOwnCity] = useState(defaultCity ?? '')
  const [ownPincode, setOwnPincode] = useState(defaultPincode ?? '')
  const city = controlledCity ?? ownCity
  const pincode = controlledPincode ?? ownPincode

  // Without a state column, the state is only a helper for picking the city,
  // so it follows the city and pincode until the user chooses one.
  const inferred = useMemo(
    () =>
      storesState
        ? ''
        : (stateFromPincode(pincode)?.name ?? (city ? stateOfCity(city) : '')),
    [storesState, pincode, city],
  )
  const state = explicitState ?? inferred
  const [suggestion, setSuggestion] = useState<PincodeSuggestion | null>(null)
  const [gstin, setGstin] = useState('')

  const stateRef = useRef(state)
  const cityRef = useRef(city)
  const abortRef = useRef<AbortController | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stateRef.current = state
    cityRef.current = city
  }, [state, city])

  function setState(next: string) {
    stateRef.current = next
    setExplicitState(next)
  }

  function setCity(next: string) {
    cityRef.current = next
    setOwnCity(next)
    onCityChange?.(next)
  }

  useEffect(() => () => abortRef.current?.abort(), [])

  // Follow the form's GSTIN input without taking it over.
  useEffect(() => {
    if (!gstinFieldName) return
    const form = rootRef.current?.closest('form')
    if (!form) return

    const read = () => {
      const field = form.elements.namedItem(gstinFieldName)
      setGstin(field instanceof HTMLInputElement ? field.value : '')
    }
    const onInput = (event: Event) => {
      const target = event.target
      if (target instanceof HTMLInputElement && target.name === gstinFieldName) {
        setGstin(target.value)
      }
    }

    read()
    form.addEventListener('input', onInput)

    return () => form.removeEventListener('input', onInput)
  }, [gstinFieldName])

  function changeState(next: string) {
    const previous = stateRef.current
    const current = cityRef.current

    // Only a city that came from the old list is replaced; typed text stays.
    if (
      current &&
      canonicalCity(previous, current) &&
      !canonicalCity(next, current)
    ) {
      setCity('')
    }

    setState(next)
    setSuggestion(null)
  }

  function applySuggestion(found: PincodeSuggestion) {
    setState(found.state)
    setCity(found.city)
    setSuggestion(null)
  }

  async function changePincode(next: string) {
    setOwnPincode(next)
    onPincodeChange?.(next)
    setSuggestion(null)
    abortRef.current?.abort()

    if (!isValidPincode(next)) return

    // Empty state: the pincode alone often tells us, without any request.
    const local = stateFromPincode(next)
    if (local && !stateRef.current) setState(local.name)

    const controller = new AbortController()
    abortRef.current = controller

    const found = await lookupPincode(next, controller.signal)
    if (!found || controller.signal.aborted) return

    const haveState = stateRef.current
    const haveCity = cityRef.current.trim()
    const sameState = normaliseState(haveState)?.name === found.state

    if (!haveState && !haveCity) {
      applySuggestion(found)
    } else if (!haveState) {
      setState(found.state)
    } else if (sameState && !haveCity) {
      setCity(found.city)
    } else if (
      !sameState ||
      (haveCity && haveCity.toLowerCase() !== found.city.toLowerCase())
    ) {
      setSuggestion(found)
    }
  }

  const fromGstin = stateFromGstin(gstin)
  const chosen = normaliseState(state)
  const gstinSuggests = fromGstin && !state ? fromGstin : null
  const gstinDisagrees =
    fromGstin && chosen && chosen.gstCode !== fromGstin.gstCode ? fromGstin : null

  return (
    <div ref={rootRef} className="space-y-3">
      <div className={className}>
        <Field>
          <Label>State</Label>
          <StateSelect value={state} onChange={changeState} invalid={Boolean(errors?.state)} />
          {state.trim() && !chosen ? (
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              Other: not in the standard list. Saved as typed.
            </p>
          ) : null}
        </Field>
        <Field>
          <Label>City</Label>
          <CitySelect
            value={city}
            onChange={(next) => {
              setCity(next)
              setSuggestion(null)
            }}
            state={state}
            invalid={Boolean(errors?.city)}
          />
        </Field>
        <Field>
          <Label>Pincode</Label>
          <PincodeInput value={pincode} onChange={changePincode} error={errors?.pincode} />
        </Field>
      </div>

      {suggestion ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <button type="button" className={chip} onClick={() => applySuggestion(suggestion)}>
            Use {suggestion.city}, {suggestion.state}?
          </button>
          <button
            type="button"
            className="text-xs text-zinc-500 hover:text-zinc-700"
            onClick={() => setSuggestion(null)}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {gstinSuggests ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          The GSTIN is registered in {gstinSuggests.name}.
          <button
            type="button"
            className={chip}
            onClick={() => changeState(gstinSuggests.name)}
          >
            Use {gstinSuggests.name}
          </button>
        </p>
      ) : null}

      {gstinDisagrees ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          The GSTIN starts with {gstinDisagrees.gstCode} ({gstinDisagrees.name}), but the state is{' '}
          {chosen?.name}. That is fine if the address is elsewhere.
        </p>
      ) : null}

      {fieldNames.state !== null ? (
        <input type="hidden" name={fieldNames.state} value={state} />
      ) : null}
      <input type="hidden" name={fieldNames.city} value={city} />
      <input type="hidden" name={fieldNames.pincode} value={pincode} />
    </div>
  )
}
