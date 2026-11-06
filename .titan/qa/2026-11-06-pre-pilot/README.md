# Pre-pilot production run — 2026-11-06

Date: 2026-11-06
Where: production (https://lensspace.fullkod.com), org "Óptica Javier Prueba" (id 2), owner account.

## Checks
- Vercel: custom domain 200, functions run in `yul1` (`x-vercel-id: iad1::yul1::…`) → QA-31 resolved.
  Latest commit deployed ("Desarrollado por Fullkod" credit visible).
- elTOQUE: 'Actualizar con elTOQUE' set 930 CUP; `market_exchange_rates` row 2026-11-06 = 930.
- Leaked-password protection (QA-60): Management API answers "available on Pro Plans and up"
  (org is on Free) → cannot enable; stays documented.
- Console: 0 errors during the whole run.

## JAV-2026-000009 (full flow)
New customer "QA PILOTO WhatsApp 1106" (+53 5307 7035, consent ON) + prescription → frame 3,000 CUP +
Monofocal Anti Blue 50 USD (× 930 = 49,500 CUP eq.) → accept → 20,000 CUP deposit → lenses and mounting
in the in-house workshop (start → ready → received → reviewed) → 'Avisar: listo' → balance paid in USD
(31.73 USD × 930 = 29,508.9 CUP, 8.9 CUP rounding accepted) → delivered.
WhatsApp: order_accepted, payment_received ×2, order_ready, order_delivered → all `sent` with messageId.

## JAV-2026-000010 (new message format)
After migration `20261106231220_format_whatsapp_messages`: 7,000 CUP sale, full payment, 'Avisar: listo',
delivery without production → '¿Entregar igual?' warning → delivered. 4 messages `sent` in the new format.

Test data left in the test org: customer "QA PILOTO WhatsApp 1106", orders JAV-2026-000009/000010.
