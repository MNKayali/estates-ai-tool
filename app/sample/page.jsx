/**
 * /sample — a public, fixed example of what the tool produces.
 *
 * The record in public/sample/report.json is a real generation for a fictional
 * project (same pipeline, same workbooks, same AI prose step), saved without
 * the .docx payload. It needs no KV, no API key and no account — it is the one
 * report a prospective user can read before signing up. Regenerate it with
 * scripts/make-sample.mjs whenever the report structure changes.
 *
 * A server component importing the record, so the page is prerendered with the
 * whole report in its HTML: search engines and AI fetch tools that do not run
 * scripts read the report, not a loading message.
 */

import { ReportView } from '../report/ReportRenderer'
import { BRAND } from '@/lib/brand'
import data from '../../public/sample/report.json'

export const metadata = {
  title: `Sample report — ${BRAND.name}`,
  description: 'A sample RIBA Stage 0–1 feasibility report for a fictional project: NRM1 cost estimate, RIBA programme, risk register and procurement suggestion.',
}

export default function SamplePage() {
  return <ReportView data={data} reportId={null} sample />
}
