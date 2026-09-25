/**
 * lib/reportStyle.js — the report's single source of look: brand, colours,
 * type scale, page geometry, table column recipes and layout limits.
 *
 * Both renderers read it: app/report/doc/* (screen + PDF, through
 * cssVariables()) and lib/docx/* (Word, through hp()/pxToDxa()/hex()).
 * lib/__tests__/reportStyleGuard.test.js fails the build if either renderer
 * carries its own colour, font size or font name. Pure data, no React, no
 * node-only imports. The approved look is
 * docs/superpowers/specs/2026-09-24-report-template-approved.html.
 */

// The product name, logo mark and web address, used by every report output
// and every app page (headers, sign-in, admin, legal pages). The email and
// telephone are still placeholders until real ones are supplied. Changing
// them here changes every page of every output.
export const BRAND = Object.freeze({
  name: 'Projento',
  mark: 'P',
  tagline: 'DATA · INSIGHTS · SMARTER DECISIONS',
  strapline: 'Feasibility reporting for capital projects',
  slogan: 'Better insights. Smarter property decisions.',
  web: 'www.projento.co.uk',
  email: 'enquiries@projento.example',
  phone: '0121 000 0000',
})

export const COLOURS = Object.freeze({
  navy: '#1A2E4A', navyMid: '#1C3354', navyDeep: '#10203A', navyText: '#12233A',
  amberRule: '#C4861A', amberOnDark: '#D9A12E', amberText: '#9D6B15',
  ink: '#22262F', grey: '#555B69', greyMute: '#6D7182', label: '#4A566B', code: '#5A6E88',
  rule: '#E2DED4', tintHead: '#EAEFF5', tintBand: '#EEF2F7', tintGroup: '#F6F3EC', tintHigh: '#FDF3F2',
  paper: '#FFFFFF', onNavy: '#DCE3EC', onNavyMute: '#B7C2D3',
  ragHigh: '#B42318', ragMed: '#B54708', ragLow: '#2E7D32', pass: '#2E7D32', warn: '#92400E',
  segDesign: '#3E5C84', segGovernance: '#7B5113', segTender: '#5B7BA6', segConstruction: '#1A2E4A',
  segHandover: '#4A5568', segSurvey: '#4F8A3C', segFloatA: '#7D8798', segFloatB: '#B5BCC8', segOther: '#6B7A90',
})

export const FONTS = Object.freeze({
  // CSS stacks; the first family is supplied by next/font (app/report/doc/fonts.js).
  sansStack: "var(--r-font-sans), 'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif",
  monoStack: "var(--r-font-mono), 'IBM Plex Mono', ui-monospace, Consolas, monospace",
  // Word: embedded families (lib/docx/fonts.js). Weight is chosen by family, never a bold flag.
  // These must equal each TTF's name-table family (nameID 1) — Word matches embedded fonts
  // by it; the SemiBold file's legacy family name is the abbreviated "IBM Plex Sans SmBld".
  word: Object.freeze({ regular: 'IBM Plex Sans', semibold: 'IBM Plex Sans SmBld', mono: 'IBM Plex Mono' }),
})

/** Body-page type scale in points. No other sizes on body pages. */
export const TYPE = Object.freeze({ sectionTitle: 16, subHeading: 11, body: 10, table: 9.5, small: 8, statFigure: 13.5 })

/** Cover-only sizes in points (the approved template's px × 3/4). */
export const COVER_TYPE = Object.freeze({
  brand: 22.5, tagline: 7, eyebrow: 9.75, title: 27, titleLong: 22.5, subtitle: 12.75,
  figure: 21, figureNote: 9.75, label: 8.25, facts: 10.5, note: 9, foot: 8.25,
})

/** Page geometry in CSS px on the 794 × 1123 A4 page (1 px = 15 DXA in Word). */
export const PAGE = Object.freeze({
  widthPx: 794, heightPx: 1123, marginXPx: 56,
  headerTopPx: 30, bodyTopPx: 86, bodyBottomPx: 64, footerBottomPx: 26,
  coverTopPx: 470, halfSlotPx: 486, bodyPx: 973, slotGapPx: 24,
})

/** Column widths as fractions of the content width. */
export const TABLES = Object.freeze({
  works: [0.09, 0.43, 0.12, 0.12, 0.12, 0.12],
  worksGroups: [0.52, 0.12, 0.18, 0.18],
  risk: [0.08, 0.13, 0.36, 0.11, 0.32],
  programme: [0.21, 0.45, 0.13, 0.13, 0.08],
  projectCost: [0.46, 0.24, 0.15, 0.15],
  constraints: [0.15, 0.27, 0.58],
})

export const LIMITS = Object.freeze({
  maxRisks: 10,
  listMax: 6,
  milestonesMax: 6,
  scopeItemsPerGroup: 8,
  notPricedMax: 6,
  worksRowsPerPage: 27,
  appendixRowsPerPage: 30,
  titleChars: Object.freeze({ full: 60, max: 110 }),
})

export const ptToPx = pt => Math.round((pt * 96 / 72) * 100) / 100
export const hp = pt => Math.round(pt * 2)
export const PX_TO_DXA = 15
export const pxToDxa = px => Math.round(px * PX_TO_DXA)
export const hex = c => String(c).replace('#', '').toUpperCase()

export function widthsToDxa(fractions, totalDxa) {
  const w = fractions.map(f => Math.round(f * totalDxa))
  w[w.length - 1] += totalDxa - w.reduce((a, b) => a + b, 0)
  return w
}

const kebab = s => s.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)

/** CSS custom properties for the HTML renderer (set as a style object on the document root). */
export function cssVariables() {
  const v = {}
  for (const [k, c] of Object.entries(COLOURS)) v[`--r-${kebab(k)}`] = c
  for (const [k, pt] of Object.entries(TYPE)) v[`--r-fs-${kebab(k)}`] = `${ptToPx(pt)}px`
  for (const [k, pt] of Object.entries(COVER_TYPE)) v[`--r-cv-${kebab(k)}`] = `${ptToPx(pt)}px`
  v['--r-sans'] = FONTS.sansStack
  v['--r-mono'] = FONTS.monoStack
  return v
}
