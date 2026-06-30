const state = {
  quantities: {},
  syncTimer: null,
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const productsEl = document.getElementById("products");
const totalEl = document.getElementById("total");
const searchEl = document.getElementById("search");
const submitBtn = document.getElementById("submitBtn");
const clearBtn = document.getElementById("clearBtn");
const toastEl = document.getElementById("toast");
const loadMyOrdersBtn = document.getElementById("loadMyOrdersBtn");
const myOrdersEl = document.getElementById("myOrders");
const randomBoxConsentEl = document.getElementById("randomBoxConsent");

const saved = JSON.parse(localStorage.getItem("heartGoodsDraft") || "{}");
document.getElementById("customerName").value = saved.customerName || "";
document.getElementById("contact").value = saved.contact || "";
document.getElementById("memo").value = saved.memo || "";
randomBoxConsentEl.checked = Boolean(saved.randomBoxConsent);
state.quantities = saved.quantities || {};

["customerName", "contact", "memo"].forEach((id) => {
  document.getElementById(id).addEventListener("input", () => {
    saveDraft();
    restartOrderSync(false);
  });
});

randomBoxConsentEl.addEventListener("change", saveDraft);
loadMyOrdersBtn.addEventListener("click", () => restartOrderSync(true));

function saveDraft() {
  localStorage.setItem("heartGoodsDraft", JSON.stringify({
    customerName: document.getElementById("customerName").value.trim(),
    contact: document.getElementById("contact").value.trim(),
    memo: document.getElementById("memo").value.trim(),
    randomBoxConsent: randomBoxConsentEl.checked,
    quantities: state.quantities,
  }));
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 3000);
}

function getFilteredProducts() {
  const keyword = searchEl.value.trim().toLowerCase();
  return window.PRODUCTS
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .filter((p) => {
      if (!keyword) return true;
      return `${p.id} ${p.name} ${p.description}`.toLowerCase().includes(keyword);
    });
}

