import { describe, expect, it } from 'vitest'
import { isPrivateHost, pickPublicBaseUrl } from './public-url'

describe('isPrivateHost', () => {
  it('flags loopback, private ranges and .local', () => {
    for (const host of ['localhost:3000', '127.0.0.1:8080', '10.0.0.5', '192.168.1.20:3000', '172.16.0.1', '172.31.9.9', 'mac.local', '[::1]:3000', '0.0.0.0']) {
      expect(isPrivateHost(host)).toBe(true)
    }
  })

  it('lets real hosts through', () => {
    for (const host of ['app.prodlys.com', 'admin.shubhcreative.com', '172.32.0.1', '8.8.8.8']) {
      expect(isPrivateHost(host)).toBe(false)
    }
  })
})

describe('pickPublicBaseUrl', () => {
  it('prefers a valid PUBLIC_BASE_URL and trims the trailing slash', () => {
    expect(pickPublicBaseUrl({ env: 'https://app.prodlys.com/', host: 'localhost:3000', production: true })).toBe('https://app.prodlys.com')
  })

  it('ignores an invalid PUBLIC_BASE_URL', () => {
    expect(pickPublicBaseUrl({ env: 'not a url', host: 'app.prodlys.com', proto: 'https', production: true })).toBe('https://app.prodlys.com')
    expect(pickPublicBaseUrl({ env: 'ftp://x.example', host: 'app.prodlys.com', proto: 'https', production: true })).toBe('https://app.prodlys.com')
  })

  it('uses the request host when no setting exists', () => {
    expect(pickPublicBaseUrl({ host: 'app.prodlys.com', proto: 'https', production: true })).toBe('https://app.prodlys.com')
    expect(pickPublicBaseUrl({ host: 'localhost:3000', production: false })).toBe('http://localhost:3000')
  })

  it('never produces a localhost or private link in production', () => {
    expect(pickPublicBaseUrl({ host: 'localhost:3000', proto: 'http', production: true })).toBe('https://app.prodlys.com')
    expect(pickPublicBaseUrl({ host: '192.168.1.5:3000', production: true })).toBe('https://app.prodlys.com')
    expect(pickPublicBaseUrl({ production: true })).toBe('https://app.prodlys.com')
  })

  it('gives an empty base in development with nothing to go on', () => {
    expect(pickPublicBaseUrl({ production: false })).toBe('')
  })

  it('takes the first value of a forwarded proto list', () => {
    expect(pickPublicBaseUrl({ host: 'app.prodlys.com', proto: 'https, http', production: true })).toBe('https://app.prodlys.com')
  })
})
