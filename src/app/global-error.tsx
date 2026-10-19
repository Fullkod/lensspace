'use client'

import { useEffect } from 'react'

import { reportClientError } from '@/shared/lib/report-client-error'

// Replaces the root layout when it fails, so it cannot rely on the app's CSS.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // A digest means the server already recorded it (LEN0001).
  useEffect(() => { if (!error.digest) reportClientError('client', error) }, [error])
  return (
    <html lang="es">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f4f8f7', fontFamily: 'system-ui, sans-serif', color: '#07322f' }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>No pudimos cargar LensSpace</h1>
          <p style={{ margin: '0 0 20px', color: '#4b6563', lineHeight: 1.5 }}>Puede ser la conexión. Lo que ya guardaste no se perdió; vuelve a intentarlo cuando haya señal.</p>
          <button type="button" onClick={() => retry()} style={{ border: 0, borderRadius: 12, padding: '12px 20px', background: '#0d7a72', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Reintentar</button>
        </main>
      </body>
    </html>
  )
}
