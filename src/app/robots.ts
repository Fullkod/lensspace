import type { MetadataRoute } from 'next'

import { siteConfig } from '@/shared/config/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/auth/',
        '/cashbox',
        '/catalog',
        '/customers',
        '/dashboard',
        '/errors',
        '/login',
        '/orders',
        '/organizations',
        '/prescriptions',
        '/production',
        '/sales',
        '/set-password',
        '/signup',
        '/team',
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}
