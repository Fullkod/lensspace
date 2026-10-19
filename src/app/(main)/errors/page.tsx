import { redirect } from 'next/navigation'

import { ErrorLogWorkspace } from '@/features/error-log/components/ErrorLogWorkspace'
import type { ErrorGroupList } from '@/features/error-log/types'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/shared/ui'

// LEN0001: platform-admin only; list_error_groups also rejects anyone else.
export default async function ErrorsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { data: isPlatformAdmin } = await supabase.rpc('current_user_is_platform_admin')
  if (!isPlatformAdmin) redirect('/dashboard')
  const { data, error } = await supabase.rpc('list_error_groups', { target_status: null, target_limit: 200 } as never)
  if (error) throw error
  const list = data as unknown as ErrorGroupList

  return (
    <PageContainer>
      <PageHeader eyebrow="Administración de plataforma" title="Errores" description="Fallos de LensSpace agrupados. Te llega un WhatsApp la primera vez que aparece cada uno." />
      <ErrorLogWorkspace list={list} />
    </PageContainer>
  )
}
