/**
 * scripts/dev-open.mjs — `next dev` with the local sign-in and admin gates OPEN.
 *
 * A plain `npm run dev` requires a real account (and so a KV store), exactly
 * like production. For local verification (and for scripts/make-sample.mjs) it
 * is useful to run without it: AUTH_OPEN=1 treats every request as a local
 * developer account (lib/auth.js — ignored in production), and an empty
 * ADMIN_CODE opens the admin gate in development. Next never overwrites a
 * variable that is already defined in the environment, so setting them here is
 * enough.
 *
 * Never used in production — it is only referenced from .claude/launch.json.
 * Extra arguments (e.g. --port) are passed straight through to `next dev`.
 */
import { spawn } from 'node:child_process'

process.env.AUTH_OPEN = '1'
process.env.ADMIN_CODE = ''
// NRM1 v5.2: verify against the workbook in the repository (the loader reads a
// non-URL value as a local path). Set RATES_FILE_URL yourself to override.
if (!process.env.RATES_FILE_URL) process.env.RATES_FILE_URL = 'NRM1_Cost_Estimate_Tool_v5_2.xlsx'

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' },
)
child.on('exit', code => process.exit(code ?? 0))
