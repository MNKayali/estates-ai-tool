// Prints one paste-able script: filler + runner + __queue(plans) for the given IDs.
//   node test-reports/_reference/bundle.mjs NB-4-healthcare NB-5-offices …
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const strip = f => fs.readFileSync(path.join(HERE, f), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s*\n/g, '\n').replace(/'filler ready'\s*$/, '')
const plans = process.argv.slice(2).map(id => JSON.parse(fs.readFileSync(path.join(HERE, '..', id, 'plan.json'), 'utf8')))
process.stdout.write(`${strip('filler.js')}\n${strip('runner.js')}\n__queue(${JSON.stringify(plans)})`)
