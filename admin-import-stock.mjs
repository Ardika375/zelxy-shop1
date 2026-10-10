import { json, body, requireAdmin, withStateLock, safeError } from "./lib.mjs";

const PROVIDERS = new Set(["impulse", "nodemaven", "9proxy", "meshproxy"]);
export default async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });
  try {
    if (!requireAdmin(event)) return json(401, { error: "Admin API key salah." });
    const b = body(event);
    const provider = String(b.provider || "");
    const text = String(b.text || "");
    if (!PROVIDERS.has(provider) || !text.trim()) return json(400, { error: "Provider atau file kosong." });
    if (Buffer.byteLength(text, "utf8") > 1_500_000) return json(413, { error: "File terlalu besar; pecah menjadi beberapa file." });
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const records = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && /^(proxy|proxy_data|host|ip|server)(,|$)/i.test(line)) continue;
      let value = line;
      if (line.includes(",")) {
        const cells = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        value = /^(proxy|proxy_data)$/i.test(cells[0]) ? cells[1] : cells[0];
      }
      value = String(value || "").replace(/^["']|["']$/g, "").trim();
      if (value && value.length <= 2000) records.push(value);
    }
    if (!records.length) return json(400, { error: "Tidak ada baris stok valid." });
    const result = await withStateLock(async state => {
      let inserted = 0, duplicates = 0;
      const existing = new Set(state.inventory.map(x => `${x.provider}\u0000${x.proxyData}`));
      for (const proxyData of records) {
        const key = `${provider}\u0000${proxyData}`;
        if (existing.has(key)) { duplicates++; continue; }
        state.inventory.push({
          id: state.nextInventoryId++, provider, proxyData, status: "available",
          orderCode: null, importedAt: new Date().toISOString(), soldAt: null
        });
        existing.add(key); inserted++;
      }
      if (state.inventory.length > 2000) throw new Error("INVENTORY_LIMIT: maksimum 2.000 item; arsipkan data lama atau gunakan database.");
      return { received: records.length, inserted, duplicates, stock: state.inventory.filter(x => x.provider === provider && x.status === "available").length };
    });
    return json(200, { ok: true, ...result });
  } catch (e) {
    if (e.message === "INVENTORY_LIMIT") return json(413, { error: "Batas demo produksi: 2.000 item stok di Netlify Blobs. Untuk katalog besar gunakan database transaksional." });
    if (e.message === "STORE_BUSY") return json(503, { error: "Toko sedang memproses perubahan. Coba lagi." });
    return json(500, { error: safeError(e) });
  }
};
