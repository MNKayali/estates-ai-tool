// Tiny local receiver so the in-app browser can save report PDFs to disk.
// The report page fetches its own PDF (/api/report-pdf/<id>, same as the
// Download PDF button) and POSTs the bytes here; a JSON body (the report
// record from /api/reports/<id>) is saved beside it for analyse.mjs --live.
// Saves into %USERPROFILE%\Downloads\Agent test\<batch>\ and copies the scenario beside it.
//   node test-reports/_reference/save-server.mjs [--batch 3]   (listens on 127.0.0.1:4599)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const bi = process.argv.indexOf('--batch'), batch = bi > 0 ? process.argv[bi + 1] : null
const OUT = path.join(os.homedir(), 'Downloads', 'Agent test', ...(batch ? [`Batch ${batch}`] : []))
const SCENARIOS = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
fs.mkdirSync(OUT, { recursive: true })

const ORIGINS = ['https://www.projento.co.uk', 'https://projento.co.uk', 'https://estates-ai-tool.vercel.app']
const cors = req => ({
  'Access-Control-Allow-Origin': ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0],
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Private-Network': 'true',
})

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); return res.end() }
  const url = new URL(req.url, 'http://x')
  const name = (url.searchParams.get('name') || '').replace(/[^A-Za-z0-9-]/g, '')
  if (req.method !== 'POST' || !['/save', '/json'].includes(url.pathname) || !name) { res.writeHead(400, cors(req)); return res.end('bad request') }
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const buf = Buffer.concat(chunks)
    let file
    if (url.pathname === '/json') {
      try { JSON.parse(buf.toString('utf8')) } catch { res.writeHead(422, cors(req)); return res.end('not JSON') }
      file = path.join(OUT, `${name}.json`)
    } else {
      if (buf.subarray(0, 5).toString() !== '%PDF-') { res.writeHead(422, cors(req)); return res.end('not a PDF') }
      file = path.join(OUT, `${name} - report.pdf`)
      const scen = path.join(SCENARIOS, name, 'scenario.md')
      if (fs.existsSync(scen)) fs.copyFileSync(scen, path.join(OUT, `${name} - scenario.md`))
    }
    fs.writeFileSync(file, buf)
    console.log(`saved ${file} (${Math.round(buf.length / 1024)} KB)`)
    res.writeHead(200, { ...cors(req), 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ saved: file, bytes: buf.length }))
  })
}).listen(4599, '127.0.0.1', () => console.log(`saving to ${OUT}`))
