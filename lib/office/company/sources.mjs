import { kv } from '@vercel/kv'
import { lastDays } from '../../visitStats.js'

export async function readSources(allowed) {
  const entries = await Promise.all(
    allowed.map(async (source) => {
      try {
        if (source === 'website') {
          const url = 'https://www.projento.co.uk/'
          const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) })
          if (!res.ok) throw new Error()
          const html = (await res.text()).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
          const content = html
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000)
          return [source, { source: url, content }]
        }
        if (source === 'analytics') {
          const dates = lastDays(28, new Date())
          const pipeline = kv.pipeline()
          for (const day of dates) pipeline.hget('stats:v:' + day, 'visits')
          const counts = await pipeline.exec()
          const measured = counts.some((n) => n !== null && n !== undefined)
          return [
            source,
            {
              source: 'Projento aggregate visit counter',
              from: dates[0],
              through: dates.at(-1),
              visits: measured ? counts.reduce((sum, n) => sum + Number(n || 0), 0) : null,
              note: measured
                ? 'Recorded visits with known bots excluded. This does not verify every visitor as human.'
                : 'No measured baseline available.'
            }
          ]
        }
      } catch {
        return [source, { unavailable: true, note: 'Source unavailable. Do not infer a measurement.' }]
      }
      return [source, { unavailable: true }]
    })
  )
  return Object.fromEntries(entries)
}
