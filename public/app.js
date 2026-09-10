const state = {
  products: [],
  allProducts: [],
  cart: JSON.parse(localStorage.getItem("ca_cart") || "[]"),
  token: localStorage.getItem("ca_token") || "",
  user: JSON.parse(localStorage.getItem("ca_user") || "null"),
  authMode: "login"
};

const $ = selector => document.querySelector(selector);
const money = value => `$${Number(value).toFixed(2)}`;

const els = {
  productGrid: $("#productGrid"),
  categorySelect: $("#categorySelect"),
  searchInput: $("#searchInput"),
  cartButton: $("#cartButton"),
  cartDrawer: $("#cartDrawer"),
  cartItems: $("#cartItems"),
  cartCount: $("#cartCount"),
  subtotalText: $("#subtotalText"),
  shippingText: $("#shippingText"),
  taxText: $("#taxText"),
  totalText: $("#totalText"),
  checkoutForm: $("#checkoutForm"),
  addressInput: $("#addressInput"),
  paymentInput: $("#paymentInput"),
  authButton: $("#authButton"),
  quickLoginButton: $("#quickLoginButton"),
  authModal: $("#authModal"),
  authForm: $("#authForm"),
  authTitle: $("#authTitle"),
  authSubtitle: $("#authSubtitle"),
  authSubmit: $("#authSubmit"),
  toggleAuth: $("#toggleAuth"),
  authPanel: document.querySelector(".auth-panel"),
  accountView: $("#accountView"),
  profileAvatar: $("#profileAvatar"),
  profileName: $("#profileName"),
  profileEmail: $("#profileEmail"),
  viewOrdersButton: $("#viewOrdersButton"),
  signOutButton: $("#signOutButton"),
  nameField: $("#nameField"),
  nameInput: $("#nameInput"),
  emailInput: $("#emailInput"),
  passwordInput: $("#passwordInput"),
  ordersList: $("#ordersList"),
  productModal: $("#productModal"),
  productDetail: $("#productDetail"),
  toast: $("#toast"),
  statProducts: $("#statProducts"),
  heroOrder: $("#heroOrder"),
  splashScreen: $("#splashScreen")
};

function persistCart() {
  localStorage.setItem("ca_cart", JSON.stringify(state.cart));
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function hideSplash() {
  if (!els.splashScreen) return;
  window.setTimeout(() => {
    els.splashScreen.classList.add("hide");
  }, 700);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "Something went wrong");
  return payload;
}

async function loadProducts() {
  const query = encodeURIComponent(els.searchInput.value.trim());
  const category = encodeURIComponent(els.categorySelect.value || "All");
  const data = await api(`/api/products?q=${query}&category=${category}`);
  state.products = data.products;
  renderProducts();
  renderCategoryOptions();
  els.statProducts.textContent = state.products.length;
}

async function loadAllProductsForCategories() {
  const data = await api("/api/products");
  state.allProducts = data.products;
  state.products = data.products;
  renderCategoryOptions();
  renderProducts();
  els.statProducts.textContent = data.products.length;
}

function renderCategoryOptions() {
  const existing = els.categorySelect.value || "All";
  const categories = ["All", ...new Set(state.allProducts.map(product => product.category))];
  els.categorySelect.innerHTML = categories.map(category => `<option ${category === existing ? "selected" : ""}>${category}</option>`).join("");
}

function productById(id) {
  return state.allProducts.find(product => product.id === id) || state.products.find(product => product.id === id);
}

function renderProducts() {
  if (!state.products.length) {
    els.productGrid.innerHTML = `<p class="empty">No products match your filters.</p>`;
    return;
  }

  els.productGrid.innerHTML = state.products.map(product => `
    <article class="product-card">
      <div class="product-image">
        <img src="${product.image}" alt="${product.name}">
        <span class="badge">${product.category}</span>
      </div>
      <div class="product-body">
        <div class="product-title">
          <div>
            <h3>${product.name}</h3>
            <span class="product-meta">${product.rating} rating</span>
          </div>
          <span class="price">${money(product.price)}</span>
        </div>
        <span class="stock">${product.stock} in stock</span>
        <div class="card-actions">
          <button class="secondary-button" type="button" data-detail="${product.id}">Details</button>
          <button class="primary-button" type="button" data-add="${product.id}">Add to cart</button>
        </div>
      </div>
    </article>
  `).join("");
}

function addToCart(id) {
  const product = productById(id);
  if (!product) return;
  const existing = state.cart.find(item => item.productId === id);
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, 10);
  } else {
    state.cart.push({ productId: id, quantity: 1 });
  }
  persistCart();
  renderCart();
  showToast(`${product.name} added to cart`);
}

