/**
 * vitest.setup.mjs
 *
 * Vitest doesn't load .env.local the way Next does, and the cost/programme
 * calculators need RATES_FILE_URL / PROGRAMME_FILE_URL to fetch the real
 * remote workbooks — there is no offline fixture. This mirrors the same
 * manual parsing scripts/baseline.mjs already uses for the same reason.
 */
import fs from 'node:fs'
import path from 'node:path'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim()
  }
}
