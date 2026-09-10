const crypto = require("crypto");

const products = [
  {
    id: "p-001",
    name: "AeroLoop Wireless Headphones",
    category: "Audio",
    price: 89,
    rating: 4.8,
    stock: 18,
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
    description: "Immersive over-ear headphones with active noise isolation, quick pairing, and a comfortable fold-flat design for daily commutes and focused work.",
    features: ["32-hour battery life", "Active noise isolation", "Soft memory foam cups", "USB-C fast charge"]
  },
  {
    id: "p-002",
    name: "Nimbus Smart Backpack",
    category: "Travel",
    price: 124,
    rating: 4.7,
    stock: 12,
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
    description: "A weather-resistant everyday backpack with a protected laptop bay, cable routing, hidden passport pocket, and clean business-ready styling.",
    features: ["18L organized storage", "Padded 15-inch laptop sleeve", "Water-resistant shell", "Hidden security pocket"]
  },
  {
    id: "p-003",
    name: "PixelForge Desk Lamp",
    category: "Workspace",
    price: 58,
    rating: 4.6,
    stock: 22,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
    description: "A minimal LED desk lamp with precision dimming, three color temperatures, and a weighted aluminum base for modern workspaces.",
    features: ["3 color modes", "Touch dimmer", "Low-glare LED panel", "Weighted aluminum base"]
  },
  {
    id: "p-004",
    name: "PulseFit Pro Watch",
    category: "Wearables",
    price: 149,
    rating: 4.9,
    stock: 15,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
    description: "A bright, durable fitness watch that tracks workouts, sleep quality, heart rate, and productivity notifications without feeling bulky.",
    features: ["AMOLED display", "Heart-rate and sleep tracking", "5 ATM water resistance", "7-day battery"]
  },
  {
    id: "p-005",
    name: "Clarity 4K Webcam",
    category: "Workspace",
    price: 96,
    rating: 4.5,
    stock: 9,
    image: "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?auto=format&fit=crop&w=900&q=80",
    description: "A compact 4K webcam with auto framing, dual microphones, and a privacy shutter for meetings, demos, and remote interviews.",
    features: ["4K sensor", "Auto light correction", "Dual microphones", "Magnetic privacy cover"]
  },
  {
    id: "p-006",
    name: "VoltDock Charging Station",
    category: "Accessories",
    price: 72,
    rating: 4.4,
    stock: 30,
    image: "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=900&q=80",
    description: "A neat multi-device charging dock with fast wireless charging, USB-C output, and a compact footprint for nightstands or desks.",
    features: ["15W wireless pad", "USB-C and USB-A ports", "Cable management tray", "Surge protection"]
  }
];

const store = globalThis.__codeAlphaNetlifyStore || {
  products,
  users: [],
  orders: [],
  sessions: new Map()
};
globalThis.__codeAlphaNetlifyStore = store;

const json = (statusCode, payload) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload)
});

const parseBody = event => {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = stored.split(":");
  const comparison = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(comparison, "hex"));
}

function sanitizeUser(user) {
  return user ? { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } : null;
}

function currentUser(event) {
  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = store.sessions.get(token);
  return store.users.find(user => user.id === userId);
}

exports.handler = async event => {
  const method = event.httpMethod;
  const path = `/${event.path
    .replace(/^\/api/, "")
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/?/, "")}`.replace(/\/$/, "") || "/";
  const input = parseBody(event);

  if (method === "GET" && path === "/products") {
    const query = String(event.queryStringParameters?.q || "").toLowerCase();
    const category = String(event.queryStringParameters?.category || "All");
    const filtered = store.products.filter(product => {
      const haystack = [product.name, product.category, product.description].join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (category === "All" || product.category === category);
    });
    return json(200, { products: filtered });
  }

  if (method === "GET" && path.startsWith("/products/")) {
    const id = path.split("/").pop();
    const product = store.products.find(item => item.id === id);
    return product ? json(200, { product }) : json(404, { message: "Product not found" });
  }

  if (method === "POST" && path === "/auth/register") {
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (name.length < 2 || !email.includes("@") || password.length < 6) {
      return json(400, { message: "Enter a valid name, email, and password with at least 6 characters." });
    }
    if (store.users.some(user => user.email === email)) {
      return json(409, { message: "An account with this email already exists." });
    }
    const user = { id: crypto.randomUUID(), name, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    store.users.push(user);
    const token = crypto.randomBytes(32).toString("hex");
    store.sessions.set(token, user.id);
    return json(201, { token, user: sanitizeUser(user) });
  }

  if (method === "POST" && path === "/auth/login") {
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const user = store.users.find(item => item.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return json(401, { message: "Invalid email or password." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    store.sessions.set(token, user.id);
    return json(200, { token, user: sanitizeUser(user) });
  }

  if (method === "GET" && path === "/me") {
    const user = currentUser(event);
    return user ? json(200, { user: sanitizeUser(user) }) : json(401, { message: "Please sign in first." });
  }

  if (path === "/orders") {
    const user = currentUser(event);
    if (!user) return json(401, { message: "Please sign in first." });
    if (method === "GET") return json(200, { orders: store.orders.filter(order => order.userId === user.id) });
    if (method !== "POST") return json(405, { message: "Method not allowed" });

    const items = Array.isArray(input.items) ? input.items : [];
    const address = String(input.address || "").trim();
    const payment = String(input.payment || "").trim();
    if (!items.length || address.length < 10 || !payment) {
      return json(400, { message: "Cart, delivery address, and payment method are required." });
    }

    const normalized = [];
    for (const item of items) {
      const product = store.products.find(entry => entry.id === item.productId);
      const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
      if (!product) return json(400, { message: "One of the products is no longer available." });
      if (product.stock < quantity) return json(409, { message: `${product.name} has only ${product.stock} item(s) left.` });
      normalized.push({ product, quantity });
    }
    normalized.forEach(({ product, quantity }) => {
      product.stock -= quantity;
    });

    const subtotal = normalized.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const shipping = subtotal > 150 ? 0 : 12;
    const tax = Number((subtotal * 0.08).toFixed(2));
    const total = Number((subtotal + shipping + tax).toFixed(2));
    const order = {
      id: `ORD-${Date.now().toString().slice(-6)}`,
      userId: user.id,
      customer: sanitizeUser(user),
      items: normalized.map(({ product, quantity }) => ({
        productId: product.id,
        name: product.name,
        price: product.price,
        quantity,
        image: product.image
      })),
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
    return json(201, { order });
  }

  return json(404, { message: "API route not found" });
};