function changeQuantity(id, delta) {
  const item = state.cart.find(entry => entry.productId === id);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.cart = state.cart.filter(entry => entry.productId !== id);
  persistCart();
  renderCart();
}

function cartDetails() {
  return state.cart
    .map(item => ({ ...item, product: productById(item.productId) }))
    .filter(item => item.product);
}

function totals() {
  const subtotal = cartDetails().reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shipping = subtotal === 0 || subtotal > 150 ? 0 : 12;
  const tax = subtotal * 0.08;
  return { subtotal, shipping, tax, total: subtotal + shipping + tax };
}

function renderCart() {
  const details = cartDetails();
  const itemCount = details.reduce((sum, item) => sum + item.quantity, 0);
  els.cartCount.textContent = itemCount;

  if (!details.length) {
    els.cartItems.innerHTML = `<p class="empty">Your cart is empty. Add products from the catalog to begin checkout.</p>`;
  } else {
    els.cartItems.innerHTML = details.map(item => `
      <article class="cart-line">
        <img src="${item.product.image}" alt="${item.product.name}">
        <div>
          <h3>${item.product.name}</h3>
          <span class="product-meta">${money(item.product.price)} each</span>
          <div class="qty-row">
            <div class="qty-tools">
              <button type="button" data-qty="${item.productId}" data-delta="-1">-</button>
              <strong>${item.quantity}</strong>
              <button type="button" data-qty="${item.productId}" data-delta="1">+</button>
            </div>
            <strong>${money(item.product.price * item.quantity)}</strong>
          </div>
        </div>
      </article>
    `).join("");
  }

  const total = totals();
  els.subtotalText.textContent = money(total.subtotal);
  els.shippingText.textContent = money(total.shipping);
  els.taxText.textContent = money(total.tax);
  els.totalText.textContent = money(total.total);
}

