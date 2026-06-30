let adminToken = localStorage.getItem("heartGoodsAdminToken") || "";
let orders = [];
let adminViewMode = localStorage.getItem("heartGoodsAdminViewMode") || "people";

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

function filterOrders() {
  const keyword = searchInput.value.trim().toLowerCase();
  return orders.filter((order) => {
    const text = `${order.customer_name} ${order.contact} ${order.memo || ""} ${JSON.stringify(order.items)}`.toLowerCase();
    return !keyword || text.includes(keyword);
  });
}

function calcOverallStats(list) {
  const allItems = list.flatMap((order) => (order.items || []).map((item) => ({ order, item })));
  const totalAmount = allItems.reduce((sum, row) => sum + Number(row.item.price || 0) * Number(row.item.quantity || 0), 0);
  const boughtAmount = allItems
    .filter((row) => row.item.status === "已购买")
    .reduce((sum, row) => sum + Number(row.item.price || 0) * Number(row.item.quantity || 0), 0);

  const totalQty = allItems.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  const boughtQty = allItems
    .filter((row) => row.item.status === "已购买")
    .reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  const missingQty = allItems
    .filter((row) => row.item.status === "缺货")
    .reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  const pendingQty = totalQty - boughtQty - missingQty;

  return {
    orderCount: list.length,
    totalAmount,
    boughtAmount,
    totalQty,
    boughtQty,
    missingQty,
    pendingQty,
  };
}

function renderStats(list) {
  const stats = calcOverallStats(list);
  return `
    <section class="admin-summary">
      <div class="summary-card">
        <span>订单数</span>
        <strong>${stats.orderCount}</strong>
      </div>
      <div class="summary-card">
        <span>总件数</span>
        <strong>${stats.totalQty}</strong>
      </div>
      <div class="summary-card">
        <span>总计金额</span>
        <strong>${yen.format(stats.totalAmount)}</strong>
      </div>
      <div class="summary-card">
        <span>已购买金额</span>
        <strong>${yen.format(stats.boughtAmount)}</strong>
      </div>
      <div class="summary-card small-summary">
        <span>未处理</span>
        <strong>${stats.pendingQty}</strong>
      </div>
      <div class="summary-card small-summary">
        <span>已购买</span>
        <strong>${stats.boughtQty}</strong>
      </div>
      <div class="summary-card small-summary">
        <span>缺货</span>
        <strong>${stats.missingQty}</strong>
      </div>
    </section>
  `;
}

function renderViewSwitch() {
  return `
    <section class="admin-view-switch">
      <button type="button" class="${adminViewMode === "people" ? "active" : ""}" data-view-mode="people">按人查看</button>
      <button type="button" class="${adminViewMode === "purchase" ? "active" : ""}" data-view-mode="purchase">采购汇总</button>
    </section>
  `;
}

