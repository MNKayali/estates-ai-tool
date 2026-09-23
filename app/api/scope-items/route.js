/**
 * GET /api/scope-items
 * Workbook-derived reference data for the questionnaire, in one request:
 *  - `catalogue`: every scope item, option, rule and list from NRM1 v5.2
 *    ('2. Scope and Rates' + '3. Settings'), rates and price sources stripped.
 *    The questionnaire runs lib/scopeEngine.js over it — the same rules the
 *    cost engine runs — so no filtering happens here.
 *  - `bcisRegions`: ▶ location_factors regions and their postcode prefixes, so
 *    Q1.1 can resolve the location factor as the user types instead of the
 *    server silently defaulting an unrecognised prefix.
 *
 * Both come from the same cached workbook, so serving them together costs one
 * parse and saves the questionnaire a second round-trip on mount.
 */
import { getScopeCatalogue, getBcisRegions } from '../../../lib/costCalculator.js'

export async function GET() {
  try {
    const [catalogue, bcisRegions] = await Promise.all([getScopeCatalogue(), getBcisRegions()])
    return Response.json({ catalogue, bcisRegions }, {
      // Items change only when the workbook does (cached 10 min in-module).
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  } catch (e) {
    return Response.json({ error: e.message, catalogue: null, bcisRegions: [] }, { status: 503 })
  }
}
