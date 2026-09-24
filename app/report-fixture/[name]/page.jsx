/**
 * /report-fixture/[name] — DEV ONLY. Renders the sample report, or a fixture
 * built from it (lib/reportFixtures.js), through the real ReportRenderer so
 * scripts/check-report-fit.mjs can prove every page fits its A4 sheet.
 * Returns 404 in production.
 */
import { notFound } from 'next/navigation'
import FixtureView from './FixtureView'

const NAMES = ['sample', 'worst', 'long-scope']

export default async function FixturePage({ params }) {
  if (process.env.NODE_ENV === 'production') notFound()
  const { name } = await params
  if (!NAMES.includes(name)) notFound()
  return <FixtureView name={name} />
}
