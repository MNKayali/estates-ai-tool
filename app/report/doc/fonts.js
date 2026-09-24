// IBM Plex for the report document only (the rest of the app keeps its fonts
// until the website phase). Exposed as CSS variables that lib/reportStyle.js's
// font stacks reference: --r-font-sans / --r-font-mono.
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

export const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--r-font-sans',
  display: 'swap',
})

export const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--r-font-mono',
  display: 'swap',
})
