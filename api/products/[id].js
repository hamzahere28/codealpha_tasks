const { store, send } = require("../_store");

module.exports = (req, res) => {
  if (req.method !== "GET") return send(res, 405, { message: "Method not allowed" });
  const product = store.products.find(item => item.id === req.query.id);
  return product ? send(res, 200, { product }) : send(res, 404, { message: "Product not found" });
};
