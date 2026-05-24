/**
 * GET /api/rates-check
 * Health check — confirms all three data files load correctly from GitHub.
 */
import { getRatesWorkbookInfo } from '@/lib/costCalculator'
import { getTemplateInfo } from '@/lib/reportBuilder'

export async function GET() {
  const results = {
    ratesOk: false,
    programmeOk: false,
    templateOk: false,
    ratesRows: 0,
    ruleRows: 0,
    bcisRegions: 0,
    sampleRate: null,
    templateTags: 0,
    missingTags: [],
    fetchedAt: new Date().toISOString(),
    errors: [],
  }

  // Check NRM1 rates workbook
  try {
    const info = await getRatesWorkbookInfo()
    results.ratesOk     = info.ratesRows > 0
    results.ratesRows   = info.ratesRows
    results.ruleRows    = info.ruleRows
    results.bcisRegions = info.bcisRegions
    results.sampleRate  = info.sampleRate
  } catch (e) {
    results.errors.push('NRM1 workbook: ' + e.message)
  }

  // Check programme workbook
  try {
    const url = process.env.PROGRAMME_FILE_URL
    if (!url) throw new Error('PROGRAMME_FILE_URL not set')
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = await res.arrayBuffer()
    results.programmeOk = buf.byteLength > 1000
  } catch (e) {
    results.errors.push('Programme workbook: ' + e.message)
  }

  // Check Word template
  try {
    const info = await getTemplateInfo()
    results.templateOk   = info.templateOk
    results.templateTags = info.templateTags
    results.missingTags  = info.missingTags || []
    if (info.error) results.errors.push('Template: ' + info.error)
  } catch (e) {
    results.errors.push('Template: ' + e.message)
  }

  const status = (results.ratesOk && results.programmeOk) ? 200 : 503
  return Response.json(results, { status })
}
