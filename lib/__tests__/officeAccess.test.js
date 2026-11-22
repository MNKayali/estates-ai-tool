import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@vercel/kv'
import { verifyAccessCode } from '../cookieAuth.js'
import { isOfficeOwner } from '../office/access.js'
import { GET, POST } from '../../app/api/office/route.js'

vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

vi.mock('../cookieAuth.js', () => ({ verifyAccessCode: vi.fn() }))

afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

describe('owner-only office', () => {
  it('requires a valid signed admin cookie', async () => {
    vi.stubEnv('ADMIN_CODE', 'test-admin')
    const request = new Request('https://preview.example/office', { headers: { cookie: 'estate_admin=signed-token' } })
    vi.mocked(verifyAccessCode).mockResolvedValue(false)
    expect(await isOfficeOwner(request)).toBe(false)
    vi.mocked(verifyAccessCode).mockResolvedValue(true)
    expect(await isOfficeOwner(request)).toBe(true)
    expect(verifyAccessCode).toHaveBeenLastCalledWith('signed-token', 'test-admin')
  })

  it('denies all access when no owner is configured', async () => {
    vi.stubEnv('ADMIN_CODE', '')
    vi.mocked(verifyAccessCode).mockResolvedValue(true)
    const request = new Request('https://preview.example/api/office')
    expect((await GET(request)).status).toBe(403)
    expect((await POST(request)).status).toBe(403)
  })

  it('rejects cross-site writes before reaching storage', async () => {
    vi.stubEnv('ADMIN_CODE', 'test-admin')
    vi.mocked(verifyAccessCode).mockResolvedValue(true)
    const response = await POST(new Request('https://preview.example/api/office', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
      body: '{}',
    }))
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('persists an owner assignment and rejects duplicate submissions with an old revision', async () => {
    vi.stubEnv('ADMIN_CODE', 'test-admin')
    vi.stubEnv('OFFICE_KV_REST_API_URL', 'https://storage.example')
    vi.stubEnv('OFFICE_KV_REST_API_TOKEN', 'test-token')
    vi.mocked(verifyAccessCode).mockResolvedValue(true)
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

    vi.mocked(verifyAccessCode).mockResolvedValue(false)
    expect((await GET(new Request(url))).status).toBe(403)
  })

})
