import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.116.0'

// LEN0001: sends one error-log alert to the platform admin through OpenWA.
// Called only by private.queue_error_alert with the internal secret; the message
// and recipient (platform_provider_profile.phone) were rendered in the database.
// The OpenWA helpers mirror send-subscription-notice so that function is not redeployed.

type Alert = { alertId: number; status: 'requested' | 'sent' | 'failed' | 'skipped'; recipient: string | null; message: string }

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return result === 0
}

function phoneToChatId(phone: string, countryCode: string) {
  const raw = phone.trim()
  if (raw.startsWith('+')) return `${raw.slice(1).replace(/[^\d]/g, '')}@c.us`
  const number = raw.replace(/[^\d]/g, '')
  const code = countryCode.replace(/[^\d]/g, '')
  return `${!code || number.startsWith(code) ? number : `${code}${number}`}@c.us`
}

function providerMessageId(raw: Record<string, unknown>) {
  if (typeof raw.messageId === 'string') return raw.messageId
  const data = raw.data
  return data && typeof data === 'object' && typeof (data as Record<string, unknown>).messageId === 'string'
    ? (data as Record<string, unknown>).messageId as string
    : null
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Configuración de Supabase incompleta.' }, 500)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: configData, error: configError } = await admin.rpc('get_openwa_runtime_config')
  if (configError) return jsonResponse({ error: 'No se pudo cargar la configuración de OpenWA.' }, 500)

  const config = (configData ?? {}) as Record<string, string>
  const expectedSecret = config.vision_studio_wa_notify_secret
  const providedSecret = request.headers.get('x-wa-secret') ?? ''
  if (!expectedSecret || !secureEqual(providedSecret, expectedSecret)) return jsonResponse({ error: 'No autorizado.' }, 401)

  let payload: { alertId?: number }
  try { payload = await request.json() } catch { return jsonResponse({ error: 'Solicitud inválida.' }, 400) }
  if (!Number.isSafeInteger(payload.alertId) || (payload.alertId ?? 0) <= 0) return jsonResponse({ error: 'Aviso inválido.' }, 400)

  const { data, error } = await admin.rpc('get_platform_alert_payload', { target_alert_id: payload.alertId })
  if (error) return jsonResponse({ error: error.message }, 400)
  const alert = data as Alert | null
  if (!alert) return jsonResponse({ error: 'Aviso no encontrado.' }, 404)
  if (alert.status !== 'requested') return jsonResponse({ ok: alert.status === 'sent', duplicate: true })

  async function finish(outcome: 'sent' | 'failed', failureCode: string | null, failureMessage: string | null, messageId: string | null) {
    const { error: completeError } = await admin.rpc('complete_platform_alert', {
      target_alert_id: alert!.alertId, target_outcome: outcome, target_failure_code: failureCode,
      target_failure_message: failureMessage, target_message_id: messageId,
    })
    if (completeError) throw completeError
  }

  if (!alert.recipient) {
    await finish('failed', 'missing_recipient', 'La plataforma no tiene teléfono del proveedor.', null)
    return jsonResponse({ ok: false, failureCode: 'missing_recipient' }, 422)
  }

  const openwaBaseUrl = config.vision_studio_openwa_base_url?.replace(/\/$/, '')
  const openwaApiKey = config.vision_studio_openwa_api_key
  const openwaSessionId = config.vision_studio_openwa_session_id
  if (!openwaBaseUrl || !openwaApiKey || !openwaSessionId) {
    await finish('failed', 'provider_not_configured', 'OpenWA no está configurado.', null)
    return jsonResponse({ error: 'OpenWA no está configurado.' }, 503)
  }

  const chatId = phoneToChatId(alert.recipient, config.vision_studio_openwa_country_code ?? '53')
  let response: Response
  let raw: Record<string, unknown> = {}
  let responseText = ''
  try {
    response = await fetch(`${openwaBaseUrl}/sessions/${openwaSessionId}/messages/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': openwaApiKey },
      body: JSON.stringify({ chatId, text: alert.message }),
    })
    responseText = await response.text()
    try { raw = JSON.parse(responseText) as Record<string, unknown> } catch { raw = {} }
  } catch (sendError) {
    const failureMessage = sendError instanceof Error ? sendError.message : 'No se pudo contactar OpenWA.'
    await finish('failed', 'provider_network_error', failureMessage.slice(0, 500), null)
    return jsonResponse({ ok: false, failureCode: 'provider_network_error' }, 502)
  }

  const sent = response.ok && raw.success !== false
  // QA-61: OpenWA can deliver and then answer 5xx; that outcome is unknown, never retried.
  const failureCode = sent ? null : response.status >= 500 ? 'provider_unconfirmed' : `provider_http_${response.status}`
  const failureMessage = sent ? null : String(raw.message ?? raw.error ?? (responseText.trim() || `OpenWA respondió HTTP ${response.status}`)).slice(0, 500)
  await finish(sent ? 'sent' : 'failed', failureCode, failureMessage, providerMessageId(raw))
  return sent ? jsonResponse({ ok: true }) : jsonResponse({ ok: false, failureCode }, 502)
})
