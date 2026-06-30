const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function supabaseHeaders(extra = {}) {
  return {
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase 环境变量没有设置。");
  }
}

function assertAdmin(req) {
  if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) {
    const err = new Error("管理员密码不正确。");
    err.statusCode = 401;
    throw err;
  }
}

module.exports = async function handler(req, res) {
  try {
    assertEnv();

    if (req.method === "GET") {
      assertAdmin(req);
      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*&order=created_at.desc`, {
        headers: supabaseHeaders(),
      });
      const orders = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(orders));
      return json(res, 200, { orders });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const customerName = String(body.customerName || "").trim();
      const contact = String(body.contact || "").trim();
      const memo = String(body.memo || "").trim();
      const items = Array.isArray(body.items) ? body.items : [];
      const total = Number(body.total || 0);

      if (!customerName) return json(res, 400, { error: "请填写下单人。" });
      if (!contact) return json(res, 400, { error: "请填写联系方式。" });
      if (!items.length) return json(res, 400, { error: "订单不能为空。" });
      if (!Number.isFinite(total) || total <= 0) return json(res, 400, { error: "订单金额异常。" });

      const cleanedItems = items.map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        price: Number(item.price || 0),
        description: String(item.description || ""),
        quantity: Math.max(0, Number(item.quantity || 0)),
        status: "未购买",
      })).filter((item) => item.id && item.name && item.price > 0 && item.quantity > 0);

      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: "POST",
        headers: supabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({
          customer_name: customerName,
          contact,
          memo,
          items: cleanedItems,
          total,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));
      return json(res, 200, { order: data[0] });
    }

    if (req.method === "PATCH") {
      assertAdmin(req);
      const body = await readBody(req);
      const id = String(body.id || "");
      const items = Array.isArray(body.items) ? body.items : null;
      if (!id || !items) return json(res, 400, { error: "更新参数不完整。" });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: supabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({ items }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(JSON.stringify(data));
      return json(res, 200, { order: data[0] });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "服务器错误。" });
  }
};
