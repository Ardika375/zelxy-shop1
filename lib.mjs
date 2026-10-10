import { getStore } from "@netlify/blobs";

export const PRODUCTS = {
  impulse: { name: "Impulse", price: 25000 },
  nodemaven: { name: "NodeMaven", price: 30000 },
  "9proxy": { name: "9Proxy", price: 20000 },
  meshproxy: { name: "Mesh Proxy", price: 28000 }
};

const STORE_NAME = "zelxy-shop-main";
const STATE_KEY = "state-v1";
const LOCK_KEY = "write-lock-v1";
const MAX_STATE_BYTES = 4_000_000;
const MAX_INVENTORY = 2000;

export function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type,x-admin-key",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    },
    body: JSON.stringify(body)
  };
}
export function body(event) {
  try { return JSON.parse(event.body || "{}"); } catch { return {}; }
}
export function store() {
  return getStore(STORE_NAME);
}
export function randomToken(bytes = 32) {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");
}
export function safeError(e) {
  console.error(e);
  return "Server error. Periksa Netlify Function logs.";
}
export function requireAdmin(event) {
  const expected = process.env.ADMIN_API_KEY;
  return Boolean(expected && event.headers["x-admin-key"] && event.headers["x-admin-key"] === expected);
}
export function isAdminId(id) {
  return (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean).includes(String(id));
}
export async function telegram(method, payload) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum diatur.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok || !data.ok) throw new Error(`Telegram API error: ${JSON.stringify(data)}`);
  return data.result;
}
function emptyState() {
  return { version: 1, inventory: [], orders: [], sold: [], nextInventoryId: 1, createdAt: new Date().toISOString() };
}
export async function readState() {
  const s = store();
  let state = await s.get(STATE_KEY, { type: "json", consistency: "strong" });
  if (state) return state;
  const initial = emptyState();
  try {
    await s.setJSON(STATE_KEY, initial, { onlyIfNew: true });
  } catch {}
  state = await s.get(STATE_KEY, { type: "json", consistency: "strong" });
  return state || initial;
}

// All writes serialize through a site-wide lock. A stale lock can only be reclaimed
// after 2 minutes, longer than a normal function invocation. This is for a small,
// low-volume single-store shop, not a high-concurrency inventory system.
export async function withStateLock(fn) {
  const s = store();
  const token = randomToken(18);
  const started = Date.now();
  let acquired = false;
  while (Date.now() - started < 8000) {
    const existing = await s.get(LOCK_KEY, { type: "json", consistency: "strong" });
    if (existing && Date.now() - Number(existing.at || 0) > 120000) {
      await s.delete(LOCK_KEY);
    }
    try {
      await s.setJSON(LOCK_KEY, { token, at: Date.now() }, { onlyIfNew: true });
      acquired = true;
      break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100 + Math.floor(Math.random() * 150)));
    }
  }
  if (!acquired) throw new Error("STORE_BUSY: coba lagi sebentar.");
  try {
    const state = await readState();
    const result = await fn(state);
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized, "utf8") > MAX_STATE_BYTES) throw new Error("STATE_LIMIT: data toko terlalu besar; ekspor arsip dan pindah ke database.");
    await s.set(STATE_KEY, serialized, { consistency: "strong" });
    return result;
  } finally {
    const current = await s.get(LOCK_KEY, { type: "json", consistency: "strong" }).catch(() => null);
    if (current?.token === token) await s.delete(LOCK_KEY).catch(() => {});
  }
}
export async function getOrderByAccess(orderCode, accessToken) {
  const state = await readState();
  const o = state.orders.find(x => x.orderCode === orderCode && x.accessToken === accessToken);
  if (!o) return null;
  return { state, order: o };
}
export function stockCount(state, productId) {
  return state.inventory.filter(x => x.provider === productId && x.status === "available").length;
}
export function formatRp(n) {
  return "Rp" + Number(n).toLocaleString("id-ID");
}
