const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8")
  .replace('<link rel="stylesheet" href="/styles.css">', "<style>{{CSS}}</style>")
  .replace('<script src="/app.js"></script>', "<script>{{JS}}</script>");
const css = fs.readFileSync(path.join(root, "public", "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const db = JSON.parse(fs.readFileSync(path.join(root, "data", "db.json"), "utf8"));

const page = html.replace("{{CSS}}", css).replace("{{JS}}", js);
const worker = `
const PAGE = ${JSON.stringify(page)};
const products = ${JSON.stringify(db.products, null, 2)};
const store = globalThis.__codeAlphaLiveStore || {
  products,
  users: [],
  orders: [],
  sessions: new Map()
};
globalThis.__codeAlphaLiveStore = store;

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function randomId() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

async function digest(value) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt = randomId()) {
  return salt + ":" + await digest(salt + ":" + password);
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const comparison = (await hashPassword(password, salt)).split(":")[1];
  return comparison === hash;
}

function sanitizeUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } : null;
}

function currentUser(request) {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = store.sessions.get(token);
  return store.users.find(user => user.id === userId);
}

async function handleApi(request, url) {
  if (request.method === "GET" && url.pathname === "/api/products") {
    const query = String(url.searchParams.get("q") || "").toLowerCase();
    const category = String(url.searchParams.get("category") || "All");
    const filtered = store.products.filter(product => {
      const haystack = [product.name, product.category, product.description].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (category === "All" || product.category === category);
    });
    return json({ products: filtered });
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/products/")) {
    const id = url.pathname.split("/").pop();
    const product = store.products.find(item => item.id === id);
    return product ? json({ product }) : json({ message: "Product not found" }, 404);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    const input = await body(request);
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (name.length < 2 || !email.includes("@") || password.length < 6) {
      return json({ message: "Enter a valid name, email, and password with at least 6 characters." }, 400);
    }
    if (store.users.some(user => user.email === email)) {
      return json({ message: "An account with this email already exists." }, 409);
    }
    const user = { id: randomId(), name, email, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() };
    store.users.push(user);
    const token = crypto.randomUUID ? crypto.randomUUID() + crypto.randomUUID() : randomId() + randomId();
    store.sessions.set(token, user.id);
    return json({ token, user: sanitizeUser(user) }, 201);
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const input = await body(request);
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const user = store.users.find(item => item.email === email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return json({ message: "Invalid email or password." }, 401);
    }
    const token = crypto.randomUUID ? crypto.randomUUID() + crypto.randomUUID() : randomId() + randomId();
    store.sessions.set(token, user.id);
    return json({ token, user: sanitizeUser(user) });
  }

  if (request.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(request);
    return user ? json({ user: sanitizeUser(user) }) : json({ message: "Please sign in first." }, 401);
  }

  if (url.pathname === "/api/orders") {
    const user = currentUser(request);
    if (!user) return json({ message: "Please sign in first." }, 401);
    if (request.method === "GET") {
      return json({ orders: store.orders.filter(order => order.userId === user.id) });
    }
    if (request.method !== "POST") return json({ message: "Method not allowed" }, 405);
    const input = await body(request);
    const items = Array.isArray(input.items) ? input.items : [];
    const address = String(input.address || "").trim();
    const payment = String(input.payment || "").trim();
    if (!items.length || address.length < 10 || !payment) {
      return json({ message: "Cart, delivery address, and payment method are required." }, 400);
    }
    const normalized = [];
    for (const item of items) {
      const product = store.products.find(entry => entry.id === item.productId);
      const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
      if (!product) return json({ message: "One of the products is no longer available." }, 400);
      if (product.stock < quantity) return json({ message: product.name + " has only " + product.stock + " item(s) left." }, 409);
      normalized.push({ product, quantity });
    }
    normalized.forEach(({ product, quantity }) => { product.stock -= quantity; });
    const subtotal = normalized.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const shipping = subtotal > 150 ? 0 : 12;
    const tax = Number((subtotal * 0.08).toFixed(2));
    const total = Number((subtotal + shipping + tax).toFixed(2));
    const order = {
      id: "ORD-" + Date.now().toString().slice(-6),
      userId: user.id,
      customer: sanitizeUser(user),
      items: normalized.map(({ product, quantity }) => ({ productId: product.id, name: product.name, price: product.price, quantity, image: product.image })),
      address,
      payment,
      subtotal,
      shipping,
      tax,
      total,
      status: "Confirmed",
      createdAt: new Date().toISOString()
    };
    store.orders.unshift(order);
    return json({ order }, 201);
  }

  return json({ message: "API route not found" }, 404);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, url);
    return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
};
`;

fs.mkdirSync(path.join(root, "dist", "server"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "server", "index.js"), worker.trimStart());
