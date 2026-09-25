// Prints the JS to paste into the questionnaire page: the filler plus one plan.
//   node test-reports/_reference/snippet.mjs FO-1-offices
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))
const id = process.argv[2]
const plan = JSON.parse(fs.readFileSync(path.join(HERE, '..', id, 'plan.json'), 'utf8'))
const filler = fs.readFileSync(path.join(HERE, 'filler.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/\n\s*\n/g, '\n').replace(/'filler ready'\s*$/, '')
process.stdout.write(`${filler}\nwindow.__plan=${JSON.stringify(plan)};\nlocalStorage.removeItem('estatesAI_v4_answers'); 'ready: ${id}'`)
