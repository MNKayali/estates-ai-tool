/**
 * lib/siteNotice.js — the short data-use and disclaimer wording shown across
 * the site (footer line, the questionnaire's Generate step, the sign-up box)
 * and the page it links to. One place, so every surface says the same thing.
 * Pure data: imported by client components.
 *
 * Owner's position (29 September 2026): Projento is in research and
 * development; information is used only within Projento and is not sold or
 * shared; reports are indicative. No absolute promises ("never"), and the
 * operator is not named until a company is set up.
 */
import { BRAND } from './brand.js'

export const DATA_PAGE = Object.freeze({ href: '/data-and-use', label: 'Data and Disclaimer' })

export const DATA_PAGE_UPDATED = '29 September 2026'

export const FOOTER_NOTICE =
  `${BRAND.name} is in research and development. Your information is used within ${BRAND.name} and is not sold or shared with third parties. Reports are indicative only and are not professional advice.`

/** Shown beside the Generate button; the link text is DATA_PAGE.label. */
export const ENTRY_NOTICE_TAIL =
  `terms: your answers are stored and used only within ${BRAND.name} to produce your report and improve the tool.`
