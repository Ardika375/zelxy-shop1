import { json, body, withStateLock, isAdminId, telegram, safeError } from "./lib.mjs";

export default async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected || event.headers["x-telegram-bot-api-secret-token"] !== expected) return json(401, { error: "Unauthorized" });
  const update = body(event);
  const q = update.callback_query;
  if (!q) return json(200, { ok: true });
  if (!isAdminId(q.from?.id)) {
    await telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Tidak diizinkan.", show_alert: true });
    return json(200, { ok: true });
  }
  try {
    const [action, id] = String(q.data || "").split(":");
    if (!["approve", "reject"].includes(action) || !/^[a-f0-9]{32}$/i.test(id || "")) {
      await telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Aksi tidak valid." });
      return json(200, { ok: true });
    }
    const result = await withStateLock(async state => {
      const o = state.orders.find(x => x.id === id);
      if (!o) throw new Error("ORDER_NOT_FOUND");
      if (o.status !== "awaiting_review") throw new Error("ORDER_NOT_REVIEWABLE");
      if (action === "reject") {
        o.status = "rejected";
        o.rejectionNote = "Pembayaran ditolak admin. Hubungi support jika ada kekeliruan.";
        o.updatedAt = new Date().toISOString();
        return { action, order: { ...o } };
      }
      const available = state.inventory.filter(x => x.provider === o.productId && x.status === "available");
      if (available.length < o.quantity) throw new Error("INSUFFICIENT_STOCK");
      const items = available.slice(0, o.quantity);
      for (const item of items) {
        item.status = "sold";
        item.orderCode = o.orderCode;
        item.soldAt = new Date().toISOString();
      }
      o.soldItems = items.map(x => ({ provider: x.provider, proxyData: x.proxyData }));
      o.status = "delivered";
      o.approvedAt = new Date().toISOString();
      o.deliveredAt = new Date().toISOString();
      o.updatedAt = new Date().toISOString();
      return { action, order: { ...o } };
    });
    if (result.action === "reject") {
      await telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Pesanan ditolak." });
      await telegram("sendMessage", { chat_id: String(q.from.id), text: `❌ Order ${result.order.orderCode} ditolak. Hubungi pelanggan melalui kontak yang tercantum bila perlu.` });
    } else {
      await telegram("answerCallbackQuery", { callback_query_id: q.id, text: "Disetujui. Stok sudah dialokasikan." });
      await telegram("sendMessage", { chat_id: String(q.from.id), text: `✅ Order ${result.order.orderCode} disetujui. ${result.order.quantity} item dialokasikan dan tersedia pada tautan status privat pelanggan.` });
    }
    return json(200, { ok: true });
  } catch (e) {
    const message = e.message === "INSUFFICIENT_STOCK" ? "Stok kurang. Pesanan tidak dikirim." :
      e.message === "ORDER_NOT_REVIEWABLE" ? "Order sudah diproses atau statusnya berubah." :
      "Aksi gagal. Periksa Netlify Function logs.";
    try { await telegram("answerCallbackQuery", { callback_query_id: q.id, text: message, show_alert: true }); } catch {}
    console.error(e);
    return json(200, { ok: true });
  }
};
