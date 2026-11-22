import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@vercel/kv'
import { authOpen, getSessionUser } from '../auth.js'
import { isOfficeOwner } from '../office/access.js'
import { GET, POST } from '../../app/api/office/route.js'

vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

vi.mock('../auth.js', () => ({
  authOpen: vi.fn(() => false),
  getSessionUser: vi.fn(),
}))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('owner-only office', () => {
  it('denies signed-out users, other accounts and development auth bypass', async () => {
    vi.stubEnv('OFFICE_OWNER_UID', 'owner-1')
    const request = new Request('https://preview.example/office')
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'other-user' })
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'owner-1' })
    expect(await isOfficeOwner(request)).toBe(true)
    vi.mocked(authOpen).mockReturnValue(true)
    expect(await isOfficeOwner(request)).toBe(false)
  })

  it('denies all access when no owner is configured', async () => {
    vi.stubEnv('OFFICE_OWNER_UID', '')
    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'owner-1' })
    const request = new Request('https://preview.example/api/office')
    expect((await GET(request)).status).toBe(403)
    expect((await POST(request)).status).toBe(403)
  })

  it('rejects cross-site writes before reaching storage', async () => {
    vi.stubEnv('OFFICE_OWNER_UID', 'owner-1')
    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'owner-1' })
    const response = await POST(new Request('https://preview.example/api/office', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      body: '{}',
    }))
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('persists an owner assignment and rejects duplicate submissions with an old revision', async () => {
    vi.stubEnv('OFFICE_OWNER_UID', 'owner-1')
    vi.stubEnv('OFFICE_KV_REST_API_URL', 'https://storage.example')
    vi.stubEnv('OFFICE_KV_REST_API_TOKEN', 'test-token')
    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'owner-1' })
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
      body: JSON.stringify({ action: 'create', revision: 0, brief: 'Review a sample report.' }),
    }))
    expect((await submit()).status).toBe(200)
    expect((await submit()).status).toBe(409)
    const response = await GET(new Request(url))
    expect(response.status).toBe(200)
    const office = await response.json()
    expect(office.revision).toBe(1)
    expect(office.assignments).toHaveLength(1)
    expect(office.assignments[0]).toMatchObject({ brief: 'Review a sample report.', status: 'queued' })

    vi.mocked(getSessionUser).mockResolvedValue({ uid: 'other-user' })
    expect((await GET(new Request(url))).status).toBe(403)
  })

})
