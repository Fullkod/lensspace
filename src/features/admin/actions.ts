'use server'

import { headers } from 'next/headers'

import { getCurrentUser } from '@/lib/supabase/current-user'
import { createClient } from '@/lib/supabase/server'
import { describeError } from '@/shared/lib/error-report'
import { recordServerError } from '@/shared/lib/report-server-error'

export type OwnerResetResult = { error: string | null; email: string | null }

// LEN0001: the admin sees friendly copy; the error log keeps the real failure.
async function recordHandledError(error: unknown) {
  const { message, stack } = describeError(error)
  await recordServerError({ source: 'server_handled', message, stack, route: '/organizations', userId: (await getCurrentUser())?.id })
}

// QA-23: the platform admin sends the owner a recovery link (the owner sets a new
// password on /set-password). The RPC rejects anyone who is not a platform admin.
export async function sendOwnerPasswordReset(ownerUserId: string): Promise<OwnerResetResult> {
  const supabase = await createClient()
  const { data: email, error } = await supabase.rpc('platform_owner_email', { target_user_id: ownerUserId } as never)
  if (error?.code === '42501') return { error: 'No tienes permisos para esta acción.', email: null }
  if (error) {
    await recordHandledError(error)
    return { error: 'No pudimos encontrar la cuenta del propietario.', email: null }
  }
  if (typeof email !== 'string' || !email) return { error: 'Este usuario no tiene un correo de acceso.', email: null }
  const origin = (await headers()).get('origin') ?? ''
  const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: origin ? `${origin}/auth/callback` : undefined })
  if (resetError) {
    const message = resetError.status === 429
      ? 'Se enviaron demasiados correos. Espera unos minutos e inténtalo de nuevo.'
      : resetError.code === 'email_address_invalid' ? `El correo ${email} no puede recibir mensajes.` : 'No pudimos enviar el enlace.'
    if (resetError.status !== 429 && resetError.code !== 'email_address_invalid') await recordHandledError(resetError)
    return { error: message, email: null }
  }
  return { error: null, email }
}
