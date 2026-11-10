import { redirect } from 'next/navigation'

import { AccountJobsWorkspace, type AccountPortal } from '@/features/wholesale/components'
import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { PageContainer } from '@/shared/ui'

export default async function AccountJobsPage() {
  const supabase = await createClient()
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const { data } = await supabase.rpc('get_my_account_portal')
  return <PageContainer><AccountJobsWorkspace portals={(data ?? []) as unknown as AccountPortal[]} /></PageContainer>
}
