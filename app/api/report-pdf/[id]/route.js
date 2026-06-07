/**
 * GET /api/report-pdf/[id]
 *
 * Renders a previously generated report to a print-ready PDF using headless
 * Chromium. Unlike browser "Print to PDF", this produces real "Page X of Y"
 * page numbers via Puppeteer's footerTemplate (CSS @page margin boxes are not
 * supported by any browser).
 *
 * Flow: launch Chromium → set the access cookie → navigate to the live
 * /report/[id]?pdf=1 page → wait for the React render → page.pdf().
 *
 * Protected by proxy.ts (estate_access cookie). The route reads KV directly to
 * confirm the report exists and to name the download.
 *
 * SECURITY: never reference AI_API_KEY here.
 */
import { getReport } from '@/lib/kv'

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
  const h = request.headers
  const proto = h.get('x-forwarded-proto') || (process.env.VERCEL ? 'https' : 'http')
  const host = h.get('x-forwarded-host') || h.get('host')
  if (host) return `${proto}://${host}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

const FOOTER_TEMPLATE = `
  <div style="width:100%; font-size:8px; font-family:Arial, sans-serif; color:#666;
              padding:0 16mm; display:flex; justify-content:space-between; align-items:center;">
    <span>Estates AI Tool &middot; Indicative only</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`

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

  const origin = getOrigin(request)
  let browser
  try {
    browser = await launchBrowser()

    // Present the access cookie so the protected /report and /api/reports load.
    if (process.env.ACCESS_CODE) {
      await browser.setCookie({
        name: 'estate_access',
        value: process.env.ACCESS_CODE,
        url: origin,
      })
    }

    const page = await browser.newPage()
    await page.goto(`${origin}/report/${id}?pdf=1`, {
      waitUntil: 'networkidle0',
      timeout: 45000,
    })
    // Ensure the React render has produced the report (not just the spinner).
    await page.waitForSelector('.report-cover', { timeout: 20000 })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: FOOTER_TEMPLATE,
      margin: { top: '18mm', bottom: '16mm', left: '16mm', right: '16mm' },
    })

    const safeName = String(data.projectName || 'Report').replace(/[^a-z0-9 _-]/gi, '_')
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}_Stage1_Report.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[report-pdf] generation failed:', err)
    return Response.json({ error: 'PDF generation failed.' }, { status: 500 })
  } finally {
    if (browser) await browser.close()
  }
}
