# WhatsApp message format (emoji title, bold data, italic signature)

Date: 2026-11-06

- Product owner asked for readable WhatsApp messages: separate lines, bold and italics. Chosen style:
  one emoji in a bold title (✅ confirmado, 💵 pago, 👓 listo, 🎉 entregado), greeting line, key data as
  `Pedido: *…*`, `Pago: *…*`, `Saldo pendiente: *… CUP*`, and the sender signature in `_italics_`, one idea per line.
- Templates live in `public.notification_templates.body_template`; the signature is appended by
  `public.get_automatic_notification_payload` (the only renderer in use, called by the
  `send-whatsapp-notification` Edge Function). Migration `20261106231220_format_whatsapp_messages.sql`.
- `prepare_manual_notification` / `prepare_openwa_notification` still exist but nothing calls them
  (legacy; they do not fill `{{store_name}}`/`{{payment_amount}}`). Not removed.
- Customer names with `*` or `_` would break the formatting; not escaped (unlikely in practice).
- Verified in production on JAV-2026-000010 (4 messages sent). Evidence: `.titan/qa/2026-11-06-pre-pilot/`.