function openCart() {
  renderCart();
  els.cartDrawer.classList.add("open");
  els.cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCart() {
  els.cartDrawer.classList.remove("open");
  els.cartDrawer.setAttribute("aria-hidden", "true");
}

function openProduct(id) {
  const product = productById(id);
  if (!product) return;
  els.productDetail.innerHTML = `
    <div class="detail-grid">
      <img src="${product.image}" alt="${product.name}">
      <div class="detail-copy">
        <button class="icon-button" type="button" data-close-modal aria-label="Close product detail">x</button>
        <span class="eyebrow">${product.category}</span>
        <h2>${product.name}</h2>
        <p>${product.description}</p>
        <strong class="price">${money(product.price)}</strong>
        <ul class="feature-list">
          ${product.features.map(feature => `<li>${feature}</li>`).join("")}
        </ul>
        <button class="primary-button full" type="button" data-add="${product.id}">Add to cart</button>
      </div>
    </div>
  `;
  els.productModal.classList.add("open");
  els.productModal.setAttribute("aria-hidden", "false");
}

function closeProduct() {
  els.productModal.classList.remove("open");
  els.productModal.setAttribute("aria-hidden", "true");
}

function setAuthMode(mode) {
  state.authMode = mode;
  els.authPanel.classList.remove("signed-in");
  const register = mode === "register";
  els.authTitle.textContent = register ? "Create account" : "Sign in";
  els.authSubtitle.textContent = register
    ? "Create a private profile for smoother checkout and simple order tracking."
    : "Access your saved profile, order history, and a cleaner checkout flow.";
  els.authSubmit.textContent = register ? "Create account" : "Sign in";
  els.toggleAuth.textContent = register ? "Already have an account? Sign in" : "Need an account? Register";
  els.nameField.style.display = register ? "grid" : "none";
  els.nameInput.required = register;
}

function openAuth(mode = "login") {
  if (state.user && mode === "account") {
    renderAccountView();
  } else {
    setAuthMode(mode);
  }
  els.authModal.classList.add("open");
  els.authModal.setAttribute("aria-hidden", "false");
}

function closeAuth() {
  els.authModal.classList.remove("open");
  els.authModal.setAttribute("aria-hidden", "true");
}

function updateAuthUi() {
  if (state.user) {
    els.authButton.textContent = state.user.name.split(" ")[0];
    els.quickLoginButton.textContent = "View orders";
  } else {
    els.authButton.textContent = "Sign in";
    els.quickLoginButton.textContent = "Create account";
  }
}

function renderAccountView() {
  const initials = state.user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("") || "CA";
  els.authPanel.classList.add("signed-in");
  els.authTitle.textContent = "Account ready";
  els.authSubtitle.textContent = "Your profile is active for quicker checkout, order tracking, and a more personal store experience.";
  els.profileAvatar.textContent = initials;
  els.profileName.textContent = state.user.name;
  els.profileEmail.textContent = state.user.email;
}

function signOut() {
  localStorage.removeItem("ca_token");
  localStorage.removeItem("ca_user");
  state.token = "";
  state.user = null;
  els.authPanel.classList.remove("signed-in");
  updateAuthUi();
  loadOrders();
  closeAuth();
  showToast("Signed out securely");
}

async function submitAuth(event) {
  event.preventDefault();
  const payload = {
    name: els.nameInput.value,
    email: els.emailInput.value,
    password: els.passwordInput.value
  };
  const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  try {
    const data = await api(path, { method: "POST", body: JSON.stringify(payload) });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("ca_token", state.token);
    localStorage.setItem("ca_user", JSON.stringify(state.user));
    updateAuthUi();
    closeAuth();
    await loadOrders();
    showToast(`Welcome, ${state.user.name}`);
  } catch (error) {
    showToast(error.message);
  }
}

async function placeOrder(event) {
  event.preventDefault();
  if (!state.user) {
    openAuth("login");
    showToast("Sign in before checkout");
    return;
  }
  if (!state.cart.length) {
    showToast("Add at least one item to your cart");
    return;
  }

  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: state.cart,
        address: els.addressInput.value,
        payment: els.paymentInput.value
      })
    });
    state.cart = [];
    persistCart();
    els.checkoutForm.reset();
    renderCart();
    closeCart();
    await loadAllProductsForCategories();
    await loadOrders();
    els.heroOrder.textContent = `${data.order.id} - ${money(data.order.total)}`;
    showToast(`Order ${data.order.id} confirmed`);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOrders() {
  if (!state.user) {
    els.ordersList.innerHTML = `<p class="empty">Sign in to view order history after checkout.</p>`;
    return;
  }

  try {
    const data = await api("/api/orders");
    if (!data.orders.length) {
      els.ordersList.innerHTML = `<p class="empty">No orders yet. Your confirmed checkouts will appear here.</p>`;
      return;
    }
    els.ordersList.innerHTML = data.orders.map(order => `
      <article class="order-card">
        <header>
          <div>
            <h3>${order.id}</h3>
            <span class="product-meta">${new Date(order.createdAt).toLocaleString()}</span>
          </div>
          <strong>${money(order.total)}</strong>
        </header>
        <div class="order-items">
          <span>${order.items.map(item => `${item.quantity}x ${item.name}`).join(", ")}</span>
          <span>${order.status}</span>
        </div>
      </article>
    `).join("");
  } catch (error) {
    els.ordersList.innerHTML = `<p class="empty">${error.message}</p>`;
  }
}

document.addEventListener("click", event => {
  const addId = event.target.closest("[data-add]")?.dataset.add;
  const detailId = event.target.closest("[data-detail]")?.dataset.detail;
  const qtyButton = event.target.closest("[data-qty]");

  if (addId) addToCart(addId);
  if (detailId) openProduct(detailId);
  if (qtyButton) changeQuantity(qtyButton.dataset.qty, Number(qtyButton.dataset.delta));
  if (event.target.matches("[data-close]")) closeCart();
  if (event.target.matches("[data-close-modal]")) closeProduct();
  if (event.target.matches("[data-close-auth]")) closeAuth();
});

els.cartButton.addEventListener("click", openCart);
els.authButton.addEventListener("click", () => {
  if (state.user) {
    openAuth("account");
  } else {
    openAuth("login");
  }
});
els.quickLoginButton.addEventListener("click", () => {
  if (state.user) document.querySelector("#orders").scrollIntoView({ behavior: "smooth" });
  else openAuth("register");
});
els.toggleAuth.addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));
els.viewOrdersButton.addEventListener("click", () => {
  closeAuth();
  document.querySelector("#orders").scrollIntoView({ behavior: "smooth" });
});
els.signOutButton.addEventListener("click", signOut);
els.authForm.addEventListener("submit", submitAuth);
els.checkoutForm.addEventListener("submit", placeOrder);
els.searchInput.addEventListener("input", () => loadProducts().catch(error => showToast(error.message)));
els.categorySelect.addEventListener("change", () => loadProducts().catch(error => showToast(error.message)));

loadAllProductsForCategories()
  .then(() => {
    renderCart();
    updateAuthUi();
    return loadOrders();
  })
  .catch(error => showToast(error.message))
  .finally(hideSplash);

window.addEventListener("load", () => {
  window.setTimeout(hideSplash, 1400);
});
