const { store, send } = require("../_store");

module.exports = (req, res) => {
  if (req.method !== "GET") return send(res, 405, { message: "Method not allowed" });

  const query = String(req.query.q || "").toLowerCase();
  const category = String(req.query.category || "All");
  const products = store.products.filter(product => {
    const haystack = [product.name, product.category, product.description].join(" ").toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const matchesCategory = category === "All" || product.category === category;
    return matchesQuery && matchesCategory;
  });

  send(res, 200, { products });
};
