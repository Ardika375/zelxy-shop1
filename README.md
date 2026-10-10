# ZelXy Shop — Netlify-only starter (Functions + Blobs)

This project removes the Supabase dependency. It uses Netlify Functions for backend endpoints and Netlify Blobs for persistent storage. The storage is protected by server-side functions; the browser never receives the Telegram bot token or admin API key.

## Important limitations — read before launch
- This is a **small, low-volume shop starter**, not a high-scale transactional commerce database. It serializes writes with a lock in Blobs and limits inventory to 2,000 items and the state document to about 4 MB. Netlify documents Blobs as key-value/object storage and warns that last-write-wins storage is not a transactional relational database. For high-volume orders or strict financial/inventory guarantees, use a transactional database instead.
- A stale lock can be reclaimed after 2 minutes. A short lock timeout can temporarily reject writes with a retry message.
- The proof image is stored privately in Blobs; the starter does not expose a public proof URL.
- QRIS is **manual**. Admin must inspect the actual merchant transaction before approving. Uploaded screenshot is not proof that money arrived.
- The customer sees their proxy data on a private status page after approval. This does not send a Telegram DM to the customer.
- The code has not been deployed into your Netlify account or tested against your live bot. You must configure and perform an end-to-end test.
- Prices in `netlify/functions/lib.mjs` and `public/index.html` are example values in IDR. Edit both before launch.
- Only import proxy data you own or have permission to resell.

## 1. Add your QRIS image
Place your official merchant QRIS image at `public/qris.png`. It is intentionally not included in this ZIP.

## 2. Deploy
1. Extract the ZIP.
2. Push the project to a Git repository and import that repository in Netlify, or install Node.js then run:
   - `npm install`
   - `npx netlify login`
   - `npx netlify init`
   - `npm run check`
   - `npx netlify deploy --build` (draft deploy) and `npx netlify deploy --build --prod` (production)
3. Netlify Functions use `netlify/functions/`; the static site uses `public/`.
4. Netlify Blobs site-wide storage is provisioned automatically when called from deployed Functions; no separate Blobs key is needed. Keep production data safe: deploy previews share the same site-wide store. Don't test destructive changes in a preview against production data.

## 3. Set environment variables
In Netlify: **Project configuration → Environment variables**. Add:
- `ADMIN_API_KEY` — long random secret, e.g. generated with a password manager.
- `TELEGRAM_BOT_TOKEN` — token from @BotFather.
- `TELEGRAM_ADMIN_IDS` — comma-separated numeric Telegram user IDs.
- `TELEGRAM_WEBHOOK_SECRET` — random string of at least 24 characters, letters/numbers/underscore/hyphen.
- `STORE_NAME` (optional; display currently uses ZelXy Shop)
- `STORE_CONTACT` (optional; set your real support contact)

Redeploy after changing environment variables. Do not put secrets into HTML or Git.

## 4. Configure Telegram
1. Open `@BotFather`, run `/newbot`, and copy its token into `TELEGRAM_BOT_TOKEN`.
2. Obtain your numeric Telegram user ID and add it to `TELEGRAM_ADMIN_IDS`.
3. After deploy, set the webhook. Replace placeholders and open the URL using your own browser/terminal:
   `https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://YOUR-SITE.netlify.app/.netlify/functions/telegram-webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`
4. Keep that URL private because it contains your bot token. The secret token must exactly match `TELEGRAM_WEBHOOK_SECRET`.
5. Send `/start` to the bot if needed; this project sends admin notifications to the configured admin numeric IDs.

## 5. Import stock
Open your deployed site and use **Admin · Import Stock**. Enter `ADMIN_API_KEY` in the admin field, choose a provider, then upload TXT or CSV. Supported basic format:
- One proxy per line: `host:port:user:password`
- CSV: a `proxy` or `proxy_data` column is supported; otherwise the first column is used.
The server ignores duplicate provider/proxy pairs.

## 6. Test before accepting real orders
1. Import a dummy proxy record.
2. Place an order using your own contact.
3. Pay only in a controlled test if appropriate; submit a test proof image.
4. Confirm the Telegram notification arrives.
5. Verify actual transaction details in the merchant app before clicking Approve.
6. Open the private order link and confirm the proxy appears only after approval.
7. Test rejection, insufficient stock, and duplicate imports.
8. Check Netlify Function logs for errors.

## Security checklist
- Keep `ADMIN_API_KEY`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_WEBHOOK_SECRET` private.
- Restrict `TELEGRAM_ADMIN_IDS` to trusted numeric IDs.
- Use HTTPS and rotate secrets if they leak.
- The status URL contains a high-entropy token; treat it like a password.
- No customer Telegram chat IDs are collected, so delivery is on the private order page.
- Blobs have no built-in access control; this application relies on Function checks. Do not add endpoints that expose arbitrary blob keys.
- For a high-volume store, use a transactional database with row-level locking instead of a single JSON blob.
