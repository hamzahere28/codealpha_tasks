const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DB_FILE = path.join(ROOT, "data", "db.json");
const sessions = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
  });
}

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
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function currentUser(req, db) {
  const token = tokenFrom(req);
  const userId = sessions.get(token);
  return db.users.find(user => user.id === userId);
}

function serveStatic(req, res) {
  const requested = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const safePath = requested === "/" ? "/index.html" : requested;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackErr, fallback) => {
        if (fallbackErr) {
          res.writeHead(404);
          return res.end("Not found");
        }
        res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();

  try {
    if (req.method === "GET" && url.pathname === "/api/products") {
      const query = (url.searchParams.get("q") || "").toLowerCase();
      const category = url.searchParams.get("category") || "All";
      const products = db.products.filter(product => {
        const matchesQuery = !query || [product.name, product.category, product.description].join(" ").toLowerCase().includes(query);
        const matchesCategory = category === "All" || product.category === category;
        return matchesQuery && matchesCategory;
      });
      return sendJson(res, 200, { products });
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/products/")) {
      const id = url.pathname.split("/").pop();
      const product = db.products.find(item => item.id === id);
      return product ? sendJson(res, 200, { product }) : sendJson(res, 404, { message: "Product not found" });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      if (name.length < 2 || !email.includes("@") || password.length < 6) {
        return sendJson(res, 400, { message: "Enter a valid name, email, and password with at least 6 characters." });
      }

      if (db.users.some(user => user.email === email)) {
        return sendJson(res, 409, { message: "An account with this email already exists." });
      }

      const user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      };
      db.users.push(user);
      writeDb(db);

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      return sendJson(res, 201, { token, user: sanitizeUser(user) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const user = db.users.find(item => item.email === email);

      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJson(res, 401, { message: "Invalid email or password." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      sessions.set(token, user.id);
      return sendJson(res, 200, { token, user: sanitizeUser(user) });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const user = currentUser(req, db);
      return user ? sendJson(res, 200, { user: sanitizeUser(user) }) : sendJson(res, 401, { message: "Please sign in first." });
    }

    if (req.method === "POST" && url.pathname === "/api/orders") {
      const user = currentUser(req, db);
      if (!user) return sendJson(res, 401, { message: "Please sign in to place an order." });

      const body = await parseBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const address = String(body.address || "").trim();
      const payment = String(body.payment || "").trim();

      if (!items.length || address.length < 10 || !payment) {
        return sendJson(res, 400, { message: "Cart, delivery address, and payment method are required." });
      }

      const normalized = [];
      for (const item of items) {
        const product = db.products.find(entry => entry.id === item.productId);
        const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
        if (!product) return sendJson(res, 400, { message: "One of the products is no longer available." });
        if (product.stock < quantity) return sendJson(res, 409, { message: `${product.name} has only ${product.stock} item(s) left.` });
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

      db.orders.unshift(order);
      writeDb(db);
      return sendJson(res, 201, { order });
    }

    if (req.method === "GET" && url.pathname === "/api/orders") {
      const user = currentUser(req, db);
      if (!user) return sendJson(res, 401, { message: "Please sign in first." });
      const orders = db.orders.filter(order => order.userId === user.id);
      return sendJson(res, 200, { orders });
    }

    sendJson(res, 404, { message: "API route not found" });
  } catch (error) {
    sendJson(res, 500, { message: error.message || "Server error" });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`CodeAlpha Ecommerce Store running at http://localhost:${PORT}`);
});
