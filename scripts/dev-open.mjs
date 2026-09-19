/**
 * scripts/dev-open.mjs — `next dev` with the local access gates OPEN.
 *
 * Both gates in proxy.ts fail open in development only when their code env
 * var is unset. .env.local normally sets ACCESS_CODE, so a plain `npm run dev`
 * is gated exactly like production. For local verification (and for
 * scripts/make-sample.mjs) it is useful to run without the gate; Next never
 * overwrites a variable that is already defined in the environment, so
 * defining both codes as empty here is enough to open them.
 *
 * Never used in production — it is only referenced from .claude/launch.json.
 * Extra arguments (e.g. --port) are passed straight through to `next dev`.
 */
import { spawn } from 'node:child_process'

process.env.ACCESS_CODE = ''
process.env.ADMIN_CODE = ''

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['next', 'dev', ...process.argv.slice(2)],
  { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' },
)
child.on('exit', code => process.exit(code ?? 0))
