/**
 * lib/docx/brandImages.js — the Projento PNGs placed in every Word report
 * (docx needs raster images). Read from assets/brand, which next.config.ts
 * traces into the docx-building routes; public/ is not guaranteed to be on a
 * Vercel function's filesystem. The 1600/1200 px exports stay sharp at the
 * 140 × 35 and 82 × 20 px they are placed at.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const DIR = path.join(process.cwd(), 'assets', 'brand')
let cached = null

export function brandImages() {
  cached ??= Promise.all([
    readFile(path.join(DIR, 'projento-wordmark-white-1600.png')),
    readFile(path.join(DIR, 'projento-header-lockup-1200.png')),
  ]).then(([wordmarkWhite, lockup]) => ({ wordmarkWhite, lockup }))
    .catch(e => { cached = null; throw e })
  return cached
}
