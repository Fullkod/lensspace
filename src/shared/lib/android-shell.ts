// LEN0012: helpers for the LensSpace Android app (Capacitor shell that loads this site). Plugins are
// imported dynamically so browsers never download them. The APK URL is always built from our own
// bucket and the published row, never taken from elsewhere: the page code is remote.

export type AndroidRelease = { versionCode: number; versionName: string; storagePath: string; sizeBytes: number; notes: string | null; minSupportedVersionCode: number }

const BUCKET_PATH = '/storage/v1/object/public/android-app/'

export function isAndroidShellUserAgent() {
  return typeof navigator !== 'undefined' && navigator.userAgent.includes('LensSpaceAndroid')
}

export function releaseApkUrl(release: Pick<AndroidRelease, 'storagePath'>) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${BUCKET_PATH}${encodeURIComponent(release.storagePath)}`
}

// Installed versionCode, or null outside the native app (browser, or a page without the bridge
// such as the offline desk served from the worker cache).
export async function installedVersionCode() {
  if (!isAndroidShellUserAgent()) return null
  const { Capacitor } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return null
  const { App } = await import('@capacitor/app')
  const info = await App.getInfo()
  return Number(info.build) || null
}

// Downloads the APK into the app cache and opens Android's installer (Kshop KSH0008). Android asks
// once to allow installs from LensSpace.
export async function installRelease(release: AndroidRelease, onProgress: (fraction: number | null) => void) {
  const [{ Directory, Filesystem }, { FileTransfer }, { FileOpener }] = await Promise.all([
    import('@capacitor/filesystem'), import('@capacitor/file-transfer'), import('@capawesome-team/capacitor-file-opener'),
  ])
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: 'lensspace-update.apk' })
  const listener = await FileTransfer.addListener('progress', (progress) => onProgress(progress.lengthComputable && progress.contentLength > 0 ? progress.bytes / progress.contentLength : null))
  try {
    await FileTransfer.downloadFile({ url: releaseApkUrl(release), path: uri, progress: true })
  } finally {
    await listener.remove()
  }
  await FileOpener.openFile({ path: uri, mimeType: 'application/vnd.android.package-archive' })
}
