import { json, getOrderByAccess, safeError } from "./lib.mjs";

export default async (event) => {
  if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });
  try {
    const code = String(event.queryStringParameters?.orderCode || "").trim();
    const token = String(event.queryStringParameters?.accessToken || "").trim();
    if (!code || !token) return json(400, { error: "Order link tidak lengkap." });
    const found = await getOrderByAccess(code, token);
    if (!found) return json(404, { error: "Pesanan tidak ditemukan." });
    const o = found.order;
    return json(200, {
      orderCode: o.orderCode, name: o.name, productName: o.productName, quantity: o.quantity,
      total: o.total, status: o.status, createdAt: o.createdAt, rejectionNote: o.rejectionNote,
      deliveredAt: o.deliveredAt || null,
      items: o.status === "delivered" ? o.soldItems : []
    });
  } catch (e) { return json(500, { error: safeError(e) }); }
};
