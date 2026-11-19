# M-Pesa (Daraja) setup for Vatican Cake Point

Flow: **Cart → `mpesa-stk-push` → customer's phone → Safaricom → `mpesa-callback` → database → Cart updates.**
The app never talks to Safaricom and never decides what was paid. Only the two Edge Functions and the SQL function do.

## 1. Run the database migration

Run `migrations/20261101000000_mpesa_payments.sql` (SQL editor, or `supabase db push`).
Read the assumptions at the top first: `cake_orders.id` is assumed to be `uuid`, and
`payment_status` must accept the new values `Paid` and `Deposit Paid`.

The migration also makes the server the source of truth for price. After it runs, a customer can no
longer set their own `total_price` or mark an order `Paid` from the app.

## 2. Create a Daraja app

1. Sign in at developer.safaricom.co.ke and create an app with the **Lipa Na M-Pesa Sandbox** product.
2. Note the **Consumer Key** and **Consumer Secret**.
3. For sandbox use shortcode `174379` and the public sandbox passkey shown under *Simulate* → *M-Pesa Express*.

## 3. Set the secrets

```bash
# long random string that protects the callback URL
openssl rand -hex 32

supabase secrets set \
  MPESA_ENV=sandbox \
  MPESA_CONSUMER_KEY=xxxx \
  MPESA_CONSUMER_SECRET=xxxx \
  MPESA_SHORTCODE=174379 \
  MPESA_PASSKEY=xxxx \
  MPESA_CALLBACK_SECRET=<the random string above> \
  MPESA_CALLBACK_URL=https://<project-ref>.supabase.co/functions/v1/mpesa-callback
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.
For a **Till** (Buy Goods) also set `MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and
`MPESA_PARTY_B=<till number>`.

## 4. Deploy

```bash
supabase functions deploy mpesa-stk-push
supabase functions deploy mpesa-callback --no-verify-jwt
```

`--no-verify-jwt` is required for the callback only, because Safaricom has no Supabase login.
The secret in the URL is what protects it. To make this permanent, add to `supabase/config.toml`:

```toml
[functions.mpesa-callback]
verify_jwt = false
```

## 5. Test in sandbox

1. Add a cake to the cart and tap **Pay with M-Pesa**.
2. In the sandbox the push is simulated: use the Daraja simulator with the same CheckoutRequestID
   (find it in the `payments` table), or the test number `254708374149`.
3. Check: the `payments` row moves from `Pending` to `Success`, the `cake_orders` row becomes
   `Paid` or `Deposit Paid`, and the item leaves the cart.
4. Also test a cancelled prompt (status `Cancelled`) and a wrong PIN (status `Failed`).

View logs in the Supabase dashboard: **Edge Functions**, then the function, then **Logs**.

## 6. Go live checklist

- [ ] Production credentials from the Daraja **Go Live** process, `MPESA_ENV=production`, your real shortcode and passkey.
- [ ] Confirm the callback URL is registered and reachable (HTTPS).
- [ ] Re-run the sandbox tests with a real 10 KES payment.
- [ ] Add an **STK Query** fallback for prompts whose callback never arrives (see below).
- [ ] Review the REVIEW notes at the bottom of the migration (delete policy, admin view).
- [ ] Keep the service role key, consumer secret and passkey out of the app and out of git.

## Known gaps (recommended next)

- **Lost callbacks.** If Safaricom's callback is missed, the payment stays `Pending`. A small scheduled
  function should call the STK Query API for pending payments older than 2 minutes and settle them.
- **Deposit balance.** A `Deposit Paid` order records `amount_paid`. The balance due at delivery is
  `total_price - amount_paid`. There is no screen or flow to collect it yet.
- **Customer order history.** Once paid, an order leaves the cart and the customer has no screen to see its
  progress. An Orders tab fed by `cake_orders` is the natural next screen.
- **Refunds.** Reversals go through the Daraja Reversal API and are not implemented.

---

# Nova assistant setup

1. Run `migrations/20261104000000_nova_assistant.sql` in the SQL Editor.
2. Get an API key from console.anthropic.com and store it as a secret (it never goes in the app):

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxx
```

   Optional: `NOVA_MODEL=claude-sonnet-5-5` for smarter (and costlier) answers. The default is `claude-haiku-5-5`.
3. Deploy (this one keeps JWT verification ON, so only signed-in users can call it):

```bash
npx supabase functions deploy nova-assistant --use-api
```

Each customer is limited to 30 questions per hour (change `HOURLY_LIMIT` in the function).
