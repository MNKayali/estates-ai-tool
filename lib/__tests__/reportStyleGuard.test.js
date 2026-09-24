import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The report's look comes only from lib/reportStyle.js. This fails the build if
// a renderer carries its own colour, font size or font name — which is how the
// screen, PDF and Word outputs drifted apart before.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const walk = dir => (fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).flatMap(f => {
      const rel = path.join(dir, f)
      return fs.statSync(path.join(ROOT, rel)).isDirectory() ? walk(rel) : [rel]
    })
  : [])

const RENDERER_FILES = [...walk('app/report/doc'), ...walk('lib/docx'), 'lib/reportBuilder.js']
  .map(f => f.replace(/\\/g, '/'))
  .filter(f => /\.(jsx?|css)$/.test(f) && fs.existsSync(path.join(ROOT, f)))

// The Word builder is rebuilt on the shared style in Milestone C of the plan;
// until then it is a known failure. Remove this entry when lib/docx/ lands.
const NOT_YET_MIGRATED = new Set(['lib/reportBuilder.js'])

const RULES = [
  ['a hex colour literal', /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/],
  ['a CSS font-size literal', /font-size\s*:\s*\d/],
  ['a JSX fontSize literal', /fontSize\s*:\s*['"]?\d/],
  ['a banned font name', /\b(Arial|Helvetica|Calibri|Playfair|DM Sans)\b/],
]

function problems(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
  const out = []
  for (const [what, re] of RULES) {
    const m = src.match(re)
    if (m) out.push(`${what}: "${m[0]}"`)
  }
  if (/^lib\/(docx\/pages|reportBuilder)/.test(file) && src.includes('new TextRun(')) out.push('a TextRun built directly (use t() from lib/docx/primitives.js)')
  return out
}

describe('report renderers take their look only from lib/reportStyle.js', () => {
  it('finds the renderer files', () => {
    expect(RENDERER_FILES.length).toBeGreaterThan(5)
  })
  for (const file of RENDERER_FILES) {
    const run = NOT_YET_MIGRATED.has(file) ? it.fails : it
    run(`${file} has no literal colour, size or font`, () => {
      expect(problems(file), `${file} — use lib/reportStyle.js`).toEqual([])
    })
  }
})
