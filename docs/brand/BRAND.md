# Projento — brand spec (v1, September 2026)

Projento replaces "Estates AI" as the product name. This file is the single reference for how the name, logo and tagline are used in the web app and in every report output (web report, PDF, Word).

## Name and copy

- Name: **Projento**. Capital P, the rest lower case. Never "ProJento", "Projento AI" or "PROJENTO" in running text. Spaced capitals are fine only where the design already uses uppercase letter-spaced labels (e.g. the cover footer band).
- Tagline (the only one): **Plan · Analyse · Report**. British spelling. Middle dots with a space either side. It replaces both "Data · Insights · Smarter decisions" and "Better insights. Smarter property decisions."
- Report descriptor (running footer): **Feasibility reporting for capital projects**.
- Do not lead with "AI" anywhere in brand copy. The selling point is that every figure is deterministic.

## Colours

| Role | Hex | Use |
|---|---|---|
| Navy | `#1A2E4A` | Wordmark on light backgrounds, cover band, footer band, monogram letter |
| Brand amber | `#D9A12E` | The "j" in the wordmark, monogram square, report rules and bullets |
| White | `#FFFFFF` | Wordmark on navy |

The web app's existing text token `--amber: #9D6B15` stays as it is. It exists for WCAG AA text contrast. Brand amber `#D9A12E` is for fills and the logo, not for small text on white.

## Logo files (`public/brand/`)

> **Where the files live in this repo** (moved from the original brand kit, September 2026): the four colour SVGs and all PNGs are in `public/brand/`; the two PNGs the Word builder embeds are also in `assets/brand/` (traced into the serverless functions by `next.config.ts`); the single-colour print SVGs are in `docs/brand/print/`; `favicon.ico`, `icon.svg` and `apple-icon.png` are in `app/` (Next.js file conventions) and `icon-192.png` / `icon-512.png` in `public/brand/`. Every brand string is in `lib/brand.js`.

The wordmark is Plus Jakarta Sans Bold at −0.03em tracking, **converted to outlines**. No font needs installing. Never retype the wordmark in a live font.

| File | Use |
|---|---|
| `projento-wordmark-white.svg` | On navy: report cover, cover footer band, dark app panels |
| `projento-wordmark-navy.svg` | On white or light tints: app header, login page, emails |
| `projento-header-lockup.svg` | Monogram and wordmark side by side. Report running header, compact app header |
| `projento-monogram.svg` | Amber square with a navy P. Avatars, compact nav, loading states |
| `projento-wordmark-black.svg` / `-mono-white.svg` | Single-colour print only |

PNG exports (in `public/brand/`, and in `assets/brand/` for the builder) are for the Word builder (`docx` needs raster images). The icons are for Next.js app-file conventions: `favicon.ico`, `icon.svg` (a bolder P, tuned for 16px), `apple-icon.png` (180px, full-bleed), `icon-192.png` and `icon-512.png`.

## Sizes and spacing

- Report cover wordmark: 35px tall at 96dpi (about 9.3mm). The tagline sits 9px below it: 9.5px, weight 500, 0.32em tracking, uppercase, colour `#A9B6C9`.
- Report running header lockup: 20px tall (about 5.3mm).
- App header: lockup 22–28px tall. On a phone, show the monogram alone below 360px width if space is tight.
- Minimum wordmark width is 80px on screen and 20mm in print. Below that, use the monogram.
- Clear space: at least the height of the monogram square's P on every side.

## Don'ts

- Don't recolour the "j" with anything other than brand amber. The single-colour versions are the only exception.
- Don't put the navy wordmark on navy or the white wordmark on light backgrounds.
- No gradients, shadows, outlines, stretching or rotation on the logo.
- Don't place the monogram and the wordmark side by side yourself. Use `projento-header-lockup.svg`.

## Reference mockups (`mockups/`)

`report-cover.html/.png` and `report-interior.html/.png` show the target report. Only the following change from the current report:

1. Cover lockup: the amber "AI" square and "Estates AI" text become `projento-wordmark-white.svg` plus the tagline.
2. Cover footer band: left reads "PROJENTO | FEASIBILITY REPORT". Right reads "Ref <ref> · <report date>", replacing the old tagline.
3. Running header: the "AI" badge and "Estates AI" text become `projento-header-lockup.svg`. The rest of the header is unchanged.
4. Running footer: "**Projento** · Feasibility reporting for capital projects · Indicative only". The `estates-ai-tool.vercel.app` URL is removed until the domain is live.

Section bands, KPI tiles, fonts, colours and layout are otherwise unchanged.
