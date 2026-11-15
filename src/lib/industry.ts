import type { ItemType, OrderStatus, SupplyType, UnitOfMeasure } from '@/generated/prisma/enums'

/**
 * Industry templates: what a new company starts with, and which areas of the
 * app are relevant to it. Seeding and presentation only. Nothing here removes
 * permissions or data; a hidden module is still reachable by URL.
 *
 * Adding an industry: add its key to INDUSTRY_KEYS and a template below. The
 * tests check units, stages, categories and sample items.
 */
export const INDUSTRY_KEYS = [
  'MANUFACTURING',
  'DECORATION',
  'PHOTO_STUDIO',
  'SALON',
  'HOTEL',
  'CATERING',
  'OTHER',
] as const

export type IndustryKey = (typeof INDUSTRY_KEYS)[number]

/** What stored companies get when nothing was chosen: how every company worked before industries existed. */
export const DEFAULT_INDUSTRY: IndustryKey = 'MANUFACTURING'

export type IndustryIcon =
  | 'WrenchScrewdriverIcon'
  | 'PaintBrushIcon'
  | 'CameraIcon'
  | 'ScissorsIcon'
  | 'BuildingOffice2Icon'
  | 'CakeIcon'
  | 'Squares2X2Icon'

export type SampleItem = {
  code: string
  name: string
  type: ItemType
  supplyType: SupplyType
  unit: UnitOfMeasure
  rate: number
  /** HSN (goods) or SAC (services) hint. A starting point: confirm with your accountant. */
  hsnCode: string
  gstRate: number
}

export type StageTemplate = { name: string; linkedStatus: OrderStatus | null }

/** Words the app uses for an order, so a salon sees Bookings rather than Orders. */
export type IndustryTerms = { orders: string; order: string }

export type IndustryModules = {
  /** Production board and stages. */
  production: boolean
  /** Dispatch notes and delivery tracking. */
  dispatch: boolean
  /** Architects and carpenters who bring in work. */
  partners: boolean
}

export type IndustryTemplate = {
  key: IndustryKey
  label: string
  description: string
  icon: IndustryIcon
  /** Units offered first, in this order. Every unit stays selectable elsewhere. */
  units: UnitOfMeasure[]
  /** The unit a new item of each type starts with. */
  defaultUnits: Record<ItemType, UnitOfMeasure>
  stages: StageTemplate[]
  expenseCategories: string[]
  sampleItems: SampleItem[]
  /** GST percentage most of this industry's work attracts. */
  defaultGstRate: number
  modules: IndustryModules
  terms: IndustryTerms
}

const EXAMPLE_NOTE = 'Example item added at setup. Edit the rate and tax details, or delete it.'

const MANUFACTURING: IndustryTemplate = {
  key: 'MANUFACTURING',
  label: 'Manufacturing & fabrication',
  description: 'CNC, furniture, interiors workshop or any job shop that makes things to order.',
  icon: 'WrenchScrewdriverIcon',
  units: ['SQFT', 'SQM', 'RFT', 'RMT', 'NOS', 'SHEET', 'SET', 'KG', 'LTR', 'HOUR'],
  defaultUnits: { MATERIAL: 'SQFT', HARDWARE: 'NOS', SERVICE: 'HOUR', FINISHED_GOOD: 'NOS' },
  stages: [
    { name: 'Confirmation', linkedStatus: 'CONFIRMED' },
    { name: 'Process', linkedStatus: 'IN_PRODUCTION' },
    { name: 'Ready to dispatch', linkedStatus: 'READY' },
    { name: 'Delivered', linkedStatus: 'DISPATCHED' },
  ],
  expenseCategories: [
    'Raw material',
    'Hardware & fittings',
    'Job work',
    'Consumables',
    'Salary & wages',
    'Rent',
    'Electricity',
    'Machine maintenance',
    'Transport & freight',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Commission',
    'Other',
  ],
  sampleItems: [],
  defaultGstRate: 18,
  modules: { production: true, dispatch: true, partners: true },
  terms: { orders: 'Orders', order: 'Order' },
}

