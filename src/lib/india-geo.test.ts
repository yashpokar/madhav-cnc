import { describe, expect, it } from 'vitest'
import {
  INDIA_STATES,
  canonicalCity,
  citiesFor,
  isValidPincode,
  normaliseState,
  normaliseStateName,
  stateByCode,
  stateByName,
  stateFromGstin,
  stateFromPincode,
} from './india-geo'
import { parsePincodeResponse } from './pincode-lookup'

const GST_CODES: Record<string, string> = {
  'Jammu and Kashmir': '01',
  'Himachal Pradesh': '02',
  Punjab: '03',
  Chandigarh: '04',
  Uttarakhand: '05',
  Haryana: '06',
  Delhi: '07',
  Rajasthan: '08',
  'Uttar Pradesh': '09',
  Bihar: '10',
  Sikkim: '11',
  'Arunachal Pradesh': '12',
  Nagaland: '13',
  Manipur: '14',
  Mizoram: '15',
  Tripura: '16',
  Meghalaya: '17',
  Assam: '18',
  'West Bengal': '19',
  Jharkhand: '20',
  Odisha: '21',
  Chhattisgarh: '22',
  'Madhya Pradesh': '23',
  Gujarat: '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Maharashtra: '27',
  Karnataka: '29',
  Goa: '30',
  Lakshadweep: '31',
  Kerala: '32',
  'Tamil Nadu': '33',
  Puducherry: '34',
  'Andaman and Nicobar Islands': '35',
  Telangana: '36',
  'Andhra Pradesh': '37',
  Ladakh: '38',
}

describe('india-geo registry', () => {
  it('has 28 states and 8 union territories', () => {
    expect(INDIA_STATES).toHaveLength(36)
    expect(INDIA_STATES.filter((s) => s.isUnionTerritory)).toHaveLength(8)
  })

  it('has unique names and codes', () => {
    const names = INDIA_STATES.map((s) => s.name)
    const codes = INDIA_STATES.map((s) => s.code)
    const gst = INDIA_STATES.map((s) => s.gstCode)
    expect(new Set(names).size).toBe(36)
    expect(new Set(codes).size).toBe(36)
    expect(new Set(gst).size).toBe(36)
  })

  it('matches the GST state code table', () => {
    for (const state of INDIA_STATES) {
      expect(GST_CODES[state.name], state.name).toBe(state.gstCode)
    }
    expect(Object.keys(GST_CODES)).toHaveLength(36)
  })

  it('keeps city lists sorted, unique and non-empty', () => {
    for (const state of INDIA_STATES) {
      expect(state.cities.length, state.name).toBeGreaterThan(5)
      expect(new Set(state.cities).size, state.name).toBe(state.cities.length)
      const sorted = [...state.cities].sort((a, b) => a.localeCompare(b, 'en'))
      expect(state.cities, state.name).toEqual(sorted)
    }
  })

  it('lists the key Gujarat cities', () => {
    const cities = citiesFor('Gujarat')
    for (const city of [
      'Surat',
      'Ahmedabad',
      'Vadodara',
      'Rajkot',
      'Bhavnagar',
      'Jamnagar',
      'Gandhinagar',
      'Navsari',
      'Valsad',
      'Vapi',
      'Morbi',
      'Anand',
      'Bharuch',
      'Mehsana',
    ]) {
      expect(cities).toContain(city)
    }
  })
})

describe('lookups', () => {
  it('finds states by name, code and alias', () => {
    expect(stateByName('gujarat')?.code).toBe('GJ')
    expect(stateByName('  GUJARAT ')?.gstCode).toBe('24')
    expect(stateByName('Orissa')?.name).toBe('Odisha')
    expect(normaliseStateName('Pondicherry')).toBe('Puducherry')
    expect(normaliseStateName('Jammu & Kashmir')).toBe('Jammu and Kashmir')
    expect(normaliseStateName('Daman and Diu')).toBe(
      'Dadra and Nagar Haveli and Daman and Diu',
    )
    expect(normaliseState('MH')?.name).toBe('Maharashtra')
    expect(stateByCode('27')?.name).toBe('Maharashtra')
    expect(stateByCode('gj')?.name).toBe('Gujarat')
    expect(stateByName('Atlantis')).toBeNull()
    expect(stateByName('')).toBeNull()
    expect(stateByName(null)).toBeNull()
  })

  it('derives the state from a GSTIN', () => {
    expect(stateFromGstin('24ABCDE1234F1Z5')?.name).toBe('Gujarat')
    expect(stateFromGstin('27ABCDE1234F1Z5')?.name).toBe('Maharashtra')
    expect(stateFromGstin('25ABCDE1234F1Z5')).toBeNull()
    expect(stateFromGstin('XXABCDE1234F1Z5')).toBeNull()
    expect(stateFromGstin('')).toBeNull()
  })

  it('validates pincodes', () => {
    expect(isValidPincode('395007')).toBe(true)
    expect(isValidPincode('095007')).toBe(false)
    expect(isValidPincode('39500')).toBe(false)
    expect(isValidPincode('3950070')).toBe(false)
    expect(isValidPincode('39500a')).toBe(false)
    expect(isValidPincode(null)).toBe(false)
  })

  it('derives the state from unambiguous pincodes only', () => {
    expect(stateFromPincode('395007')?.name).toBe('Gujarat')
    expect(stateFromPincode('380001')?.name).toBe('Gujarat')
    expect(stateFromPincode('400001')?.name).toBe('Maharashtra')
    expect(stateFromPincode('110001')?.name).toBe('Delhi')
    expect(stateFromPincode('682551')?.name).toBe('Lakshadweep')
    expect(stateFromPincode('682001')?.name).toBe('Kerala')
    // Shared circles and invalid values stay unknown.
    expect(stateFromPincode('396210')).toBeNull()
    expect(stateFromPincode('160017')).toBeNull()
    expect(stateFromPincode('605001')).toBeNull()
    expect(stateFromPincode('12345')).toBeNull()
  })

  it('resolves canonical city spellings', () => {
    expect(canonicalCity('Gujarat', 'surat')).toBe('Surat')
    expect(canonicalCity('Gujarat', 'Baroda')).toBe('Vadodara')
    expect(canonicalCity('Gujarat', 'Ahmadabad')).toBe('Ahmedabad')
    expect(canonicalCity('Gujarat', 'Pune')).toBeNull()
    expect(canonicalCity('Maharashtra', 'Bombay')).toBe('Mumbai')
    expect(canonicalCity(null, 'Surat')).toBeNull()
  })
})

describe('parsePincodeResponse', () => {
  it('reads a successful answer', () => {
    expect(
      parsePincodeResponse([
        {
          Status: 'Success',
          PostOffice: [{ Name: 'Ring Road', District: 'Surat', State: 'Gujarat' }],
        },
      ]),
    ).toEqual({ state: 'Gujarat', city: 'Surat' })
  })

  it('maps spelling variants and ignores failures', () => {
    expect(
      parsePincodeResponse([
        { Status: 'Success', PostOffice: [{ District: 'Ahmadabad', State: 'Gujarat' }] },
      ]),
    ).toEqual({ state: 'Gujarat', city: 'Ahmedabad' })
    expect(parsePincodeResponse([{ Status: 'Error', PostOffice: null }])).toBeNull()
    expect(parsePincodeResponse({})).toBeNull()
    expect(parsePincodeResponse(null)).toBeNull()
  })
})
