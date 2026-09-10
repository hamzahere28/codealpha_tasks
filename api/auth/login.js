const { store, send, verifyPassword, sanitizeUser, crypto } = require("../_store");

module.exports = (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = store.users.find(item => item.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return send(res, 401, { message: "Invalid email or password." });
  }

  const token = crypto.randomBytes(32).toString("hex");
  store.sessions.set(token, user.id);
  send(res, 200, { token, user: sanitizeUser(user) });
};
