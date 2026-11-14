import type { Metadata } from 'next'
import { Source_Sans_3, Space_Grotesk } from 'next/font/google'

import { AndroidUpdatePrompt } from '@/shared/components/AndroidUpdatePrompt'
import { ServiceWorkerRegistration } from '@/shared/components/ServiceWorkerRegistration'
import { siteConfig } from '@/shared/config/site'
import { installPromptCaptureScript } from '@/shared/lib/pwa-install'

import './globals.css'

const sourceSans = Source_Sans_3({
  subsets: ['latin'],
  variable: '--font-source-sans',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: 'LensSpace',
  title: {
    default: `${siteConfig.title} | LensSpace`,
    template: '%s | LensSpace',
  },
  description: siteConfig.description,
  generator: 'Next.js',
  category: 'business software',
  referrer: 'origin-when-cross-origin',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sourceSans.variable} ${spaceGrotesk.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: installPromptCaptureScript }} />
        {children}
        <ServiceWorkerRegistration />
        <AndroidUpdatePrompt />
      </body>
    </html>
  )
}
