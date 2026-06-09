/**
 * GET /api/scope-items
 * Serves the NRM1 v4.5 "Master Cost Table" grouped by NRM1 group, with the
 * metadata the questionnaire picker needs to filter items by building use
 * (Q1.3), project type (Q1.2) and intervention level (Q2.3). No filtering is
 * done here — the client filters live as those answers change.
 */
import { getScopeItems } from '../../../lib/costCalculator.js'

export async function GET() {
  try {
    const data = await getScopeItems()
    return Response.json(data, {
      // Items change only when the workbook does (cached 10 min in-module).
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  } catch (e) {
    return Response.json({ error: e.message, groups: [] }, { status: 503 })
  }
}
