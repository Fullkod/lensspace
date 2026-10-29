import type { Metadata } from 'next'

import { FullkodCredit } from '@/shared/components'

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-canvas">
      {children}
      <div className="absolute inset-x-0 bottom-3 flex justify-center px-6 lg:justify-end">
        <FullkodCredit />
      </div>
    </div>
  )
}
