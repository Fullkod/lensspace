# Integración OpenWA para notificaciones de pedidos

Fecha: 2026-09-20
Estado: envío real verificado el 2026-10-02 (los mensajes llegan), pero OpenWA responde HTTP 500 tras enviar y el intento queda como failed: falso negativo, ver QA-61 en .titan/plans/prp-pilot-qa-hardening.md

## Decisión

- Las cuatro plantillas se disparan automáticamente al confirmar el pedido,
  registrar cada pago, completar los trabajos de producción actuales y entregar.
- La Edge Function `send-whatsapp-notification` acepta solo llamadas internas firmadas;
  las credenciales nunca llegan al navegador.
- La base conserva la autoridad sobre permisos, módulo WhatsApp, consentimiento,
  destinatario y renderizado mediante `prepare_openwa_notification`.
- `notification_attempts` sigue siendo append-only y ahora distingue `opened`,
  `sent` y `failed`. Para OpenWA registra `provider_message_id` y `provider_chat_id`.
- El historial del pedido refleja cada intento automático con una acción legible
  en español, incluida la confirmación de envío o el fallo de WhatsApp, además del
  evento comercial que originó la notificación.
- El cliente tolera las respuestas OpenWA documentada y real: `{success,data}` y
  `{messageId,...}`. El identificador de sesión debe ser el UUID, no el alias.
- El código de país predeterminado es Cuba (`53`) y no se duplica si el teléfono
  ya viene en formato internacional.
- Cada evento tiene una clave única en `private.notification_dispatches`, evitando
  notificaciones duplicadas si una transición se repite.
- `/orders` ya no presenta envío manual y explica el comportamiento automático.

## Verificación

- ESLint, TypeScript y la compilación Next.js pasaron.
- Las migraciones `20260920224027` y `20260920225647` están aplicadas remotamente.
- La suite SQL transaccional y `supabase db lint` remoto pasaron.
- La Edge Function está desplegada. Su autenticación interna y lectura de Vault
  devolvieron el 404 esperado ante un despacho inexistente.
- La sesión compartida de Tasknic (`robert-us`) existe en OpenWA y está `ready`.
- La migración `20260920233125_repair_notification_timeline_utf8.sql` corrigió
  los literales mojibake de `get_order_timeline`; el pedido `JAV-2026-000002`
  devuelve ahora `Aceptación del cliente` y `Confirmación verbal` correctamente.
- La corrección de UTF-8 vive en la base de datos, no como sustitución cosmética
  en la interfaz, para que todos los consumidores reciban tildes válidas.

## Pendiente

Ejecutar un envío real controlado con un cliente que haya otorgado consentimiento
y un teléfono confirmado por el usuario. Los secretos OpenWA y el secreto interno
están cifrados en Supabase Vault.

La recepción de respuestas queda fuera de este bloque hasta definir un caso de uso;
necesitaría webhook HMAC, idempotencia y asociación mediante `messageId`/`@lid`.

## Update 2026-10-21 — diagnosing "failed" WhatsApp attempts

- QA-61 still holds: OpenWA (session `robert-us`, sender +1 575 318 0319) answers HTTP 500
  even when the message is delivered, so `notification_attempts` shows `provider_unconfirmed`
  for real deliveries. No attempt has ever been stored as `sent`. Do not read "failed" as "not
  delivered": check the sender phone or the recipient.
- Case LEN0003 (Óptica Javier, OJV-2026-000001): the real cause was a wrong customer phone
  typed by the owner (…43 instead of …46), not OpenWA.
- Safe manual check/resend without exposing secrets: from SQL, read the Vault values inside
  the query and call OpenWA with `net.http_get`/`net.http_post`
  (`/sessions/<id>`, `/sessions/<id>/messages/send-text` with `chatId` `53XXXXXXXX@c.us`), then
  read `net._http_response`. Manual resends bypass the edge function and are not recorded in
  the order timeline.
