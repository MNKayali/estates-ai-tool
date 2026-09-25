/**
 * GET /api/report-pdf/[id]
 *
 * Renders a previously generated report to a print-ready PDF using headless
 * Chromium. Unlike browser "Print to PDF", this produces real "Page X of Y"
 * pages identical to the screen: each A4 page (app/report/doc) carries its own
 * margins, running header/footer and "Page N of M", so Puppeteer prints with
 * zero margins and no header/footer template.
 *
 * Flow: launch Chromium → hand it the caller's own cookies → navigate to the live
 * /report/[id]?pdf=1 page → wait for the React render → page.pdf().
 *
 * Protected by proxy.ts (signed-in users) and limited to the report's owner or
 * the admin. The route reads KV directly to confirm the report exists and to
 * name the download.
 *
 * SECURITY: never reference AI_API_KEY here.
 */
import { getReport } from '@/lib/kv'
import { authoriseReport } from '@/lib/auth'
import { SESSION_COOKIE } from '@/lib/session'
import { reportFileName } from '@/lib/brand'
import { reportReference } from '@/lib/reportContent'

export const runtime = 'nodejs'
export const maxDuration = 60

// Launch Chromium — full puppeteer locally, @sparticuz/chromium on Vercel.
async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    const puppeteer = await import('puppeteer-core')
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    })
  }
  const puppeteer = await import('puppeteer')
  return puppeteer.default.launch({ headless: true })
}

function getOrigin(request) {
  // Prefer a server-controlled origin. This origin is handed the caller's
  // session cookie below, so it must NOT be derived from client-supplied Host /
  // X-Forwarded-Host headers (which a caller can spoof to exfiltrate the cookie).
  if (process.env.REPORT_ORIGIN) return process.env.REPORT_ORIGIN
  // A preview must print its own pages: the production URL runs different code
  // (and may read a different KV store), so a preview PDF rendered from it
  // failed while production still served the old report layout.
  if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  // Local dev only — no platform origin available.
  if (!process.env.VERCEL) return 'http://localhost:3000'
  // Last-resort fallback on an unknown host: use the request host but without the
  // cookie spoofing risk being silent — log it for visibility.
  const host = request.headers.get('host')
  console.warn('[report-pdf] No server origin env set; falling back to request host:', host)
  return host ? `https://${host}` : 'http://localhost:3000'
}


export async function GET(request, { params }) {
  const { id } = await params

  if (!id || !/^[0-9a-f]{16}$/.test(id)) {
    return Response.json({ error: 'Invalid report ID.' }, { status: 400 })
  }

  const data = await getReport(id)
  if (!data) {
    return Response.json(
      { error: 'Report not found or expired. Reports are retained for 90 days.' },
      { status: 404 }
    )
  }
  const auth = await authoriseReport(request, data)
  if (auth.response) return auth.response

  // A record freshly created by generate-report has no docx yet — the AI
  // prose (Phase 2) hasn't finished. Rendering a PDF now would just capture
  // the pending placeholders, so tell the caller to wait instead.
  if (data.status && data.status !== 'complete') {
    return Response.json(
      { error: 'This report is still being generated. Try again in a few seconds.' },
      { status: 409 }
    )
  }

  const origin = getOrigin(request)
  let browser
  try {
    browser = await launchBrowser()

    // Present the caller's own cookies — the ones that were just authorised to
    // see this report — so the protected /report and /api/reports load for the
    // headless browser exactly as they did for the caller. Only ever sent to
    // the server-controlled origin above.
    for (const name of [SESSION_COOKIE, 'estate_admin']) {
      const value = request.cookies.get(name)?.value
      if (value) await browser.setCookie({ name, value, url: origin })
    }

    const page = await browser.newPage()
    await page.setViewport({ width: 900, height: 1200 })
    await page.goto(`${origin}/report/${id}?pdf=1`, {
      waitUntil: 'networkidle0',
      timeout: 45000,
    })
    // Ensure the React render has produced the report (not just the spinner),
    // and that IBM Plex has loaded before the pages are printed.
    await page.waitForSelector('.r-cover', { timeout: 20000 })
    await page.evaluate(() => document.fonts.ready)
    // The logos are <img> SVGs: wait until each has decoded, and refuse to
    // print a report with a missing logo rather than ship a broken cover.
    const missing = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll('.r-page img')]
      await Promise.all(imgs.map(i => i.decode().catch(() => {})))
      return imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src'))
    })
    if (missing.length) throw new Error(`logo image failed to load: ${[...new Set(missing)].join(', ')}`)

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })

    const fileName = reportFileName(reportReference(id, data), 'pdf')
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-pdf] generation failed:', err)
    // The reason is safe to show (behind the access gate, no secrets in it) and
    // is the only clue a user can pass on without the Vercel logs.
    return Response.json({ error: 'PDF generation failed.', detail: String(err?.message || err).slice(0, 300) }, { status: 500 })
  } finally {
    if (browser) await browser.close()
  }
}
