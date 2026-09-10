const { store, send, hashPassword, sanitizeUser, crypto } = require("../_store");

module.exports = (req, res) => {
  if (req.method !== "POST") return send(res, 405, { message: "Method not allowed" });

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (name.length < 2 || !email.includes("@") || password.length < 6) {
    return send(res, 400, { message: "Enter a valid name, email, and password with at least 6 characters." });
  }

  if (store.users.some(user => user.email === email)) {
    return send(res, 409, { message: "An account with this email already exists." });
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  store.users.push(user);

  const token = crypto.randomBytes(32).toString("hex");
  store.sessions.set(token, user.id);
  send(res, 201, { token, user: sanitizeUser(user) });
};