const DECORATION: IndustryTemplate = {
  key: 'DECORATION',
  label: 'Decoration & interiors',
  description: 'Event decor, stage and venue styling, home and office interior projects.',
  icon: 'PaintBrushIcon',
  units: ['EVENT', 'DAY', 'SQFT', 'RFT', 'NOS', 'SET', 'PACKAGE', 'HOUR'],
  defaultUnits: { MATERIAL: 'SQFT', HARDWARE: 'NOS', SERVICE: 'EVENT', FINISHED_GOOD: 'SET' },
  stages: [
    { name: 'Design', linkedStatus: 'CONFIRMED' },
    { name: 'Procurement', linkedStatus: null },
    { name: 'Setup', linkedStatus: 'IN_PRODUCTION' },
    { name: 'Handover', linkedStatus: 'DISPATCHED' },
  ],
  expenseCategories: [
    'Decor materials & props',
    'Flowers & greenery',
    'Rentals (furniture, lighting, drapes)',
    'Labour & setup crew',
    'Vendor & sub-contractors',
    'Transport & logistics',
    'Salary & wages',
    'Rent',
    'Electricity',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Commission',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-DEC-01', name: 'Event decoration package', type: 'SERVICE', supplyType: 'SERVICE', unit: 'EVENT', rate: 50000, hsnCode: '998596', gstRate: 18 },
    { code: 'EX-DEC-02', name: 'Stage backdrop and styling', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SET', rate: 15000, hsnCode: '998596', gstRate: 18 },
    { code: 'EX-DEC-03', name: 'Flower decoration', type: 'SERVICE', supplyType: 'SERVICE', unit: 'DAY', rate: 8000, hsnCode: '998596', gstRate: 18 },
    { code: 'EX-DEC-04', name: 'Interior design and execution', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SQFT', rate: 150, hsnCode: '998391', gstRate: 18 },
  ],
  defaultGstRate: 18,
  modules: { production: true, dispatch: false, partners: true },
  terms: { orders: 'Events', order: 'Event' },
}

const PHOTO_STUDIO: IndustryTemplate = {
  key: 'PHOTO_STUDIO',
  label: 'Photo & video studio',
  description: 'Weddings, portraits, product and event shoots, albums and edits.',
  icon: 'CameraIcon',
  units: ['SESSION', 'DAY', 'HOUR', 'PACKAGE', 'NOS', 'SET', 'EVENT'],
  defaultUnits: { MATERIAL: 'NOS', HARDWARE: 'NOS', SERVICE: 'SESSION', FINISHED_GOOD: 'NOS' },
  stages: [
    { name: 'Booked', linkedStatus: 'CONFIRMED' },
    { name: 'Shoot', linkedStatus: 'IN_PRODUCTION' },
    { name: 'Editing', linkedStatus: null },
    { name: 'Delivered', linkedStatus: 'DISPATCHED' },
  ],
  expenseCategories: [
    'Equipment & repairs',
    'Studio rent',
    'Assistants & freelancers',
    'Editing & software',
    'Albums, prints & frames',
    'Travel & accommodation',
    'Salary & wages',
    'Electricity',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-PHO-01', name: 'Wedding photography package', type: 'SERVICE', supplyType: 'SERVICE', unit: 'PACKAGE', rate: 60000, hsnCode: '998383', gstRate: 18 },
    { code: 'EX-PHO-02', name: 'Portrait or product shoot', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SESSION', rate: 5000, hsnCode: '998383', gstRate: 18 },
    { code: 'EX-PHO-03', name: 'Event coverage (per hour)', type: 'SERVICE', supplyType: 'SERVICE', unit: 'HOUR', rate: 2000, hsnCode: '998383', gstRate: 18 },
    { code: 'EX-PHO-04', name: 'Photo album', type: 'FINISHED_GOOD', supplyType: 'GOODS', unit: 'NOS', rate: 6000, hsnCode: '4901', gstRate: 12 },
  ],
  defaultGstRate: 18,
  modules: { production: true, dispatch: false, partners: false },
  terms: { orders: 'Bookings', order: 'Booking' },
}

const SALON: IndustryTemplate = {
  key: 'SALON',
  label: 'Salon & spa',
  description: 'Hair, beauty, grooming and wellness services by appointment.',
  icon: 'ScissorsIcon',
  units: ['SESSION', 'HOUR', 'NOS', 'PACKAGE', 'SET'],
  defaultUnits: { MATERIAL: 'NOS', HARDWARE: 'NOS', SERVICE: 'SESSION', FINISHED_GOOD: 'NOS' },
  stages: [],
  expenseCategories: [
    'Products & consumables',
    'Staff salary & commission',
    'Rent',
    'Electricity & water',
    'Equipment & repairs',
    'Laundry & housekeeping',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-SAL-01', name: 'Haircut', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SESSION', rate: 400, hsnCode: '999721', gstRate: 18 },
    { code: 'EX-SAL-02', name: 'Hair colour', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SESSION', rate: 2000, hsnCode: '999721', gstRate: 18 },
    { code: 'EX-SAL-03', name: 'Facial', type: 'SERVICE', supplyType: 'SERVICE', unit: 'SESSION', rate: 1500, hsnCode: '999722', gstRate: 18 },
    { code: 'EX-SAL-04', name: 'Bridal makeup package', type: 'SERVICE', supplyType: 'SERVICE', unit: 'PACKAGE', rate: 15000, hsnCode: '999722', gstRate: 18 },
  ],
  defaultGstRate: 18,
  modules: { production: false, dispatch: false, partners: false },
  terms: { orders: 'Bookings', order: 'Booking' },
}

const HOTEL: IndustryTemplate = {
  key: 'HOTEL',
  label: 'Hotel & stay',
  description: 'Hotels, guest houses and homestays: rooms, meals and extras.',
  icon: 'BuildingOffice2Icon',
  units: ['NIGHT', 'DAY', 'PLATE', 'NOS', 'PACKAGE', 'HOUR', 'KG'],
  defaultUnits: { MATERIAL: 'NOS', HARDWARE: 'NOS', SERVICE: 'NIGHT', FINISHED_GOOD: 'NOS' },
  stages: [],
  expenseCategories: [
    'Housekeeping & laundry',
    'Food & beverage supplies',
    'Utilities',
    'Staff salary & wages',
    'Rent or property tax',
    'Repairs & maintenance',
    'Booking commissions',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-HOT-01', name: 'Standard room', type: 'SERVICE', supplyType: 'SERVICE', unit: 'NIGHT', rate: 3000, hsnCode: '996311', gstRate: 12 },
    { code: 'EX-HOT-02', name: 'Deluxe room', type: 'SERVICE', supplyType: 'SERVICE', unit: 'NIGHT', rate: 5500, hsnCode: '996311', gstRate: 12 },
    { code: 'EX-HOT-03', name: 'Breakfast', type: 'SERVICE', supplyType: 'SERVICE', unit: 'PLATE', rate: 250, hsnCode: '996331', gstRate: 5 },
    { code: 'EX-HOT-04', name: 'Extra bed', type: 'SERVICE', supplyType: 'SERVICE', unit: 'NIGHT', rate: 800, hsnCode: '996311', gstRate: 12 },
  ],
  defaultGstRate: 12,
  modules: { production: false, dispatch: false, partners: false },
  terms: { orders: 'Bookings', order: 'Booking' },
}

const CATERING: IndustryTemplate = {
  key: 'CATERING',
  label: 'Catering & food service',
  description: 'Event catering, tiffin and bulk food orders by plate or by guest.',
  icon: 'CakeIcon',
  units: ['PLATE', 'GUEST', 'KG', 'LTR', 'EVENT', 'PACKAGE', 'NOS', 'SET'],
  defaultUnits: { MATERIAL: 'KG', HARDWARE: 'NOS', SERVICE: 'PLATE', FINISHED_GOOD: 'KG' },
  stages: [
    { name: 'Booked', linkedStatus: 'CONFIRMED' },
    { name: 'Menu confirmed', linkedStatus: null },
    { name: 'Preparation', linkedStatus: 'IN_PRODUCTION' },
    { name: 'Served', linkedStatus: 'DISPATCHED' },
  ],
  expenseCategories: [
    'Groceries & raw material',
    'Vegetables, dairy & meat',
    'Gas & fuel',
    'Cooks & kitchen staff',
    'Service staff & helpers',
    'Crockery & equipment rental',
    'Transport & delivery',
    'Packaging',
    'Rent',
    'Electricity & water',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-CAT-01', name: 'Veg buffet (per plate)', type: 'SERVICE', supplyType: 'SERVICE', unit: 'PLATE', rate: 450, hsnCode: '996334', gstRate: 5 },
    { code: 'EX-CAT-02', name: 'Non-veg buffet (per plate)', type: 'SERVICE', supplyType: 'SERVICE', unit: 'PLATE', rate: 650, hsnCode: '996334', gstRate: 5 },
    { code: 'EX-CAT-03', name: 'Party package (per guest)', type: 'SERVICE', supplyType: 'SERVICE', unit: 'GUEST', rate: 800, hsnCode: '996334', gstRate: 5 },
    { code: 'EX-CAT-04', name: 'Sweets and snacks', type: 'FINISHED_GOOD', supplyType: 'GOODS', unit: 'KG', rate: 600, hsnCode: '2106', gstRate: 5 },
  ],
  defaultGstRate: 5,
  modules: { production: true, dispatch: false, partners: false },
  terms: { orders: 'Events', order: 'Event' },
}

const OTHER: IndustryTemplate = {
  key: 'OTHER',
  label: 'Other',
  description: 'Anything else. A general set of units, stages and categories you can reshape.',
  icon: 'Squares2X2Icon',
  units: ['NOS', 'HOUR', 'DAY', 'SET', 'PACKAGE', 'SESSION', 'KG', 'LTR'],
  defaultUnits: { MATERIAL: 'NOS', HARDWARE: 'NOS', SERVICE: 'HOUR', FINISHED_GOOD: 'NOS' },
  stages: [
    { name: 'Confirmed', linkedStatus: 'CONFIRMED' },
    { name: 'In progress', linkedStatus: 'IN_PRODUCTION' },
    { name: 'Delivered', linkedStatus: 'DISPATCHED' },
  ],
  expenseCategories: [
    'Purchases & materials',
    'Salary & wages',
    'Rent',
    'Electricity',
    'Transport',
    'Marketing',
    'Office & admin',
    'Bank & finance charges',
    'Taxes & fees',
    'Other',
  ],
  sampleItems: [
    { code: 'EX-GEN-01', name: 'Service (per hour)', type: 'SERVICE', supplyType: 'SERVICE', unit: 'HOUR', rate: 1000, hsnCode: '9983', gstRate: 18 },
    { code: 'EX-GEN-02', name: 'Product', type: 'FINISHED_GOOD', supplyType: 'GOODS', unit: 'NOS', rate: 500, hsnCode: '', gstRate: 18 },
  ],
  defaultGstRate: 18,
  modules: { production: true, dispatch: false, partners: false },
  terms: { orders: 'Orders', order: 'Order' },
}

export const INDUSTRIES: Record<IndustryKey, IndustryTemplate> = {
  MANUFACTURING,
  DECORATION,
  PHOTO_STUDIO,
  SALON,
  HOTEL,
  CATERING,
  OTHER,
}

export const INDUSTRY_LIST: readonly IndustryTemplate[] = INDUSTRY_KEYS.map((key) => INDUSTRIES[key])

export function isIndustryKey(value: unknown): value is IndustryKey {
  return typeof value === 'string' && (INDUSTRY_KEYS as readonly string[]).includes(value)
}

/** Unknown or missing values fall back to how companies worked before industries existed. */
export function getIndustry(key: string | null | undefined): IndustryTemplate {
  return isIndustryKey(key) ? INDUSTRIES[key] : INDUSTRIES[DEFAULT_INDUSTRY]
}

export { EXAMPLE_NOTE as SAMPLE_ITEM_NOTE }
