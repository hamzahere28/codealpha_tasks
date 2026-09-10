const { send, currentUser, sanitizeUser } = require("./_store");

module.exports = (req, res) => {
  if (req.method !== "GET") return send(res, 405, { message: "Method not allowed" });
  const user = currentUser(req);
  return user ? send(res, 200, { user: sanitizeUser(user) }) : send(res, 401, { message: "Please sign in first." });
};
