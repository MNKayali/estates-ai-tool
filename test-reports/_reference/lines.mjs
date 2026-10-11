// Prints the priced lines of one or more scenarios from an analyse.mjs --json dump.
//   node test-reports/_reference/lines.mjs dump.json ID [ID ...]
import fs from 'node:fs'
const [file, ...ids] = process.argv.slice(2)
const j = JSON.parse(fs.readFileSync(file, 'utf8'))
for (const id of ids) {
  const x = j.find(e => e.id === id); const c = x.r.cost
  console.log(`== ${id}  GIFA ${x.gifa}  works £${Math.round(c.works.mid / 1000)}k  construction £${Math.round(c.construction.mid / 1000)}k (£${Math.round(c.construction.mid / x.gifa)}/m²)  prelims ${c.percentages.prelims}%  OH&P ${c.percentages.ohp}%  factor ${c.bcisFactor}`)
  for (const l of [...c.lineItems].sort((a, b) => b.lineMid - a.lineMid))
    console.log(`${String(Math.round(l.lineMid / 1000)).padStart(6)}k  ${(l.item + (l.option && l.option !== 'Standard' ? ' — ' + l.option : '')).slice(0, 58).padEnd(58)} ${l.qty} ${l.unit} @ £${l.rate}${l.qtySource === 'user' ? ' (your figure)' : ''}`)
  for (const e of c.excludedNoQuantity || []) console.log(`  excluded: ${e.item || e.code} — ${e.reason}`)
}
