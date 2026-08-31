const config = window.PRINT_SHOP_CONFIG || {};
const cloudUrl = String(config.SUPABASE_URL || "").trim();
const cloudKey = String(config.SUPABASE_PUBLISHABLE_KEY || "").trim();
const cloudReady = cloudUrl.startsWith("https://") && cloudKey.length > 20 && Boolean(window.supabase);
const database = cloudReady
  ? window.supabase.createClient(cloudUrl, cloudKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const statusLabels = { "en-proceso": "En proceso", listo: "Listo", entregado: "Entregado" };
const state = { orders: [], session: null };
const $ = (selector) => document.querySelector(selector);
const form = $("#orderForm");
const loginForm = $("#loginForm");
const deliveryDate = $("#deliveryDate");
const incomeMonth = $("#incomeMonth");
let toastTimer;

const formatMoney = (value) => money.format(Number(value) || 0);
const orderCode = (number) => number ? `O-${String(number).padStart(4, "0")}` : "Pedido nuevo";

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, Number(day))).replace(".", "");
}

function escapeHTML(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function setDates() {
  const now = new Date();
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  deliveryDate.value = today;
  incomeMonth.value ||= today.slice(0, 7);
}

function notify(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.background = error ? "#8c2940" : "#1d1d23";
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3900);
}

function fromDatabase(row) {
  return {
    id: row.id, number: row.number, client: row.client, phone: row.phone,
    deliveryDate: row.delivery_date, workType: row.work_type, price: Number(row.price),
    status: row.status, paymentMethod: row.payment_method, paid: row.paid,
    invoice: row.invoice, notes: row.notes || "", createdAt: row.created_at,
  };
}

function toDatabase(order) {
  return {
    client: order.client, phone: order.phone, delivery_date: order.deliveryDate,
    work_type: order.workType, price: order.price, status: order.status,
    payment_method: order.paymentMethod, paid: order.paid, invoice: order.invoice, notes: order.notes,
  };
}

function renderMetrics() {
  const inProgress = state.orders.filter((order) => order.status === "en-proceso").length;
  const ready = state.orders.filter((order) => order.status === "listo").length;
  const delivered = state.orders.filter((order) => order.status === "entregado").length;
  const pending = state.orders.filter((order) => !order.paid).reduce((sum, order) => sum + order.price, 0);
  $("#inProgressCount").textContent = inProgress;
  $("#readyCount").textContent = ready;
  $("#deliveredCount").textContent = delivered;
  $("#pendingAmount").textContent = formatMoney(pending);
}

function renderIncome() {
  const selected = incomeMonth.value;
  const forMonth = state.orders.filter((order) => order.deliveryDate?.startsWith(selected));
  const paid = forMonth.filter((order) => order.paid);
  const paidTotal = paid.reduce((sum, order) => sum + order.price, 0);
  const pending = forMonth.filter((order) => !order.paid).reduce((sum, order) => sum + order.price, 0);
  const [year, month] = selected.split("-");
  const label = selected ? new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(new Date(Number(year), Number(month) - 1, 1)) : "el mes seleccionado";
  $("#monthlyIncome").textContent = formatMoney(paidTotal);
  $("#paidOrdersCount").textContent = paid.length;
  $("#averageTicket").textContent = formatMoney(paid.length ? paidTotal / paid.length : 0);
  $("#monthlyPending").textContent = formatMoney(pending);
  $("#incomeTitle").nextElementSibling.textContent = `El resumen considera los pedidos pagados con fecha de entrega dentro de ${label}.`;
}

function filteredOrders() {
  const search = $("#searchInput").value.trim().toLocaleLowerCase("es-MX");
  const status = $("#statusFilter").value;
  return [...state.orders]
    .filter((order) => status === "all" || order.status === status)
    .filter((order) => !search || [order.client, order.phone, order.workType, order.number]
      .some((value) => String(value).toLocaleLowerCase("es-MX").includes(search)))
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
}

