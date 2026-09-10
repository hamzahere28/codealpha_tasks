const { store, send, currentUser, sanitizeUser } = require("./_store");

module.exports = (req, res) => {
  const user = currentUser(req);
  if (!user) return send(res, 401, { message: "Please sign in first." });

  if (req.method === "GET") {
    return send(res, 200, { orders: store.orders.filter(order => order.userId === user.id) });
  }

  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const address = String(req.body?.address || "").trim();
  const payment = String(req.body?.payment || "").trim();

  if (!items.length || address.length < 10 || !payment) {
    return send(res, 400, { message: "Cart, delivery address, and payment method are required." });
  }

  const normalized = [];
  for (const item of items) {
    const product = store.products.find(entry => entry.id === item.productId);
    const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
    if (!product) return send(res, 400, { message: "One of the products is no longer available." });
    if (product.stock < quantity) return send(res, 409, { message: `${product.name} has only ${product.stock} item(s) left.` });
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
  send(res, 201, { order });
};
