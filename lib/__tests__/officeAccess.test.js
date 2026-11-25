import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@vercel/kv'
import { verifyAccessCode } from '../cookieAuth.js'
import { authOpen, getSessionUser } from '../auth.js'
import { isOfficeOwner } from '../office/access.js'
import { GET, POST } from '../../app/api/office/route.js'

vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

vi.mock('../auth.js', () => ({ authOpen: vi.fn(() => false), getSessionUser: vi.fn() }))

vi.mock('../cookieAuth.js', () => ({ verifyAccessCode: vi.fn() }))
beforeEach(() => {
  vi.stubEnv('ADMIN_CODE', 'test-admin')
  vi.mocked(verifyAccessCode).mockResolvedValue(true)
})
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('owner-only office', () => {
  it('requires the designated owner account', async () => {
    vi.stubEnv('OFFICE_OWNER_EMAIL', 'owner@example.com')
    const request = new Request('https://preview.example/office', { headers: { cookie: 'estate_admin=signed-token' } })
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(getSessionUser).mockResolvedValue({ email: 'owner@example.com' })
    expect(await isOfficeOwner(request)).toBe(true)
    vi.mocked(verifyAccessCode).mockResolvedValue(false)
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(verifyAccessCode).mockResolvedValue(true)
    vi.mocked(getSessionUser).mockResolvedValue({ email: 'other@example.com' })
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(authOpen).mockReturnValue(true)
    expect(await isOfficeOwner(request)).toBe(false)
  })

  it('denies all access when no owner is configured', async () => {
    vi.stubEnv('OFFICE_OWNER_EMAIL', '')
    vi.mocked(getSessionUser).mockResolvedValue({ email: 'owner@example.com' })
    const request = new Request('https://preview.example/api/office')
    expect((await GET(request)).status).toBe(403)
    expect((await POST(request)).status).toBe(403)
  })

  it('rejects cross-site writes before reaching storage', async () => {
    vi.stubEnv('OFFICE_OWNER_EMAIL', 'owner@example.com')
    vi.mocked(getSessionUser).mockResolvedValue({ email: 'owner@example.com' })
    const response = await POST(new Request('https://preview.example/api/office', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      body: '{}',
    }))
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('persists an owner assignment and keeps one copy when the same message is retried', async () => {
    vi.stubEnv('OFFICE_OWNER_EMAIL', 'owner@example.com')
    vi.stubEnv('OFFICE_KV_REST_API_URL', 'https://storage.example')
    vi.stubEnv('OFFICE_KV_REST_API_TOKEN', 'test-token')
    vi.mocked(getSessionUser).mockResolvedValue({ email: 'owner@example.com' })
    let stored = null
    let lock = null
    vi.mocked(createClient).mockReturnValue({
      get: async () => stored,
      set: async (_key, value) => {
        if (lock) return null
        lock = value
        return 'OK'
      },
      eval: async (_script, keys, [token, state]) => {
        if (lock !== token) return 0
        if (keys.length === 2) stored = JSON.parse(state)
        lock = null
        return 1
      },
    })
    const url = 'https://preview.example/api/office'
    const submit = () => POST(new Request(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'message', requestId: 'owner-message-1', text: 'Review a sample report.' }),
    }))
    expect((await submit()).status).toBe(200)
    expect((await submit()).status).toBe(200)
    const response = await GET(new Request(url))
    expect(response.status).toBe(200)
    const office = await response.json()
    expect(office.jobs).toHaveLength(1)
    expect(office.jobs[0]).toMatchObject({stage:'intake',agent:'omar'})
    expect(office.messages.filter(m=>m.from==='You')).toHaveLength(1)

    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await GET(new Request(url))).status).toBe(403)
  })

})