function renderOrders() {
  const filtered = filterOrders();

  if (!filtered.length) {
    ordersEl.innerHTML = `
      ${renderStats(filtered)}
      ${renderViewSwitch()}
      <p class="empty">还没有订单。</p>
    `;
    return;
  }

  if (adminViewMode === "purchase") {
    renderPurchaseView(filtered);
  } else {
    renderPeopleView(filtered);
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

function renderPeopleView(list) {
  const groups = groupOrders(list);
  ordersEl.innerHTML = `${renderStats(list)}${renderViewSwitch()}`;

  for (const group of groups) {
    const details = document.createElement("details");
    details.className = "person-group";
    details.open = true;

    const orderWord = group.orders.length > 1 ? `${group.orders.length} 张订单` : "1 张订单";
    details.innerHTML = `
      <summary class="person-summary">
        <div>
          <h2>${escapeHtml(group.customer_name)}</h2>
          <p>${escapeHtml(group.contact || "无微信号")} · ${orderWord} · ${group.itemCount} 件商品</p>
        </div>
        <div class="person-summary-actions">
          <strong>${yen.format(group.total)}</strong>
          <button type="button" class="copy-notice-btn" data-copy-person="${escapeHtml(group.customer_name)}" data-copy-contact="${escapeHtml(group.contact)}">复制通知文案</button>
        </div>
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
  const itemsHtml = (order.items || []).map((item, index) => renderAdminItem(order, item, index)).join("");

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

function renderAdminItem(order, item, index) {
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
}

function buildProductGroups(list) {
  const map = new Map();

  for (const order of list) {
    (order.items || []).forEach((item, index) => {
      const key = item.id || item.name;
      if (!map.has(key)) {
        map.set(key, {
          key,
          id: item.id || "",
          name: item.name || "未命名商品",
          description: item.description || "",
          image: item.image || "",
          price: Number(item.price || 0),
          rows: [],
          totalQty: 0,
          pendingQty: 0,
          boughtQty: 0,
          missingQty: 0,
          subtotal: 0,
        });
      }

      const group = map.get(key);
      const qty = Number(item.quantity || 0);
      group.rows.push({ order, item, index });
      group.totalQty += qty;
      group.subtotal += Number(item.price || 0) * qty;

      if (item.status === "已购买") group.boughtQty += qty;
      else if (item.status === "缺货") group.missingQty += qty;
      else group.pendingQty += qty;
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    const pendingDiff = b.pendingQty - a.pendingQty;
    if (pendingDiff !== 0) return pendingDiff;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

function renderPurchaseView(list) {
  const productGroups = buildProductGroups(list);
  ordersEl.innerHTML = `
    ${renderStats(list)}
    ${renderViewSwitch()}
    <section class="purchase-help">
      <h2>采购汇总</h2>
      <p>这里按商品汇总所有人的需求。你可以先按这个页面采购，也可以直接在这里把某个商品批量标记为已购买/缺货。</p>
    </section>
  `;

  for (const product of productGroups) {
    const details = document.createElement("details");
    details.className = "purchase-group";
    details.open = false;

    const imageHtml = product.image
      ? `<img class="purchase-product-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();" />`
      : `<div class="purchase-product-image-placeholder">图</div>`;

    details.innerHTML = `
      <summary class="purchase-summary">
        <div class="purchase-product-main">
          <div class="purchase-product-image-wrap">${imageHtml}</div>
          <div>
            <h2>${escapeHtml(product.name)}</h2>
            <p>${escapeHtml(product.description || "")}</p>
            <p>${yen.format(product.price)} / 个</p>
          </div>
        </div>
        <div class="purchase-qty-box">
          <strong>${product.totalQty} 件</strong>
          <span>未处理 ${product.pendingQty} / 已购 ${product.boughtQty} / 缺货 ${product.missingQty}</span>
          <span>${yen.format(product.subtotal)}</span>
        </div>
      </summary>
      <div class="purchase-actions">
        <button type="button" data-bulk-product="${escapeHtml(product.key)}" data-bulk-status="已购买">该商品全部已购买</button>
        <button type="button" data-bulk-product="${escapeHtml(product.key)}" data-bulk-status="缺货">该商品全部缺货</button>
        <button type="button" data-bulk-product="${escapeHtml(product.key)}" data-bulk-status="未购买">恢复未购买</button>
      </div>
      <div class="purchase-buyers"></div>
    `;

    const buyers = details.querySelector(".purchase-buyers");
    for (const row of product.rows) {
      buyers.appendChild(renderPurchaseBuyerRow(row));
    }

    ordersEl.appendChild(details);
  }
}

function renderPurchaseBuyerRow(row) {
  const div = document.createElement("div");
  div.className = "purchase-buyer-row";
  div.innerHTML = `
    <div>
      <strong>${escapeHtml(row.order.customer_name || "未填写")}</strong>
      <p>${escapeHtml(row.order.contact || "无微信号")} · ${yen.format(row.item.price)} × ${row.item.quantity}</p>
    </div>
    <div class="purchase-buyer-actions">
      <span class="status status-${statusClass(row.item.status)}">${escapeHtml(row.item.status || "未购买")}</span>
      <button type="button" data-order="${row.order.id}" data-index="${row.index}" data-status="已购买">已购买</button>
      <button type="button" data-order="${row.order.id}" data-index="${row.index}" data-status="缺货">缺货</button>
      <button type="button" data-order="${row.order.id}" data-index="${row.index}" data-status="未购买">恢复</button>
    </div>
  `;
  return div;
}

ordersEl.addEventListener("click", async (event) => {
  const viewBtn = event.target.closest("button[data-view-mode]");
  if (viewBtn) {
    adminViewMode = viewBtn.dataset.viewMode;
    localStorage.setItem("heartGoodsAdminViewMode", adminViewMode);
    renderOrders();
    return;
  }

  const bulkBtn = event.target.closest("button[data-bulk-product]");
  if (bulkBtn) {
    const productKey = bulkBtn.dataset.bulkProduct;
    const status = bulkBtn.dataset.bulkStatus;
    const ok = confirm(`确定把这个商品的所有订单项标记为「${status}」吗？`);
    if (!ok) return;
    await updateProductStatus(productKey, status);
    return;
  }

  const copyBtn = event.target.closest("button[data-copy-person]");
  if (copyBtn) {
    const customerName = copyBtn.dataset.copyPerson;
    const contact = copyBtn.dataset.copyContact;
    const group = groupOrders(orders).find((g) => g.customer_name === customerName && g.contact === contact);
    if (!group) return;
    await copyNoticeText(group);
    return;
  }

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
  await updateSingleItemStatus(order, index, status);
});

async function updateSingleItemStatus(order, index, status) {
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

    const target = orders.find((o) => o.id === order.id);
    if (target) target.items = data.order.items;
    renderOrders();
  } catch (error) {
    showToast(error.message || "更新失败");
    await loadOrders();
  }
}

async function updateProductStatus(productKey, status) {
  const affected = [];

  for (const order of orders) {
    let changed = false;
    const nextItems = (order.items || []).map((item) => {
      const key = item.id || item.name;
      if (key === productKey) {
        changed = true;
        return { ...item, status };
      }
      return item;
    });

    if (changed) {
      affected.push({ order, items: nextItems });
    }
  }

  try {
    for (const row of affected) {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-token": adminToken,
        },
        body: JSON.stringify({ id: row.order.id, items: row.items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批量更新失败");

      const target = orders.find((o) => o.id === row.order.id);
      if (target) target.items = data.order.items;
    }

    renderOrders();
    showToast("批量状态已更新。");
  } catch (error) {
    showToast(error.message || "批量更新失败");
    await loadOrders();
  }
}

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

function buildNoticeText(group) {
  const allItems = [];
  for (const order of group.orders) {
    for (const item of order.items || []) {
      allItems.push(item);
    }
  }

  const bought = allItems.filter((item) => item.status === "已购买");
  const missing = allItems.filter((item) => item.status === "缺货");
  const pending = allItems.filter((item) => !item.status || item.status === "未购买");

  const boughtTotal = bought.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
  const orderedTotal = allItems.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

  const lines = [];
  lines.push(`${group.customer_name}，goods 代购结果如下：`);
  lines.push("");

  if (bought.length) {
    lines.push("【已购买】");
    for (const item of bought) {
      lines.push(`・${item.name} × ${item.quantity}　${yen.format(Number(item.price || 0) * Number(item.quantity || 0))}`);
    }
    lines.push("");
  }

  if (missing.length) {
    lines.push("【缺货 / 未买到】");
    for (const item of missing) {
      lines.push(`・${item.name} × ${item.quantity}`);
    }
    lines.push("");
  }

  if (pending.length) {
    lines.push("【还未处理】");
    for (const item of pending) {
      lines.push(`・${item.name} × ${item.quantity}`);
    }
    lines.push("");
  }

  lines.push(`已购买金额：${yen.format(boughtTotal)}`);
  lines.push(`原订单金额：${yen.format(orderedTotal)}`);
  lines.push("");
  lines.push("最终金额以实际买到的商品为准～");

  return lines.join("\n");
}

async function copyNoticeText(group) {
  const text = buildNoticeText(group);

  try {
    await navigator.clipboard.writeText(text);
    showToast("通知文案已复制，可以直接粘贴到 LINE / 微信。");
  } catch (error) {
    window.prompt("复制失败，请手动复制：", text);
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
