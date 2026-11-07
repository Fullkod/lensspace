# Payments follow the sale currency; USD uses the sale rate

Date: 2026-11-06

- Problem raised by Roberto: an order priced in USD showed its balance in CUP and the
  payment form opened in CUP. Each USD payment also accepted a seller-typed rate, so
  100 USD paid against a 100 USD order could leave a CUP balance or be rejected.
- Decision (point 1, before the pilot): the balance stays stored as CUP equivalents
  (mixed payments still work), but
  - a sale priced only in USD shows balance/total/paid in USD (≈ CUP below) and the
    payment form opens in USD;
  - CUP and mixed sales keep CUP as default; mixed totals show the breakdown
    ("3 000 CUP + 50 USD");
  - every USD payment is valued at the order's frozen `usd_to_cup_rate`: the form
    shows it read-only and `private.prepare_cash_payment` overrides any client rate.
- Implementation: migration `20261107021257_lock_usd_payments_to_sale_rate.sql`
  (trigger + `totals` in `get_order_payment_summary`), helper
  `src/features/orders/sale-currency.ts`, `PaymentForm`, `OrderDetail`,
  `AcceptedOrderPanel`. Rollback test on JAV-2026-000011: 35 USD sent with rate 500
  was stored at 930 and settled the order exactly.
- Still in CUP equivalents: the /orders list rows and KPIs, and cashbox views.
- Deferred (point 2): per-currency balances in the database; needs its own PRP.
