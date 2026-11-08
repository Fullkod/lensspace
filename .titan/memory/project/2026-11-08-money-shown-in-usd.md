# Money is shown in USD everywhere; the base keeps its currencies

Date: 2026-11-08

Decision (Roberto): "todo en USD, respetando las cosas base". Supersedes the display part
of `2026-11-06-sale-currency-payments.md` (USD only for USD-only sales).

- Shown in USD, each order converted at its own frozen `usd_to_cup_rate`:
  - WhatsApp `{{balance}}` ("Pago recibido", "Tu pedido está listo"), rounded up to the cent
    (`20261108050000_whatsapp_balance_always_usd.sql`).
  - Orders: balance, total (with the original price "precio 13,000 CUP + 50 USD" below),
    paid, payment rows, inbox amounts, "Saldo por cobrar" / "Cobrado hoy" on /orders and
    the dashboard, the accepted-order panel, the quote "Equivalente", and the owner
    analytics (Ventas, Cobros, Saldo pendiente, por vendedor).
  - The payment form defaults to USD; CUP payments are still allowed.
- Base unchanged: catalog prices and each payment keep their currency; cashboxes and
  closures stay per currency; balances are still stored and validated as CUP equivalents
  at the sale rate (USD payments valued at that rate by `private.prepare_cash_payment`).
- Left in CUP on purpose: catalog price preview and the platform activity panel (admin).
- Code: `src/features/orders/sale-currency.ts` (`saleCurrency()` returns 'USD', `isUsdOnly`,
  `toUsd`, `cupToUsd`), `order-kpis.ts`; DB `20261108060000_money_in_usd_views.sql`
  (`saleRate` in `list_accessible_orders`, `get_order_kpis` balanceDueUsd/collectedTodayUsd,
  owner dashboard salesUsd/collectionsUsd/outstandingUsd/sales_usd).
- Any new money figure: show USD, keep the stored currency.
