/**
 * lib/reportBuilder.js — builds the Word report.
 *
 * The look comes from lib/reportStyle.js (through lib/docx/primitives.js), the
 * content and page layout from lib/reportContent.js, so the .docx follows the
 * same page map as the screen and the PDF: cover, summary, scope (page 3),
 * risk, programme, two cost pages, the shared late-section pages, next steps
 * with the contact block, then Appendix A for long scopes. IBM Plex is
 * embedded (lib/docx/fonts.js) so the file looks the same on any PC.
 *
 * Uses docx v9 (ESM named exports). Returns a Buffer.
 * SECURITY: never reference AI_API_KEY here.
 */
import { Document, Packer, Header, Footer, Paragraph, TabStopType } from 'docx'
import { BRAND, COLOURS, FONTS, TYPE, PAGE, hp, hex, pxToDxa } from './reportStyle.js'
import { buildPageMap, money, reportReference, fmtLongDate } from './reportContent.js'
import { embeddedFonts, fixEmbeddedFontPartNames } from './docx/fonts.js'
import { t, p, img, rule, pageNumberRuns, NUMBERING, MARGIN_X, CONTENT_DXA, PAGE_DXA } from './docx/primitives.js'
import { brandImages } from './docx/brandImages.js'
import { LOGOS, logoWidth } from './brand.js'
import * as P from './docx/pages.js'

function header(ctx) {
  return new Header({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
    border: { bottom: { ...rule(COLOURS.navy, 6), space: 4 } },
    children: [
      img(ctx.logos.lockup, logoWidth(LOGOS.lockup, 20), 20, BRAND.name),
      t(`  · ${ctx.short}`, { size: TYPE.small, color: COLOURS.greyMute }),
      t(`\tFeasibility Report · Ref ${ctx.reference}`, { size: TYPE.small, color: COLOURS.greyMute }),
    ],
  })] })
}

function footer() {
  return new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_DXA }],
    border: { top: { ...rule(COLOURS.rule, 4), space: 4 } },
    children: [
      t(BRAND.name, { semi: true, color: COLOURS.navy, size: TYPE.small }),
      t(` · ${BRAND.descriptor}${BRAND.siteUrl ? ` · ${BRAND.siteUrl}` : ''} · Indicative only\tPage `, { size: TYPE.small, color: COLOURS.greyMute }),
      ...pageNumberRuns(),
    ],
  })] })
}

export async function buildReport(input) {
  const data = { ...input }
  const { pages, ctx: base } = buildPageMap(data)
  const ctx = {
    ...base,
    reference: reportReference(data.reportId, data),
    dateLong: fmtLongDate(data.generatedAt || new Date().toISOString()),
    money: (n, bare = false) => money(n, data.cost?.total?.high, { symbol: !bare }),
    logos: await brandImages(),
  }
  const build = {
    summary: () => P.summaryPage(data, ctx),
    scope: () => P.scopePage(data),
    risk: () => P.riskPage(data),
    programme: () => P.programmePage(data),
    costWorks: () => P.costWorksPage(data, ctx),
    costSummary: () => P.costSummaryPage(data, ctx),
    // A second section on a shared page starts at the page's middle when both
    // fit a half ('bottom'), otherwise directly after the first ('flow').
    late: pg => pg.slots.flatMap((s, i) => [
      ...(i ? [p(t(''), { before: s.slot === 'bottom' ? 1200 : 480, after: 0 })] : []),
      ...P.lateSection(s.key, s.no, data, ctx),
    ]),
    last: pg => P.lastPage(data, ctx, pg.no),
    appendix: pg => P.appendixPage(data, ctx, pg),
  }
  const body = []
  for (const pg of pages) {
    if (pg.kind === 'cover') continue
    if (body.length) body.push(p(t(''), { pageBreakBefore: true, after: 0 }))
    body.push(...build[pg.kind](pg))
  }
  const doc = new Document({
    creator: BRAND.name,
    lastModifiedBy: BRAND.name,
    title: `${BRAND.name} feasibility report — ${data.answers?.q1_0_projectName || 'Project'}`,
    subject: 'RIBA Stage 0–1 feasibility report',
    fonts: await embeddedFonts(),
    numbering: NUMBERING,
    styles: { default: { document: { run: { font: FONTS.word.regular, size: hp(TYPE.body), color: hex(COLOURS.ink) } } } },
    sections: [
      {
        properties: { page: { size: PAGE_DXA, margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 } } },
        children: P.coverPage(data, ctx),
      },
      {
        properties: { page: { size: PAGE_DXA, margin: {
          top: pxToDxa(PAGE.bodyTopPx), bottom: pxToDxa(PAGE.bodyBottomPx), left: MARGIN_X, right: MARGIN_X,
          header: pxToDxa(PAGE.headerTopPx), footer: pxToDxa(PAGE.footerBottomPx),
        } } },
        headers: { default: header(ctx) },
        footers: { default: footer() },
        children: body,
      },
    ],
  })
  return fixEmbeddedFontPartNames(await Packer.toBuffer(doc))
}

export async function getTemplateInfo() {
  return { templateOk: true, templateTags: 0, missingTags: [], note: 'Using docx-js builder (no template file required)' }
}
