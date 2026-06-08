/**
 * /preview layout — Modern/Technical redesign test bed.
 *
 * Loads its own fonts and theme so nothing here touches the live site.
 * Everything is wrapped in `.theme-modern`, under which all preview-theme.css
 * tokens are scoped.
 */
import { Space_Grotesk, Geist, Geist_Mono } from 'next/font/google'
import './preview-theme.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
})
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata = {
  title: 'Estates AI — Design Preview',
  description: 'Modern/Technical redesign preview',
}

export default function PreviewLayout({ children }) {
  return (
    <div className={`${spaceGrotesk.variable} ${geistSans.variable} ${geistMono.variable} theme-modern`}>
      {children}
    </div>
  )
}
