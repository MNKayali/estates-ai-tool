// Builds the per-project-type reference the scenario writers work from:
// every question option and every scope item the form offers. Read from the
// same workbook production uses. Run: node test-reports/_reference/build-reference.mjs
import fs from 'node:fs'
import path from 'node:path'
import { modelFromBytes, publicCatalogue } from '../../lib/nrmWorkbook.js'
import { buildContext, isShown, isRelevant, startsTicked, offeredOptions, typicalItemIds } from '../../lib/scopeEngine.js'
import { knownIssuesFor, surveysFor, occupationCopyFor, isQuestionShown } from '../../lib/questionSets.js'
import { SITE_CONTEXT_OPTIONS } from '../../lib/siteContext.js'

const OUT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const r = modelFromBytes(fs.readFileSync('NRM1_Cost_Estimate_Tool_v5_2.xlsx'))
const cat = publicCatalogue(r.model ?? r)
const s = cat.settings

for (const pt of s.projectTypes) {
  const L = []
  L.push(`# ${pt.label} (${pt.code}) — what the form offers`, '')
  L.push(`Asks level of intervention (Q2.2): ${pt.usesLevel ? 'YES — ' + s.interventionLevels.map(l => `"${l.name}"`).join(', ') : 'no'}`)
  L.push(`Spec levels offered (Q2.4): ${pt.specLevels.length > 1 ? pt.specLevels.map(x => `"${x}"`).join(', ') : 'not asked'}`)
  L.push(`Q3.1 known issues: ${knownIssuesFor(pt.label).map(x => `"${x}"`).join(', ')}`)
  L.push(`Q3.3 surveys (pre-2000 building): ${surveysFor(pt.label, '1900–1979').map(x => `"${x}"`).join(', ')}`)
  L.push(`Q3.3 surveys (Post-2000 building): ${surveysFor(pt.label, 'Post-2000').map(x => `"${x}"`).join(', ')}`)
  const occ = occupationCopyFor(pt.label)
  L.push(`Q3.6 wording: ${occ?.label || 'default'}`)
  L.push(`Q3.8 site context: ${SITE_CONTEXT_OPTIONS.map(x => `"${x}"`).join(', ')}`)
  const hidden = ['q1_2_storeys', 'q1_4_buildingAge', 'q3_6_occupation', 'q3_5_accessConstraints', 'q3_2_previousWorks', 'q3_8_siteContext']
    .filter(k => !isQuestionShown(k, pt.label))
  L.push(`Questions NOT asked for this type: ${hidden.length ? hidden.join(', ') : 'none of the optional ones'}`, '')

  // Typical scope for one example use, at each level where relevant.
  const levels = pt.usesLevel ? s.interventionLevels.map(l => l.name) : [null]
  for (const lv of levels) {
    const ctx = buildContext(cat, { q1_2_projectType: pt.label, q1_3_buildingUse: 'Commercial offices', q2_3_interventionLevel: lv || undefined })
    L.push(`"Use typical scope" for Commercial offices${lv ? ` at "${lv}"` : ''}: ${typicalItemIds(cat, ctx).join(', ') || '(none)'}`)
  }
  L.push('', '## Scope items shown for this type', '',
    'uses = building-use codes the item is tagged for (others see it under "More items"); qty = how the quantity is found (ENTER = the user must type a quantity).', '')
  const ctx = buildContext(cat, { q1_2_projectType: pt.label })
  let group = null
  for (const it of cat.items.filter(i => isShown(i, ctx))) {
    if (it.groupNum !== group) { group = it.groupNum; L.push('', `### Group ${it.groupNum} — ${it.groupLabel}`) }
    const opts = offeredOptions(it, ctx).map(o => `${o.key} "${o.label}"${o.availFrom > 1 && pt.usesLevel ? ` (from level ${o.availFrom})` : ''}${o.isDefault ? ' [default]' : ''}`)
    L.push(`- **${it.id} ${it.name}** — ${it.section}; unit ${it.unit}; pick ${it.pick}; uses ${it.uses.join('/')}; qty ${/ENTER/.test(it.qrule || '') ? 'ENTER' : 'estimated'}${it.included ? `\n  - includes: ${it.included}` : ''}\n  - options: ${opts.join('; ') || '(none priced for this type)'}`)
  }
  fs.writeFileSync(path.join(OUT, `scope-${pt.code}.md`), L.join('\n'))
}
fs.writeFileSync(path.join(OUT, 'building-uses.md'), s.buildingUses.map(u => `- ${u.code}: "${u.label}"`).join('\n'))
console.log('written to', OUT)
