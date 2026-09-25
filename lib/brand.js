/**
 * lib/brand.js — the product's name, tagline and logo files. The only place a
 * brand string lives: the web app, both report renderers and the download
 * filenames read it. Pure data, no React, no node-only imports (a client
 * component and the Word builder both import it). Brand rules:
 * docs/brand/BRAND.md.
 *
 * siteUrl is null until the domain is bought; everything that prints it prints
 * nothing while it is null, so adding the domain later is a one-line change.
 * email / phone: null hides the row on the report's contact card (the
 * placeholder phone number was removed on 25 September 2026 and no real one
 * has been supplied yet). With none set, the card asks the reader to quote the
 * report reference and shows no contact table.
 */
export const BRAND = Object.freeze({
  name: 'Projento',
  tagline: 'Plan · Analyse · Report',
  descriptor: 'Feasibility reporting for capital projects',
  siteUrl: null,
  email: 'info@projento.co.uk',
  phone: null,
  fileStem: 'Projento-Feasibility-Report',
})

/** The report contact card's rows: only the details that are set, in a fixed order. */
export function contactRows(b = BRAND) {
  return [['Email', b.email], ['Telephone', b.phone], ['Web', b.siteUrl]].filter(([, v]) => v)
}

/** The contact card's sentence, before the report reference. */
export function contactLead(b = BRAND) {
  return contactRows(b).length
    ? 'For questions about this report, or to take the project on to a full cost plan and Stage 2 brief, contact our team and quote reference '
    : 'For questions about this report, or to take the project on to a full cost plan and Stage 2 brief, please quote reference '
}

// Intrinsic sizes are the SVG viewBoxes; the PNGs in public/brand and
// assets/brand are exports of the same artwork, so the ratios match.
export const LOGOS = Object.freeze({
  wordmarkNavy:  Object.freeze({ src: '/brand/projento-wordmark-navy.svg',  width: 387.1,  height: 96.6 }),
  wordmarkWhite: Object.freeze({ src: '/brand/projento-wordmark-white.svg', width: 387.1,  height: 96.6 }),
  lockup:        Object.freeze({ src: '/brand/projento-header-lockup.svg',  width: 410.19, height: 100 }),
  monogram:      Object.freeze({ src: '/brand/projento-monogram.svg',       width: 512,    height: 512 }),
})

export const logoWidth = (logo, height) => Math.round((logo.width / logo.height) * height)

/** Download filename: Projento-Feasibility-Report-<ref>.<ext>. */
export function reportFileName(ref, ext) {
  const safe = String(ref || '').replace(/[^A-Za-z0-9-]/g, '')
  return `${BRAND.fileStem}-${safe || 'DRAFT'}.${ext}`
}
