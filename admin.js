let adminToken = localStorage.getItem("heartGoodsAdminToken") || "";
let orders = [];

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const loginBox = document.getElementById("loginBox");
const adminPanel = document.getElementById("adminPanel");
const tokenInput = document.getElementById("adminToken");
const loginBtn = document.getElementById("loginBtn");
const refreshBtn = document.getElementById("refreshBtn");
const searchInput = document.getElementById("adminSearch");
const ordersEl = document.getElementById("orders");
const toastEl = document.getElementById("toast");

tokenInput.value = adminToken;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 3000);
}

loginBtn.addEventListener("click", async () => {
  adminToken = tokenInput.value.trim();
  if (!adminToken) return showToast("请输入管理员密码。");
  localStorage.setItem("heartGoodsAdminToken", adminToken);
  await loadOrders();
});

refreshBtn.addEventListener("click", loadOrders);
searchInput.addEventListener("input", renderOrders);

async function loadOrders() {
  try {
    const res = await fetch("/api/orders", {
      headers: { "x-admin-token": adminToken },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "无法读取订单");

    orders = data.orders || [];
    loginBox.hidden = true;
    adminPanel.hidden = false;
    renderOrders();
  } catch (error) {
    showToast(error.message || "无法读取订单");
    loginBox.hidden = false;
    adminPanel.hidden = true;
  }
}

function renderOrders() {
  const keyword = searchInput.value.trim().toLowerCase();
  const filtered = orders.filter((order) => {
    const text = `${order.customer_name} ${order.contact} ${order.memo || ""} ${JSON.stringify(order.items)}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });

  if (!filtered.length) {
    ordersEl.innerHTML = `<p class="empty">还没有订单。</p>`;
    return;
  }

  ordersEl.innerHTML = "";
  for (const order of filtered) {
    const card = document.createElement("article");
    card.className = "order-card";

    const created = new Date(order.created_at).toLocaleString("zh-CN", { hour12: false });
    const itemsHtml = order.items.map((item, index) => `
      <div class="admin-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${escapeHtml(item.description || "")}</p>
          <p>${yen.format(item.price)} × ${item.quantity} = ${yen.format(item.price * item.quantity)}</p>
        </div>
        <div class="status-actions">
          <span class="status status-${statusClass(item.status)}">${escapeHtml(item.status || "未购买")}</span>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="已购买">已购买</button>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="缺货">缺货</button>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="未购买">恢复</button>
        </div>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="order-head">
        <div>
          <h2>${escapeHtml(order.customer_name)}</h2>
          <p>联系方式：${escapeHtml(order.contact)}</p>
          <p>提交时间：${created}</p>
          ${order.memo ? `<p>备注：${escapeHtml(order.memo)}</p>` : ""}
        </div>
        <strong>${yen.format(order.total)}</strong>
      </div>
      <div class="admin-items">${itemsHtml}</div>
    `;
    ordersEl.appendChild(card);
  }
}

ordersEl.addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-order]");
  if (!btn) return;

  const order = orders.find((o) => o.id === btn.dataset.order);
  if (!order) return;

  const index = Number(btn.dataset.index);
  const status = btn.dataset.status;
  order.items[index].status = status;

  try {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify({ id: order.id, items: order.items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "更新失败");
    order.items = data.order.items;
    renderOrders();
  } catch (error) {
    showToast(error.message || "更新失败");
    await loadOrders();
  }
});

function statusClass(status) {
  if (status === "已购买") return "done";
  if (status === "缺货") return "missing";
  return "pending";
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (adminToken) {
  loadOrders();
}
