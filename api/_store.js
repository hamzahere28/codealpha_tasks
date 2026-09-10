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
    accent: "#2d6cdf",
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
    accent: "#0f766e",
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
    accent: "#d97706",
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
    accent: "#be123c",
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
    accent: "#6d28d9",
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
    accent: "#2563eb",
    description: "A neat multi-device charging dock with fast wireless charging, USB-C output, and a compact footprint for nightstands or desks.",
    features: ["15W wireless pad", "USB-C and USB-A ports", "Cable management tray", "Surge protection"]
  }
];

const store = globalThis.__codeAlphaStore || {
  products,
  users: [],
  orders: [],
  sessions: new Map()
};

globalThis.__codeAlphaStore = store;

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
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
  return user ? { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt } : null;
}

function currentUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = store.sessions.get(token);
  return store.users.find(user => user.id === userId);
}

module.exports = { store, send, hashPassword, verifyPassword, sanitizeUser, currentUser, crypto };
