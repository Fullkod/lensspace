import type { Metadata } from 'next'

import { authorizeManualAccess, loadManualInput } from '@/features/client-docs/authorize-manual'
import { ClientDocsGenerator } from '@/features/client-docs/components/ClientDocsGenerator'
import { ManualReader } from '@/features/client-docs/components/ManualReader'
import { FullkodCredit } from '@/shared/components'

export const metadata: Metadata = { title: 'Manual del sistema', robots: { index: false, follow: false, nocache: true } }

export default async function ManualPage() {
  const [access, manual] = await Promise.all([authorizeManualAccess(), loadManualInput()])
  return (
    <>
      {access.canEdit
        ? <ClientDocsGenerator initialInput={manual.input} savedAt={manual.savedAt} />
        : <ManualReader input={manual.input} audiences={access.audiences} />}
      <div className="flex justify-end px-6 pb-6 print:hidden">
        <FullkodCredit />
      </div>
    </>
  )
}
