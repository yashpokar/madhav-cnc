#!/usr/bin/env node
// Smoke test for a running Prodlys server. No dependencies.
//
//   node scripts/smoke.mjs                      # BASE_URL=http://localhost:3000, full run
//   BASE_URL=https://app.prodlys.com SMOKE_MODE=readonly node scripts/smoke.mjs
//
// SMOKE_MODE=readonly (production) only makes GETs plus one sign-in attempt that
// must be rejected; it never creates data. The default full mode signs up users,
// creates companies and seeds customers, so run it only against a throwaway
// database (CI, a scratch local DB).
import { execFileSync } from 'node:child_process'

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const READONLY = process.env.SMOKE_MODE === 'readonly'
const EXPECT_COMMIT = process.env.EXPECT_COMMIT || ''

let failures = 0
const check = (ok, label, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail ? `  -> ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    redirect: 'manual',
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, headers: res.headers, text, json }
}

async function publicChecks() {
  const signIn = await call('GET', '/sign-in')
  check(signIn.status === 200, 'GET /sign-in is 200', String(signIn.status))

  if (EXPECT_COMMIT) {
    const dpl = /data-dpl-id="([^"]*)"/.exec(signIn.text)?.[1]
    check(dpl === EXPECT_COMMIT, `/sign-in serves data-dpl-id ${EXPECT_COMMIT.slice(0, 7)}`, `got ${dpl}`)
  }

  const meta = await call('GET', '/api/v1/meta')
  check(meta.status === 200, 'GET /api/v1/meta is 200', String(meta.status))
  check(meta.json?.data?.apiVersion === '1', 'meta envelope has data.apiVersion "1"')
  check(typeof meta.json?.data?.release?.version === 'string', 'meta carries release.version')
  check(Boolean(meta.headers.get('x-request-id')), 'meta carries X-Request-Id')
  if (EXPECT_COMMIT) {
    check(meta.json?.data?.release?.commit === EXPECT_COMMIT, 'meta release.commit matches', String(meta.json?.data?.release?.commit))
  }

  const me = await call('GET', '/api/v1/me')
  check(me.status === 401, 'GET /api/v1/me without a token is 401', String(me.status))
  check(me.json?.error?.code === 'UNAUTHENTICATED', 'me error envelope code is UNAUTHENTICATED', me.text.slice(0, 200))

  const spec = await call('GET', '/api/v1/openapi.json')
  check(spec.status === 200, 'GET /api/v1/openapi.json is 200', String(spec.status))
  check(Boolean(spec.json?.openapi), 'openapi.json is an OpenAPI document')

  const bad = await call('GET', '/i/does-not-exist-smoke')
  check(bad.status === 404, 'GET /i/<bad token> is 404', String(bad.status))

  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const r = await call('GET', path)
    if (r.status === 404) console.log(`SKIP  ${path} not served`)
    else check(r.status === 200, `GET ${path} is 200`, String(r.status))
  }

  const login = await call('POST', '/api/auth/sign-in/email', {
    headers: { 'expo-origin': 'prodlys://', origin: BASE },
    body: { email: 'nobody-smoke@example.invalid', password: 'wrong-password-123' },
  })
  // 429 means the sign-in rate limiter already answered a recent attempt from
  // this address, which is the same rejection; never a 200.
  check(login.status === 401 || login.status === 429, 'POST /api/auth/sign-in/email with bad credentials is rejected (401)', String(login.status))
}

async function authedUser(tag) {
  const email = `smoke-${tag}-${Date.now()}@example.com`
  const password = 'Smoke-test-pass-123'
  const headers = { 'expo-origin': 'prodlys://', origin: BASE }
  const up = await call('POST', '/api/auth/sign-up/email', { headers, body: { email, password, name: `Smoke ${tag}` } })
  check(up.status === 200, `sign up user ${tag}`, `${up.status} ${up.text.slice(0, 200)}`)
  const inn = await call('POST', '/api/auth/sign-in/email', { headers, body: { email, password } })
  const token = inn.headers.get('set-auth-token')
  check(inn.status === 200 && Boolean(token), `sign in user ${tag} returns set-auth-token`, `${inn.status} ${inn.text.slice(0, 200)}`)
  return { auth: { authorization: `Bearer ${token}` } }
}

async function createCompany(user, name) {
  const res = await call('POST', '/api/v1/companies', {
    headers: { ...user.auth, 'idempotency-key': `smoke-${name.replace(/\s/g, '-')}-${Date.now()}` },
    body: { companyName: name, industry: 'MANUFACTURING' },
  })
  check(res.status === 201, `create company ${name}`, `${res.status} ${res.text.slice(0, 200)}`)
  return res.json?.data?.company?.id
}

function seedCustomer(companyId, name) {
  execFileSync('node_modules/.bin/tsx', ['scripts/smoke-seed.ts', name], {
    stdio: 'inherit',
    env: { ...process.env, SEED_COMPANY_ID: companyId },
  })
}

async function tenancyChecks() {
  const a = await authedUser('a')
  const b = await authedUser('b')
  const companyA = await createCompany(a, 'Smoke Co A')
  const companyB = await createCompany(b, 'Smoke Co B')

  if (!companyA || !companyB) return check(false, 'both companies were created')
  check(companyA !== companyB, 'companies have distinct ids')

  seedCustomer(companyA, 'Smoke Customer Alpha')
  seedCustomer(companyB, 'Smoke Customer Beta')

  const list = async (user, companyId) => {
    const r = await call('GET', '/api/v1/customers', { headers: { ...user.auth, 'x-company-id': companyId } })
    return { status: r.status, names: (r.json?.data ?? []).map((c) => c.name) }
  }

  const listA = await list(a, companyA)
  check(listA.status === 200, 'user A lists customers of company A', String(listA.status))
  check(listA.names.length === 1 && listA.names[0] === 'Smoke Customer Alpha', 'company A sees only its own customer', JSON.stringify(listA.names))

  const listB = await list(b, companyB)
  check(listB.status === 200, 'user B lists customers of company B', String(listB.status))
  check(listB.names.length === 1 && listB.names[0] === 'Smoke Customer Beta', 'company B sees only its own customer', JSON.stringify(listB.names))

  const cross = await list(a, companyB)
  check(cross.status === 403 || cross.status === 404, 'user A cannot read company B', `${cross.status} ${JSON.stringify(cross.names)}`)
  check(!cross.names.includes('Smoke Customer Beta'), 'no company B data leaked to user A')
}

console.log(`Smoke test against ${BASE} (${READONLY ? 'read-only' : 'full'})`)
await publicChecks()
if (!READONLY) await tenancyChecks()

if (failures) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nAll smoke checks passed')
