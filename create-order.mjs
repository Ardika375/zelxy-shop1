import { PRODUCTS, json, body, withStateLock, stockCount, randomToken, safeError, formatRp } from "./lib.mjs";

export default async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    const b = body(event);
    const productId = String(b.productId || "");
    const product = PRODUCTS[productId];
    const quantity = Number(b.quantity);
    const name = String(b.name || "").trim().slice(0, 100);
    const contact = String(b.contact || "").trim().slice(0, 180);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || !name || !contact) {
      return json(400, { error: "Data pesanan tidak valid." });
    }
    const result = await withStateLock(async state => {
      if (stockCount(state, productId) < quantity) throw new Error("INSUFFICIENT_STOCK");
      const orderCode = `ZLX-${Date.now().toString(36).toUpperCase()}-${randomToken(3).toUpperCase()}`;
      const accessToken = randomToken(32);
      const order = {
        id: randomToken(16), orderCode, accessToken, name, contact, productId,
        productName: product.name, quantity, unitPrice: product.price, total: product.price * quantity,
        status: "pending_payment", proofKey: null, createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(), rejectionNote: null, soldItems: []
      };
      state.orders.push(order);
      return { orderCode, accessToken, total: order.total, productName: order.productName, quantity };
    });
    return json(201, result);
  } catch (e) {
    if (e.message === "INSUFFICIENT_STOCK") return json(409, { error: "Stok tidak mencukupi. Hubungi admin." });
    if (e.message === "STORE_BUSY") return json(503, { error: "Toko sedang memproses pesanan lain. Coba lagi." });
    return json(500, { error: safeError(e) });
  }
};