function render() {
  productsEl.innerHTML = "";
  for (const product of getFilteredProducts()) {
    const qty = Number(state.quantities[product.id] || 0);

    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-image-wrap">
        <img class="product-image" src="${product.image}" alt="${escapeHtml(product.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();" />
      </div>
      <div class="product-info">
        <div class="product-title-row">
          <h2>${escapeHtml(product.name)}</h2>
          <strong>${yen.format(product.price)}</strong>
        </div>
        <p>${escapeHtml(product.description || "　")}</p>
        <div class="qty-row">
          <button type="button" class="qty-btn" data-id="${product.id}" data-step="-1">−</button>
          <input class="qty-input" inputmode="numeric" pattern="[0-9]*" value="${qty}" data-id="${product.id}" />
          <button type="button" class="qty-btn" data-id="${product.id}" data-step="1">＋</button>
          <span class="line-total">${qty > 0 ? yen.format(qty * product.price) : ""}</span>
        </div>
      </div>
    `;
    productsEl.appendChild(card);
  }
  updateTotal();
}

function updateTotal() {
  let total = 0;
  for (const product of window.PRODUCTS) {
    total += Number(state.quantities[product.id] || 0) * product.price;
  }
  totalEl.textContent = yen.format(total);
  saveDraft();
}

productsEl.addEventListener("click", (event) => {
  const btn = event.target.closest(".qty-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  const step = Number(btn.dataset.step);
  const current = Number(state.quantities[id] || 0);
  state.quantities[id] = Math.max(0, current + step);
  render();
});

productsEl.addEventListener("input", (event) => {
  const input = event.target.closest(".qty-input");
  if (!input) return;
  const id = input.dataset.id;
  const value = Math.max(0, parseInt(input.value || "0", 10) || 0);
  state.quantities[id] = value;
  updateTotal();
});

searchEl.addEventListener("input", render);

clearBtn.addEventListener("click", () => {
  if (!confirm("确定清空所有商品数量吗？")) return;
  state.quantities = {};
  render();
});

submitBtn.addEventListener("click", async () => {
  const customerName = document.getElementById("customerName").value.trim();
  const contact = document.getElementById("contact").value.trim();
  const memo = document.getElementById("memo").value.trim();
  const randomBoxConsent = randomBoxConsentEl.checked;

  if (!customerName) {
    showToast("请先填写下单人。");
    return;
  }
  if (!contact) {
    showToast("请先填写微信号。");
    return;
  }

  const items = window.PRODUCTS
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      description: p.description,
      image: p.image,
      quantity: Number(state.quantities[p.id] || 0),
      status: "未购买",
    }))
    .filter((item) => item.quantity > 0);

  if (!items.length) {
    showToast("请至少选择一个商品。");
    return;
  }

  if (hasBlindBox(items) && !randomBoxConsent) {
    showToast("购买盲盒商品前，请先勾选“盲盒商品随机发货”。");
    return;
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  submitBtn.disabled = true;
  submitBtn.textContent = "提交中...";

  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerName, contact, memo, items, total, randomBoxConsent }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "提交失败");

    localStorage.removeItem("heartGoodsDraft");
    state.quantities = {};
    document.getElementById("memo").value = "";
    randomBoxConsentEl.checked = false;
    render();

    showToast(`提交成功！订单号：${data.order.id.slice(0, 8)}`);
    restartOrderSync(true);
  } catch (error) {
    showToast(error.message || "提交失败，请稍后重试。");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "提交订单";
  }
});

function hasBlindBox(items) {
  return items.some((item) => item.id === "HEART028" || String(item.name || "").includes("盲盒"));
}

async function restartOrderSync(showEmptyMessage) {
  if (state.syncTimer) clearInterval(state.syncTimer);

  const customerName = document.getElementById("customerName").value.trim();
  const contact = document.getElementById("contact").value.trim();

  if (!customerName || !contact) {
    if (showEmptyMessage) {
      myOrdersEl.innerHTML = `<p class="empty compact">请先填写下单人和微信号。</p>`;
    }
    return;
  }

  await loadMyOrders(showEmptyMessage);
  state.syncTimer = setInterval(() => loadMyOrders(false), 8000);
}

async function loadMyOrders(showEmptyMessage = true) {
  const customerName = document.getElementById("customerName").value.trim();
  const contact = document.getElementById("contact").value.trim();

  if (!customerName || !contact) {
    if (showEmptyMessage) {
      myOrdersEl.innerHTML = `<p class="empty compact">请先填写下单人和微信号。</p>`;
    }
    return;
  }

  try {
    const params = new URLSearchParams({ customerName, contact });
    const res = await fetch(`/api/orders?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "无法读取订单。");

    renderMyOrders(data.orders || []);
  } catch (error) {
    if (showEmptyMessage) showToast(error.message || "无法读取订单。");
  }
}

function renderMyOrders(orders) {
  if (!orders.length) {
    myOrdersEl.innerHTML = `<p class="empty compact">暂时没有查询到订单。提交后这里会显示状态。</p>`;
    return;
  }

  myOrdersEl.innerHTML = "";
  for (const order of orders) {
    const created = new Date(order.created_at).toLocaleString("zh-CN", { hour12: false });
    const boughtTotal = (order.items || [])
      .filter((item) => item.status === "已购买")
      .reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);

    const card = document.createElement("article");
    card.className = "my-order-card";
    const itemsHtml = (order.items || []).map((item) => `
      <div class="my-order-item">
        <div class="my-order-image-wrap">
          ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" onerror="this.parentElement.classList.add('no-image'); this.remove();" />` : "图"}
        </div>
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <p>${yen.format(item.price)} × ${item.quantity}</p>
        </div>
        <span class="status status-${statusClass(item.status)}">${escapeHtml(item.status || "未购买")}</span>
      </div>
    `).join("");

    card.innerHTML = `
      <div class="my-order-head">
        <div>
          <h3>订单 ${order.id.slice(0, 8)}</h3>
          <p>${created}</p>
        </div>
        <div class="my-order-money">
          <strong>${yen.format(order.total)}</strong>
          <span>已购买 ${yen.format(boughtTotal)}</span>
        </div>
      </div>
      ${order.memo ? `<p class="my-order-memo">备注：${escapeHtml(order.memo)}</p>` : ""}
      <div class="my-order-items">${itemsHtml}</div>
    `;
    myOrdersEl.appendChild(card);
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

render();
restartOrderSync(false);
