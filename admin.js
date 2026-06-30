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

function groupOrders(list) {
  const map = new Map();
  for (const order of list) {
    const key = `${order.customer_name || "未填写"}__${order.contact || ""}`;
    if (!map.has(key)) {
      map.set(key, {
        customer_name: order.customer_name || "未填写",
        contact: order.contact || "",
        orders: [],
        total: 0,
        itemCount: 0,
      });
    }
    const group = map.get(key);
    group.orders.push(order);
    group.total += Number(order.total || 0);
    group.itemCount += (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }
  return Array.from(map.values());
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

  const groups = groupOrders(filtered);
  ordersEl.innerHTML = "";

  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "person-group";
    details.open = true;

    const orderWord = group.orders.length > 1 ? `${group.orders.length} 张订单` : "1 张订单";
    details.innerHTML = `
      <summary class="person-summary">
        <div>
          <h2>${escapeHtml(group.customer_name)}</h2>
          <p>${escapeHtml(group.contact || "无联系方式")} · ${orderWord} · ${group.itemCount} 件商品</p>
        </div>
        <strong>${yen.format(group.total)}</strong>
      </summary>
      <div class="person-orders"></div>
    `;

    const container = details.querySelector(".person-orders");
    for (const order of group.orders) {
      container.appendChild(renderOrderCard(order));
    }

    ordersEl.appendChild(details);
  }
}

function renderOrderCard(order) {
  const card = document.createElement("article");
  card.className = "order-card";

  const created = new Date(order.created_at).toLocaleString("zh-CN", { hour12: false });
  const itemsHtml = (order.items || []).map((item, index) => {
    const imageHtml = item.image
      ? `<img class="admin-product-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();" />`
      : `<div class="admin-product-image-placeholder">图</div>`;

    return `
      <div class="admin-item">
        <div class="admin-item-main">
          <div class="admin-product-image-wrap">${imageHtml}</div>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <p>${escapeHtml(item.description || "")}</p>
            <p>${yen.format(item.price)} × ${item.quantity} = ${yen.format(item.price * item.quantity)}</p>
          </div>
        </div>
        <div class="status-actions">
          <span class="status status-${statusClass(item.status)}">${escapeHtml(item.status || "未购买")}</span>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="已购买">已购买</button>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="缺货">缺货</button>
          <button type="button" data-order="${order.id}" data-index="${index}" data-status="未购买">恢复</button>
        </div>
      </div>
    `;
  }).join("");

  card.innerHTML = `
    <div class="order-head">
      <div>
        <h3>订单 ${order.id.slice(0, 8)}</h3>
        <p>提交时间：${created}</p>
        ${order.memo ? `<p>备注：${escapeHtml(order.memo)}</p>` : ""}
      </div>
      <div class="order-head-actions">
        <strong>${yen.format(order.total)}</strong>
        <button type="button" class="danger-btn" data-delete-order="${order.id}">删除订单</button>
      </div>
    </div>
    <div class="admin-items">${itemsHtml}</div>
  `;
  return card;
}

ordersEl.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest("button[data-delete-order]");
  if (deleteBtn) {
    const orderId = deleteBtn.dataset.deleteOrder;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const ok = confirm(`确定删除 ${order.customer_name} 的这张订单吗？删除后无法恢复。`);
    if (!ok) return;
    await deleteOrder(orderId);
    return;
  }

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

async function deleteOrder(orderId) {
  try {
    const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
      method: "DELETE",
      headers: { "x-admin-token": adminToken },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "删除失败");

    orders = orders.filter((order) => order.id !== orderId);
    renderOrders();
    showToast("订单已删除。");
  } catch (error) {
    showToast(error.message || "删除失败");
    await loadOrders();
  }
}

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
