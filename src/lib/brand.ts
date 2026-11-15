/**
 * Prodlys brand constants. Single source of truth for the mark geometry; the
 * static SVGs in public/brand/ and src/app/icon.svg are hand-authored copies
 * of the same values.
 */
export const BRAND = {
  name: 'Prodlys',
  wordmark: 'prodlys',
  tagline: 'Run your whole business in one place',
  description:
    'Run your whole business in one place: quotes, orders, production and billing.',
  accent: '#4f46e5',
  accentDeep: '#3730a3',
  ink: '#0b0f17',
  appUrl: 'https://app.prodlys.com',
  siteUrl: 'https://prodlys.com',
} as const

/** The "p": a stem whose bowl rises like a progress arc. 32x32 grid. */
export const MARK_VIEWBOX = '0 0 32 32'
export const MARK_PATH = 'M12 24.5V8.5h4.6a5.2 5.2 0 0 1 0 10.4H12'
export const MARK_TILE_RADIUS = 9
export const MARK_STROKE_WIDTH = 2.6
