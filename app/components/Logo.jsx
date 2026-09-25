import { BRAND, LOGOS, logoWidth } from '@/lib/brand'

const VARIANT = { navy: LOGOS.wordmarkNavy, white: LOGOS.wordmarkWhite, lockup: LOGOS.lockup, monogram: LOGOS.monogram }

/**
 * The Projento logo as an <img> with explicit size (docs/brand/BRAND.md):
 * navy wordmark on light backgrounds, white on navy panels. compactBelow360
 * also renders the monogram and lets globals.css show only one of the two, so
 * a phone narrower than 360px gets the monogram. The hidden one is
 * display:none, so a screen reader announces "Projento" once.
 */
/* eslint-disable @next/next/no-img-element -- static SVG logo; next/image adds nothing for SVG */
export default function Logo({ variant = 'navy', height = 24, compactBelow360 = false }) {
  const logo = VARIANT[variant]
  const full = (
    <img src={logo.src} alt={BRAND.name} width={logoWidth(logo, height)} height={height}
      className={compactBelow360 ? 'brand-full' : undefined} style={{ display: 'block' }} />
  )
  if (!compactBelow360) return full
  return (
    <>
      {full}
      <img src={LOGOS.monogram.src} alt={BRAND.name} width={height} height={height} className="brand-compact" />
    </>
  )
}