function statusOptions(selected) {
  return Object.entries(statusLabels).map(([value, label]) =>
    `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");
}

function renderTable() {
  const orders = filteredOrders();
  $("#orderTotalBadge").textContent = state.orders.length;
  $("#ordersTableBody").innerHTML = orders.map((order) => `
    <tr>
      <td><span class="order-number">${orderCode(order.number)}</span></td>
      <td><span class="customer-name">${escapeHTML(order.client)}</span><span class="customer-phone">${escapeHTML(order.phone)}</span></td>
      <td><span>${escapeHTML(order.workType)}</span>${order.invoice ? '<span class="cell-subtext">Factura requerida</span>' : ""}</td>
      <td>${formatDate(order.deliveryDate)}</td>
      <td class="price-cell">${formatMoney(order.price)}</td>
      <td><select class="status-select status-${order.status}" data-action="status" data-id="${order.id}" aria-label="Cambiar estado de ${escapeHTML(order.client)}">${statusOptions(order.status)}</select></td>
      <td><select class="payment-select ${order.paid ? "payment-paid" : "payment-pending"}" data-action="paid" data-id="${order.id}" aria-label="Cambiar pago de ${escapeHTML(order.client)}"><option value="false" ${!order.paid ? "selected" : ""}>Pendiente</option><option value="true" ${order.paid ? "selected" : ""}>Pagado</option></select></td>
      <td><div class="row-actions"><button class="icon-button" data-action="print" data-id="${order.id}" type="button" title="Imprimir hoja de pedido">⎙</button><button class="icon-button" data-action="edit" data-id="${order.id}" type="button" title="Editar pedido">✎</button><button class="icon-button delete" data-action="delete" data-id="${order.id}" type="button" title="Eliminar pedido">×</button></div></td>
    </tr>`).join("");
  $("#emptyState").hidden = state.orders.length !== 0;
}

function render() {
  renderMetrics();
  renderIncome();
  renderTable();
}

function resetForm() {
  form.reset();
  $("#editingId").value = "";
  $("#formTitle").textContent = "Registrar pedido";
  $("#saveIcon").textContent = "＋";
  $("#saveButtonText").textContent = "Guardar pedido";
  $("#cancelEditButton").hidden = true;
  $("#orderIdPreview").textContent = "Pedido nuevo";
  setDates();
}

function collectOrder() {
  return {
    client: $("#client").value.trim(), phone: $("#phone").value.trim(), deliveryDate: deliveryDate.value,
    workType: $("#workType").value.trim(), price: Number($("#price").value), status: $("#status").value,
    paymentMethod: $("#paymentMethod").value, paid: $("#paid").checked, invoice: $("#invoice").checked,
    notes: $("#notes").value.trim(),
  };
}

async function fetchOrders(quiet = false) {
  const { data, error } = await database.from("orders").select("*").order("created_at", { ascending: false });
  if (error) {
    if (!quiet) notify("No se pudieron cargar los pedidos. Revisa la conexión.", true);
    return;
  }
  state.orders = data.map(fromDatabase);
  render();
}

async function saveOrder(event) {
  event.preventDefault();
  const order = collectOrder();
  if (!order.client || !order.phone || !order.deliveryDate || !order.workType || Number.isNaN(order.price) || order.price < 0) {
    form.reportValidity();
    return;
  }
  const editingId = $("#editingId").value;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  $("#saveButtonText").textContent = "Guardando…";
  const query = editingId
    ? database.from("orders").update(toDatabase(order)).eq("id", editingId)
    : database.from("orders").insert(toDatabase(order));
  const { data, error } = await query.select().single();
  button.disabled = false;
  if (error) {
    $("#saveButtonText").textContent = editingId ? "Guardar cambios" : "Guardar pedido";
    notify("No fue posible guardar el pedido. Inténtalo nuevamente.", true);
    return;
  }
  const saved = fromDatabase(data);
  const index = state.orders.findIndex((item) => item.id === saved.id);
  if (index < 0) state.orders.unshift(saved); else state.orders[index] = saved;
  resetForm();
  render();
  notify(`Pedido ${orderCode(saved.number)} guardado en línea.`);
}

function editOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  $("#editingId").value = order.id;
  $("#client").value = order.client;
  $("#phone").value = order.phone;
  deliveryDate.value = order.deliveryDate;
  $("#workType").value = order.workType;
  $("#price").value = order.price;
  $("#status").value = order.status;
  $("#paymentMethod").value = order.paymentMethod;
  $("#paid").checked = order.paid;
  $("#invoice").checked = order.invoice;
  $("#notes").value = order.notes;
  $("#formTitle").textContent = `Editar ${orderCode(order.number)}`;
  $("#saveIcon").textContent = "✓";
  $("#saveButtonText").textContent = "Guardar cambios";
  $("#cancelEditButton").hidden = false;
  $("#orderIdPreview").textContent = `Pedido ${orderCode(order.number)}`;
  $("#orderFormSection").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function updateOrderField(id, field, value) {
  const update = field === "paid" ? { paid: value === "true" } : { status: value };
  const { data, error } = await database.from("orders").update(update).eq("id", id).select().single();
  if (error) {
    notify("No se pudo actualizar el pedido. Inténtalo nuevamente.", true);
    render();
    return;
  }
  const index = state.orders.findIndex((order) => order.id === id);
  if (index >= 0) state.orders[index] = fromDatabase(data);
  render();
  notify(field === "paid" ? (data.paid ? "Pedido marcado como pagado." : "Pedido marcado como pendiente de pago.") : `Estado actualizado: ${statusLabels[data.status]}.`);
}

async function deleteOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order || !window.confirm(`¿Eliminar el pedido ${orderCode(order.number)} de ${order.client}? Esta acción no se puede deshacer.`)) return;
  const { error } = await database.from("orders").delete().eq("id", id);
  if (error) { notify("No se pudo eliminar el pedido. Inténtalo nuevamente.", true); return; }
  state.orders = state.orders.filter((item) => item.id !== id);
  if ($("#editingId").value === id) resetForm();
  render();
  notify(`Pedido ${orderCode(order.number)} eliminado.`);
}

function printOrder(id) {
  const order = state.orders.find((item) => item.id === id);
  if (!order) return;
  const logoURL = new URL("logo-imprenta-print-shop.jpg", window.location.href).href;
  const printView = window.open("", "_blank", "width=800,height=900");
  if (!printView) { notify("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.", true); return; }
  printView.document.write(`<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Pedido ${orderCode(order.number)}</title><style>*{box-sizing:border-box}body{margin:0;padding:42px;color:#121217;font:15px Arial,sans-serif}.head{display:flex;justify-content:space-between;gap:20px;padding-bottom:24px;border-bottom:5px solid #111}.logo{width:185px;height:88px;object-fit:cover;object-position:49% 55%;background:#000}.code{text-align:right}.code b{display:block;font-size:27px}.code span{color:#60606a}.label{margin:28px 0 10px;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#666}.title{margin:0;font-size:24px}.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #ddd}.cell{min-height:77px;padding:16px;border-right:1px solid #ddd;border-bottom:1px solid #ddd}.cell:nth-child(2n){border-right:0}.cell:nth-last-child(-n+2){border-bottom:0}.cell span{display:block;margin-bottom:6px;color:#666;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px}.cell b{font-size:16px}.notes{min-height:100px;padding:17px;border:1px solid #ddd;white-space:pre-wrap}.status{display:inline-block;margin-top:20px;padding:9px 13px;background:#f4f000;font-weight:800}.footer{margin-top:50px;padding-top:15px;border-top:1px solid #ddd;color:#666;font-size:12px}@media print{body{padding:22px}}</style></head><body><header class="head"><img class="logo" src="${logoURL}" alt="Imprenta Print Shop"><div class="code"><b>${orderCode(order.number)}</b><span>Hoja de pedido</span></div></header><p class="label">Cliente</p><h1 class="title">${escapeHTML(order.client)}</h1><div class="grid"><div class="cell"><span>Teléfono</span><b>${escapeHTML(order.phone)}</b></div><div class="cell"><span>Fecha de entrega</span><b>${formatDate(order.deliveryDate)}</b></div><div class="cell"><span>Tipo de trabajo</span><b>${escapeHTML(order.workType)}</b></div><div class="cell"><span>Precio total</span><b>${formatMoney(order.price)}</b></div><div class="cell"><span>Estado</span><b>${statusLabels[order.status]}</b></div><div class="cell"><span>Pago</span><b>${order.paid ? "Pagado" : "Pendiente"} · ${escapeHTML(order.paymentMethod)}</b></div><div class="cell"><span>Factura</span><b>${order.invoice ? "Sí requiere factura" : "No requiere factura"}</b></div><div class="cell"><span>Registro</span><b>${orderCode(order.number)}</b></div></div><p class="label">Notas e indicaciones</p><div class="notes">${escapeHTML(order.notes || "Sin indicaciones adicionales.")}</div><div class="status">${statusLabels[order.status]}</div><p class="footer">Imprenta Print Shop · Diseño · Impresión · Calidad</p></body></html>`);
  printView.document.close();
  printView.addEventListener("load", () => setTimeout(() => printView.print(), 250));
}

function showWorkspace(session) {
  state.session = session;
  $("#loginScreen").hidden = true;
  $("#appShell").hidden = false;
  resetForm();
  fetchOrders();
}

function showLogin(message = "") {
  state.session = null;
  state.orders = [];
  $("#appShell").hidden = true;
  $("#loginScreen").hidden = false;
  $("#loginError").textContent = message;
}

async function signIn(event) {
  event.preventDefault();
  $("#loginError").textContent = "";
  const button = $("#loginButton");
  button.disabled = true;
  button.textContent = "Verificando…";
  const { data, error } = await database.auth.signInWithPassword({ email: $("#loginEmail").value.trim(), password: $("#loginPassword").value });
  button.disabled = false;
  button.textContent = "Entrar al control";
  if (error || !data.session) { $("#loginError").textContent = "No se pudo entrar. Revisa el correo y la contraseña."; return; }
  showWorkspace(data.session);
}

async function createAccess() {
  if (!loginForm.reportValidity()) return;
  $("#loginError").textContent = "";
  const button = $("#createAccessButton");
  button.disabled = true;
  button.textContent = "Creando acceso…";
  const { data, error } = await database.auth.signUp({
    email: $("#loginEmail").value.trim(),
    password: $("#loginPassword").value,
    options: { emailRedirectTo: window.location.href },
  });
  button.disabled = false;
  button.textContent = "Crear acceso inicial";
  if (error) {
    $("#loginError").textContent = error.message || "No se pudo crear el acceso. Inténtalo nuevamente.";
    return;
  }
  if (data.session) {
    showWorkspace(data.session);
    return;
  }
  $("#loginError").textContent = "Revisa tu correo y confirma el acceso. Después podrás entrar con estos mismos datos desde cualquier equipo.";
}

async function signOut() {
  const { error } = await database.auth.signOut();
  if (error) { notify("No se pudo cerrar la sesión. Inténtalo nuevamente.", true); return; }
  showLogin();
}

form.addEventListener("submit", saveOrder);
loginForm.addEventListener("submit", signIn);
$("#createAccessButton").addEventListener("click", createAccess);
$("#cancelEditButton").addEventListener("click", () => { resetForm(); notify("Edición cancelada."); });
$("#newOrderButton").addEventListener("click", () => { resetForm(); $("#orderFormSection").scrollIntoView({ behavior: "smooth", block: "start" }); $("#client").focus({ preventScroll: true }); });
$("#emptyNewOrderButton").addEventListener("click", () => $("#newOrderButton").click());
$("#signOutButton").addEventListener("click", signOut);
incomeMonth.addEventListener("change", renderIncome);
$("#searchInput").addEventListener("input", renderTable);
$("#statusFilter").addEventListener("change", renderTable);
$("#ordersTableBody").addEventListener("change", async (event) => {
  if (event.target.matches("[data-action]")) await updateOrderField(event.target.dataset.id, event.target.dataset.action, event.target.value);
});
$("#ordersTableBody").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "edit") editOrder(button.dataset.id);
  if (button.dataset.action === "delete") await deleteOrder(button.dataset.id);
  if (button.dataset.action === "print") printOrder(button.dataset.id);
});

async function initialize() {
  setDates();
  resetForm();
  if (!cloudReady) {
    $("#loginButton").disabled = true;
    $("#loginError").textContent = "Falta conectar la base de datos. Sigue el archivo ACTIVAR-BASE-DE-DATOS.md de esta carpeta.";
    return;
  }
  const { data, error } = await database.auth.getSession();
  if (error) { showLogin("No se pudo conectar al servicio. Inténtalo nuevamente."); return; }
  if (data.session) showWorkspace(data.session); else showLogin();
  database.auth.onAuthStateChange((_event, session) => { if (!session) showLogin(); });
}

initialize();
