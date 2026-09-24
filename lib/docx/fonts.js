/**
 * lib/docx/fonts.js — the IBM Plex TTFs embedded in every Word report, so the
 * .docx looks the same on a PC without Plex installed. SIL Open Font License
 * (assets/fonts/OFL.txt); converted losslessly from IBM's official WOFF files.
 * The files are traced into the serverless bundle by next.config.ts
 * outputFileTracingIncludes.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FONTS } from '../reportStyle.js'

const DIR = path.join(process.cwd(), 'assets', 'fonts')
const FILES = [
  [FONTS.word.regular, 'IBMPlexSans-Regular.ttf'],
  [FONTS.word.semibold, 'IBMPlexSans-SemiBold.ttf'],
  [FONTS.word.mono, 'IBMPlexMono-Regular.ttf'],
]

/**
 * The docx library names each embedded font part after the font —
 * word/fonts/IBM Plex Sans.odttf — and a space in an OPC part name makes Word
 * reject the whole file as "corrupted" (verified in Word: a font whose name has
 * no space opens, an embedded "IBM Plex Sans" does not). Rename the parts to font1.odttf… and
 * repoint word/_rels/fontTable.xml.rels. The w:name Word matches the font by is
 * untouched.
 */
export async function fixEmbeddedFontPartNames(buffer) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(buffer)
  const relsPath = 'word/_rels/fontTable.xml.rels'
  const rels = zip.file(relsPath)
  if (!rels) return buffer
  let xml = await rels.async('string')
  const parts = Object.keys(zip.files).filter(f => /^word\/fonts\/.+\.odttf$/.test(f))
  let n = 0
  for (const part of parts) {
    const oldName = part.slice('word/fonts/'.length)
    if (!/\s/.test(oldName)) continue
    const newName = `font${++n}.odttf`
    zip.file(`word/fonts/${newName}`, await zip.file(part).async('nodebuffer'))
    zip.remove(part)
    xml = xml.split(`Target="fonts/${oldName}"`).join(`Target="fonts/${newName}"`)
  }
  if (!n) return buffer
  zip.file(relsPath, xml)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

let cache = null
export function embeddedFonts() {
  if (!cache) {
    cache = Promise.all(FILES.map(async ([name, file]) => ({ name, data: await readFile(path.join(DIR, file)) })))
      .catch(err => { cache = null; throw err })
  }
  return cache
}
