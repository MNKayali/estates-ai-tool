/**
 * GET /api/scope-items
 * Workbook-derived reference data for the questionnaire, in one request:
 *  - `catalogue`: every scope item, option, rule and list from NRM1 v5.2
 *    ('2. Rates' + '4. Scope rules' + '3. Settings'), rates and price sources stripped.
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
import { getBlackoutOptions } from '../../../lib/programmeCalculator.js'

// `blackouts`: the Programme workbook's construction blackout options (Q4.2b)
// and the building uses that see them. A Programme workbook that cannot be
// read leaves only "Specific dates" on the form, never the whole catalogue.
export async function GET() {
  try {
    const [catalogue, bcisRegions, blackouts] = await Promise.all([
      getScopeCatalogue(), getBcisRegions(), getBlackoutOptions().catch(() => []),
    ])
    return Response.json({ catalogue, bcisRegions, blackouts }, {
      // Items change only when the workbook does (cached 10 min in-module).
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
    })
  } catch (e) {
    return Response.json({ error: e.message, catalogue: null, bcisRegions: [] }, { status: 503 })
  }
}
