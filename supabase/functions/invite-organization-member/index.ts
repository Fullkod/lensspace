import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type InvitationRequest = {
  organizationId: number
  branchId: number | null
  role: 'seller' | 'lens_provider' | 'mounting_provider' | 'account_user'
  commercialAccountId?: number | null
  displayName: string
  email: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isValidRequest(value: unknown): value is InvitationRequest {
  if (!value || typeof value !== 'object') return false
  const input = value as Partial<InvitationRequest>

  return (
    Number.isSafeInteger(input.organizationId) &&
    (input.branchId === null || Number.isSafeInteger(input.branchId)) &&
    ['seller', 'lens_provider', 'mounting_provider', 'account_user'].includes(input.role ?? '') &&
    (input.role !== 'account_user' || Number.isSafeInteger(input.commercialAccountId)) &&
    typeof input.displayName === 'string' &&
    input.displayName.trim().length > 0 &&
    typeof input.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
  )
}

function getInviteRedirectUrl(request: Request) {
  const configuredUrl = Deno.env.get('INVITE_REDIRECT_URL')
  const requestOrigin = request.headers.get('origin')
  if (!configuredUrl && !requestOrigin) return null

  try {
    const url = configuredUrl
      ? new URL(configuredUrl)
      : new URL('/auth/callback', requestOrigin!)
    const isLocalHttp =
      url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !isLocalHttp) return null
    if (url.pathname !== '/auth/callback') return null
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  const authorization = request.headers.get('Authorization')
  const token = authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'No autenticado.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const inviteRedirectUrl = getInviteRedirectUrl(request)
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !inviteRedirectUrl) {
    return jsonResponse({ error: 'Configuración del servidor incompleta.' }, 500)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Solicitud inválida.' }, 400)
  }
  if (!isValidRequest(payload)) {
    return jsonResponse({ error: 'Revisa los datos de la invitación.' }, 400)
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const {
    data: { user: actor },
    error: actorError,
  } = await callerClient.auth.getUser(token)
  if (actorError || !actor) {
    return jsonResponse({ error: 'Sesión inválida.' }, 401)
  }

  const { data: canManage, error: roleError } = await callerClient.rpc(
    'current_user_can_manage_organization',
    { target_organization_id: payload.organizationId },
  )
  if (roleError || !canManage) {
    return jsonResponse({ error: 'No tienes permisos para administrar este equipo.' }, 403)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const normalizedEmail = payload.email.trim().toLowerCase()
  const { data: existingUsers, error: lookupError } = await adminClient.rpc(
    'find_auth_user_by_email',
    { target_email: normalizedEmail },
  )
  if (lookupError) {
    return jsonResponse({ error: 'No se pudo comprobar la cuenta indicada.' }, 500)
  }

  const existingUser = existingUsers?.[0]
  let targetUserId = existingUser?.user_id
  let createdInvitation = false

  if (!targetUserId) {
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: { display_name: payload.displayName.trim() },
        redirectTo: inviteRedirectUrl,
      },
    )
    if (error || !data.user) {
      if (error) {
        console.error('Supabase Auth rejected an organization invitation.', {
          code: error.code,
          status: error.status,
          message: error.message,
        })
      }
      if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
        return jsonResponse(
          {
            error:
              'Se alcanzó el límite temporal de correos de Supabase. Espera hasta una hora o configura un proveedor SMTP propio antes de reenviar la invitación.',
          },
          429,
        )
      }
      if (error?.code === 'email_address_invalid') {
        return jsonResponse({ error: 'El correo no es válido o no acepta mensajes. Revísalo e inténtalo de nuevo.' }, 400)
      }
      return jsonResponse({ error: 'No se pudo enviar la invitación.' }, 400)
    }

    targetUserId = data.user.id
    createdInvitation = true
  }

  const { data: membershipId, error: membershipError } = await adminClient.rpc(
    'add_organization_member',
    {
      actor_user_id: actor.id,
      target_user_id: targetUserId,
      target_organization_id: payload.organizationId,
      target_branch_id: payload.role === 'seller' || payload.role === 'account_user' ? payload.branchId : null,
      target_role: payload.role,
      target_account_id: payload.role === 'account_user' ? payload.commercialAccountId : null,
      // QA-39: never enroll someone without consent. New accounts activate when they
      // confirm the invitation email; existing ones accept it from their dashboard.
      target_status: 'invited',
    },
  )

  if (membershipError) {
    if (createdInvitation) {
      await adminClient.auth.admin.deleteUser(targetUserId)
    }
    return jsonResponse({ error: 'No se pudo vincular la cuenta a la organización.' }, 400)
  }

  // Same response for known and unknown emails: it must not reveal whether an
  // account already exists.
  return jsonResponse({ membershipId, status: 'invited' }, 200)
})
