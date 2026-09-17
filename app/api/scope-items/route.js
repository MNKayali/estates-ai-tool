/**
 * GET /api/scope-items
 * Workbook-derived reference data for the questionnaire, in one request:
 *  - `groups`: the NRM1 v4.5 "Master Cost Table" grouped by NRM1 group, with the
 *    metadata the picker needs to filter by building use (Q1.3), project type
 *    (Q1.2) and intervention level (Q2.3). No filtering happens here — the
 *    client filters live as those answers change.
 *  - `bcisRegions`: Tab 6 regions and their postcode prefixes, so Q1.1 can
 *    resolve the BCIS factor as the user types instead of the server silently
 *    defaulting an unrecognised prefix to West Midlands.
 *
 * Both come from the same cached workbook, so serving them together costs one
 * parse and saves the questionnaire a second round-trip on mount.
 */
import { getScopeItems, getBcisRegions } from '../../../lib/costCalculator.js'

export async function GET() {
  try {
    const [scope, bcisRegions] = await Promise.all([getScopeItems(), getBcisRegions()])
    const data = { ...scope, bcisRegions }
    return Response.json(data, {
      // Items change only when the workbook does (cached 10 min in-module).
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  } catch (e) {
    return Response.json({ error: e.message, groups: [], bcisRegions: [] }, { status: 503 })
  }
}
