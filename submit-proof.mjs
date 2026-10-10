import { store, json, body, withStateLock, safeError, telegram, formatRp } from "./lib.mjs";

export default async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const b = body(event);
    const orderCode = String(b.orderCode || "").trim();
    const accessToken = String(b.accessToken || "").trim();
    const mime = String(b.mime || "");
    const base64 = String(b.imageBase64 || "");
    if (!orderCode || !accessToken || !["image/png", "image/jpeg", "image/webp"].includes(mime) || !base64) {
      return json(400, { error: "Data bukti pembayaran tidak valid." });
    }
    const bytes = Buffer.from(base64, "base64");
    if (!bytes.length || bytes.length > 3_500_000) return json(413, { error: "Ukuran gambar maksimal 3,5 MB." });
    const order = await withStateLock(async state => {
      const o = state.orders.find(x => x.orderCode === orderCode && x.accessToken === accessToken);
      if (!o) throw new Error("ORDER_NOT_FOUND");
      if (!["pending_payment", "awaiting_review"].includes(o.status)) throw new Error("ORDER_STATUS_LOCKED");
      const key = `proofs/${o.id}/${Date.now()}`;
      await store().set(key, bytes, { metadata: { mime, orderCode } });
      o.proofKey = key;
      o.status = "awaiting_review";
      o.updatedAt = new Date().toISOString();
      return { ...o };
    });
    const admins = (process.env.TELEGRAM_ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!admins.length) throw new Error("TELEGRAM_ADMIN_IDS belum diatur.");
    const text = [
      "🧾 ZelXy Shop — Verifikasi Pembayaran",
      `Order: ${order.orderCode}`,
      `Nama: ${order.name}`,
      `Kontak: ${order.contact}`,
      `Produk: ${order.productName} × ${order.quantity}`,
      `Total: ${formatRp(order.total)}`,
      "",
      "Periksa transaksi asli di aplikasi merchant QRIS sebelum menyetujui. Screenshot saja bukan bukti final."
    ].join("\n");
    for (const chat_id of admins) {
      await telegram("sendMessage", {
        chat_id, text,
        reply_markup: { inline_keyboard: [[
          { text: "✅ Approve & kirim stok", callback_data: `approve:${order.id}` },
          { text: "❌ Tolak", callback_data: `reject:${order.id}` }
        ]] }
      });
    }
    return json(200, { ok: true, status: "awaiting_review" });
  } catch (e) {
    if (e.message === "ORDER_NOT_FOUND") return json(404, { error: "Pesanan tidak ditemukan." });
    if (e.message === "ORDER_STATUS_LOCKED") return json(409, { error: "Status pesanan tidak menerima bukti baru." });
    return json(500, { error: safeError(e) });
  }
};
