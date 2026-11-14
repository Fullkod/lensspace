'use client'

import { Download } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { installedVersionCode, installRelease, isAndroidShellUserAgent, type AndroidRelease } from '@/shared/lib/android-shell'

const CHECK_EVERY_MS = 10 * 60 * 1000

type Row = { version_code: number; version_name: string; storage_path: string; size_bytes: number; notes: string | null; min_supported_version_code: number }

// LEN0012: inside the Android app, notices a newer published APK on open and when the app comes
// back, says so and installs it from inside the app. Mandatory when the installed version is below
// min_supported_version_code. Renders nothing in browsers.
export function AndroidUpdatePrompt() {
  const [release, setRelease] = useState<AndroidRelease | null>(null)
  const [installed, setInstalled] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [progress, setProgress] = useState<number | null | undefined>(undefined)
  const [error, setError] = useState('')
  const lastCheck = useRef(0)

  const check = useCallback(async () => {
    if (!navigator.onLine || Date.now() - lastCheck.current < CHECK_EVERY_MS) return
    lastCheck.current = Date.now()
    const version = await installedVersionCode().catch(() => null)
    if (!version) return
    const { data } = await createClient().from('android_releases').select('version_code, version_name, storage_path, size_bytes, notes, min_supported_version_code').order('version_code', { ascending: false }).limit(1).maybeSingle()
    const row = data as Row | null
    setInstalled(version)
    setRelease(row && row.version_code > version ? {
      versionCode: row.version_code, versionName: row.version_name, storagePath: row.storage_path, sizeBytes: row.size_bytes, notes: row.notes, minSupportedVersionCode: row.min_supported_version_code,
    } : null)
  }, [])

  useEffect(() => {
    if (!isAndroidShellUserAgent()) return
    const timer = window.setTimeout(() => void check(), 0)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [check])

  if (!release || !installed) return null
  const mandatory = installed < release.minSupportedVersionCode
  if (dismissed && !mandatory) return null

  async function update() {
    if (!release) return
    setError(''); setProgress(null)
    try {
      await installRelease(release, setProgress)
      setProgress(undefined)
    } catch {
      setProgress(undefined)
      setError('No se pudo descargar la actualización. Revisa la señal e inténtalo de nuevo.')
    }
  }

  const downloading = progress !== undefined
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-50 border-b border-line-soft bg-surface px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] shadow-e1">
      <div className="mx-auto flex max-w-[720px] flex-wrap items-center gap-3">
        <Download aria-hidden="true" size={20} className="shrink-0 text-action" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{mandatory ? 'Tienes que actualizar LensSpace' : 'Hay una versión nueva de LensSpace'} ({release.versionName})</p>
          <p className="text-[13px] text-text-muted">
            {downloading ? (progress === null ? 'Descargando…' : `Descargando… ${Math.round((progress ?? 0) * 100)} %`) : release.notes ?? `Pesa ${(release.sizeBytes / 1024 / 1024).toFixed(1)} MB. Al terminar, Android te pide confirmar la instalación.`}
          </p>
          {error ? <p className="text-[13px] font-semibold text-coral-ink">{error}</p> : null}
        </div>
        <div className="flex gap-2">
          {!mandatory ? <button type="button" onClick={() => setDismissed(true)} disabled={downloading} className="min-h-10 rounded-control px-3 text-sm font-semibold text-action disabled:opacity-50">Luego</button> : null}
          <button type="button" onClick={update} disabled={downloading} className="min-h-10 rounded-control bg-action px-4 text-sm font-semibold text-white disabled:opacity-60">Actualizar</button>
        </div>
      </div>
    </div>
  )
}
