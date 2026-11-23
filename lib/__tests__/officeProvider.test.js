import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateOfficeOutput } from '../office/provider.mjs'
vi.mock('@vercel/kv', () => ({ createClient: vi.fn() }))

const request = { job: { name: 'Omar' }, companyContext: 'Projento', instruction: 'Return content.', input: { message: 'Hello' } }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('office model replies', () => {
  it('uses the forced response tool and reads its structured reply', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      stop_reason: 'tool_use',
      content: [{ type: 'text', text: 'Here is my response.' }, { type: 'tool_use', name: 'office_reply', input: { content: 'Hello, Nabil.' } }],
    }))
    vi.stubGlobal('fetch', fetcher)
    expect(await generateOfficeOutput(request)).toEqual({ content: 'Hello, Nabil.' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body).tool_choice.name).toBe('office_reply')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('gives a useful timeout message without automatically repeating a paid call', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetcher = vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError'))
    vi.stubGlobal('fetch', fetcher)
    await expect(generateOfficeOutput(request)).rejects.toThrow('took too long')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('handles rejected credentials and truncated replies without leaking provider details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private provider details', { status: 401 })))
    await expect(generateOfficeOutput(request)).rejects.toThrow('could not sign in')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ stop_reason: 'max_tokens', content: [] })))
    await expect(generateOfficeOutput(request)).rejects.toThrow('could not finish')
  })
})
