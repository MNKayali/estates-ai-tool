// Tiny local receiver so the in-app browser can save report PDFs to disk.
// The report page fetches its own PDF (/api/report-pdf/<id>, same as the
// Download PDF button) and POSTs the bytes here. Saves into
// %USERPROFILE%\Downloads\Agent test\<name>.pdf and copies the scenario beside it.
//   node test-reports/_reference/save-server.mjs   (listens on 127.0.0.1:4599)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const OUT = path.join(os.homedir(), 'Downloads', 'Agent test')
const SCENARIOS = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
fs.mkdirSync(OUT, { recursive: true })

const cors = {
  'Access-Control-Allow-Origin': 'https://estates-ai-tool.vercel.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const url = new URL(req.url, 'http://x')
  const name = (url.searchParams.get('name') || '').replace(/[^A-Za-z0-9-]/g, '')
  if (req.method !== 'POST' || url.pathname !== '/save' || !name) { res.writeHead(400, cors); return res.end('bad request') }
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const buf = Buffer.concat(chunks)
    if (buf.subarray(0, 5).toString() !== '%PDF-') { res.writeHead(422, cors); return res.end('not a PDF') }
    const pdf = path.join(OUT, `${name} - report.pdf`)
    fs.writeFileSync(pdf, buf)
    const scen = path.join(SCENARIOS, name, 'scenario.md')
    if (fs.existsSync(scen)) fs.copyFileSync(scen, path.join(OUT, `${name} - scenario.md`))
    console.log(`saved ${pdf} (${Math.round(buf.length / 1024)} KB)`)
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ saved: pdf, bytes: buf.length }))
  })
}).listen(4599, '127.0.0.1', () => console.log(`saving PDFs to ${OUT}`))
