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

function isAdmin(req) {
  return Boolean(ADMIN_TOKEN && req.headers["x-admin-token"] === ADMIN_TOKEN);
}

function assertAdmin(req) {
  if (!isAdmin(req)) {
    const err = new Error("管理员密码不正确。");
    err.statusCode = 401;
    throw err;
  }
}

function supabaseQuery(paramsObj) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(paramsObj)) {
    params.set(key, value);
  }
  return params.toString();
}

module.exports = async function handler(req, res) {
  try {
    assertEnv();

    if (req.method === "GET") {
      if (isAdmin(req)) {
        const query = supabaseQuery({ select: "*", order: "created_at.desc" });
        const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?${query}`, {
          headers: supabaseHeaders(),
        });
        const orders = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(orders));
        return json(res, 200, { orders });
      }

      const url = new URL(req.url, `https://${req.headers.host}`);
      const customerName = String(url.searchParams.get("customerName") || "").trim();
      const contact = String(url.searchParams.get("contact") || "").trim();

      if (!customerName || !contact) {
        return json(res, 400, { error: "查询订单需要填写下单人和微信号。" });
      }

      const query = supabaseQuery({
        select: "*",
        customer_name: `eq.${customerName}`,
        contact: `eq.${contact}`,
        order: "created_at.desc",
      });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?${query}`, {
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
      const randomBoxConsent = Boolean(body.randomBoxConsent);

      if (!customerName) return json(res, 400, { error: "请填写下单人。" });
      if (!contact) return json(res, 400, { error: "请填写微信号。" });
      if (!items.length) return json(res, 400, { error: "订单不能为空。" });
      if (!Number.isFinite(total) || total <= 0) return json(res, 400, { error: "订单金额异常。" });

      const cleanedItems = items.map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || ""),
        price: Number(item.price || 0),
        description: String(item.description || ""),
        image: String(item.image || ""),
        quantity: Math.max(0, Number(item.quantity || 0)),
        status: "未购买",
      })).filter((item) => item.id && item.name && item.price > 0 && item.quantity > 0);

      const hasBlindBox = cleanedItems.some((item) => item.id === "HEART028" || String(item.name || "").includes("盲盒"));
      if (hasBlindBox && !randomBoxConsent) {
        return json(res, 400, { error: "购买盲盒商品前，请先勾选“盲盒商品随机发货”。" });
      }

      const finalMemo = hasBlindBox
        ? [memo, "已确认：盲盒商品随机发货"].filter(Boolean).join("\n")
        : memo;

      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: "POST",
        headers: supabaseHeaders({ "Prefer": "return=representation" }),
        body: JSON.stringify({
          customer_name: customerName,
          contact,
          memo: finalMemo,
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

    if (req.method === "DELETE") {
      assertAdmin(req);
      const url = new URL(req.url, `https://${req.headers.host}`);
      const id = String(url.searchParams.get("id") || "");
      if (!id) return json(res, 400, { error: "缺少订单 ID。" });

      const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: supabaseHeaders(),
      });

      if (!response.ok) {
        const data = await response.text();
        throw new Error(data || "删除失败");
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 405, { error: "Method not allowed" });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.message || "服务器错误。" });
  }
};
