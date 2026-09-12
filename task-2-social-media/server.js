const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3100;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const { readDb, writeDb } = require("./storage");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sessionDigest(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions = (db.sessions || []).filter(session => session.expiresAt > Date.now());
  db.sessions.push({ digest: sessionDigest(token), userId, expiresAt: Date.now() + 7 * 86400000 });
  return token;
}

function json(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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
  if (stored === "seeded") return password === "password123";
  const [salt, originalHash] = stored.split(":");
  const comparison = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(comparison, "hex"));
}

function publicUser(user, viewer) {
  const following = Array.isArray(user.following) ? user.following : [];
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    bio: user.bio,
    role: user.role,
    location: user.location,
    avatar: user.avatar,
    createdAt: user.createdAt,
    followingCount: following.length,
    followerCount: user.followerCount || 0,
    isFollowing: viewer ? (viewer.following || []).includes(user.id) : false
  };
}

function buildUsers(db, viewer) {
  return db.users.map(user => {
    const item = publicUser(user, viewer);
    item.followerCount = db.users.filter(candidate => (candidate.following || []).includes(user.id)).length;
    return item;
  });
}

function currentUser(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const digest = sessionDigest(token);
  const userId = (db.sessions || []).find(session => session.digest === digest && session.expiresAt > Date.now())?.userId;
  return db.users.find(user => user.id === userId);
}

function buildPost(post, db, viewer) {
  const author = db.users.find(user => user.id === post.userId);
  return {
    ...post,
    author: publicUser(author, viewer),
    likeCount: post.likes.length,
    liked: viewer ? post.likes.includes(viewer.id) : false,
    saved: viewer ? (viewer.savedPosts || []).includes(post.id) : false,
    commentCount: post.comments.length,
    comments: post.comments.map(comment => ({
      ...comment,
      author: publicUser(db.users.find(user => user.id === comment.userId), viewer)
    }))
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallback) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, { "content-type": mimeTypes[".html"] });
        res.end(fallback);
      });
      return;
    }
    res.writeHead(200, { "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    const db = await readDb();
    const viewer = currentUser(req, db);
    if (req.method === "POST" && url.pathname === "/api/auth/register") {
      const input = await parseBody(req);
      const name = String(input.name || "").trim();
      const username = String(input.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      if (name.length < 2 || username.length < 3 || !email.includes("@") || password.length < 6) {
        return json(res, 400, { message: "Enter a valid name, username, email, and 6+ character password." });
      }
      if (db.users.some(user => user.email === email || user.username === username)) {
        return json(res, 409, { message: "Email or username already exists." });
      }
      const initials = name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "CA";
      const user = {
        id: crypto.randomUUID(),
        name,
        username,
        email,
        passwordHash: hashPassword(password),
        bio: "New member shaping their digital circle.",
        role: "Community Member",
        location: "Remote",
        avatar: initials,
        createdAt: new Date().toISOString(),
        following: []
      };
      db.users.push(user);
      const token = createSession(db, user.id);
      await writeDb(db);
      return json(res, 201, { token, user: publicUser(user, user) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/login") {
      const input = await parseBody(req);
      const email = String(input.email || "").trim().toLowerCase();
      const password = String(input.password || "");
      const user = db.users.find(item => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) return json(res, 401, { message: "Invalid email or password." });
      const token = createSession(db, user.id);
      await writeDb(db);
      return json(res, 200, { token, user: publicUser(user, user) });
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      return viewer ? json(res, 200, { user: publicUser(viewer, viewer) }) : json(res, 401, { message: "Please sign in first." });
    }

    if (req.method === "GET" && url.pathname === "/api/feed") {
      const users = buildUsers(db, viewer);
      const posts = db.posts
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(post => buildPost(post, db, viewer));
      return json(res, 200, { posts, users, viewer: viewer ? users.find(user => user.id === viewer.id) : null });
    }

    if (req.method === "POST" && url.pathname === "/api/posts") {
      if (!viewer) return json(res, 401, { message: "Please sign in before posting." });
      const input = await parseBody(req);
      const content = String(input.content || "").trim();
      const mood = String(input.mood || "Update").trim().slice(0, 24);
      const image = String(input.image || "");
      if (image && (!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(image) || image.length > 750000)) return json(res, 400, { message: "Choose a PNG, JPG or WebP image under 550 KB." });
      if (content.length < 3) return json(res, 400, { message: "Write at least 3 characters." });
      const post = {
        id: crypto.randomUUID(),
        userId: viewer.id,
        content: content.slice(0, 500),
        mood,
        image,
        createdAt: new Date().toISOString(),
        likes: [],
        comments: []
      };
      db.posts.unshift(post);
      await writeDb(db);
      return json(res, 201, { post: buildPost(post, db, viewer) });
    }

    const likeMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/like$/);
    if (req.method === "POST" && likeMatch) {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      const post = db.posts.find(item => item.id === likeMatch[1]);
      if (!post) return json(res, 404, { message: "Post not found." });
      post.likes = post.likes.includes(viewer.id) ? post.likes.filter(id => id !== viewer.id) : [...post.likes, viewer.id];
      await writeDb(db);
      return json(res, 200, { post: buildPost(post, db, viewer) });
    }

    const commentMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/comments$/);
    if (req.method === "POST" && commentMatch) {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      const post = db.posts.find(item => item.id === commentMatch[1]);
      if (!post) return json(res, 404, { message: "Post not found." });
      const input = await parseBody(req);
      const content = String(input.content || "").trim();
      if (content.length < 2) return json(res, 400, { message: "Comment is too short." });
      post.comments.push({ id: crypto.randomUUID(), userId: viewer.id, content: content.slice(0, 240), createdAt: new Date().toISOString() });
      await writeDb(db);
      return json(res, 201, { post: buildPost(post, db, viewer) });
    }

    const followMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/follow$/);
    if (req.method === "POST" && followMatch) {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      const target = db.users.find(user => user.id === followMatch[1]);
      if (!target || target.id === viewer.id) return json(res, 400, { message: "User cannot be followed." });
      const fullViewer = db.users.find(user => user.id === viewer.id);
      fullViewer.following = fullViewer.following || [];
      fullViewer.following = fullViewer.following.includes(target.id)
        ? fullViewer.following.filter(id => id !== target.id)
        : [...fullViewer.following, target.id];
      await writeDb(db);
      return json(res, 200, { users: buildUsers(db, fullViewer), viewer: publicUser(fullViewer, fullViewer) });
    }

    if (req.method === "POST" && url.pathname === "/api/auth/logout") {
      const digest = sessionDigest((req.headers.authorization || "").slice(7));
      db.sessions = (db.sessions || []).filter(session => session.digest !== digest);
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    if (req.method === "PATCH" && url.pathname === "/api/me") {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      const input = await parseBody(req);
      const name = String(input.name || "").trim().slice(0, 60);
      if (name.length < 2) return json(res, 400, { message: "Enter a name with at least 2 characters." });
      Object.assign(viewer, { name, role: String(input.role || "Creator").trim().slice(0, 60), bio: String(input.bio || "").trim().slice(0, 240), location: String(input.location || "").trim().slice(0, 80), avatar: name.split(/\s+/).slice(0, 2).map(part => part[0].toUpperCase()).join("") });
      await writeDb(db);
      return json(res, 200, { user: publicUser(viewer, viewer) });
    }

    const saveMatch = url.pathname.match(/^\/api\/posts\/([^/]+)\/save$/);
    if (req.method === "POST" && saveMatch) {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      if (!db.posts.some(post => post.id === saveMatch[1])) return json(res, 404, { message: "Post not found." });
      const saved = viewer.savedPosts || [];
      viewer.savedPosts = saved.includes(saveMatch[1]) ? saved.filter(id => id !== saveMatch[1]) : [...saved, saveMatch[1]];
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    const deleteMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      if (!viewer) return json(res, 401, { message: "Please sign in first." });
      const post = db.posts.find(item => item.id === deleteMatch[1]);
      if (!post) return json(res, 404, { message: "Post not found." });
      if (post.userId !== viewer.id) return json(res, 403, { message: "You can only delete your own posts." });
      db.posts = db.posts.filter(item => item.id !== post.id);
      for (const user of db.users) user.savedPosts = (user.savedPosts || []).filter(id => id !== post.id);
      await writeDb(db);
      return json(res, 200, { ok: true });
    }

    json(res, 404, { message: "API route not found." });
  } catch (error) {
    json(res, error.statusCode || 500, { message: error.statusCode ? error.message : "We could not complete that request. Please try again." });
  }
}

// Serialize JSON-store writes so overlapping requests cannot overwrite each other.
let pendingMutation = Promise.resolve();
const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    if (req.method === "GET") return handleApi(req, res);
    pendingMutation = pendingMutation.then(() => handleApi(req, res)).catch(() => {
      if (!res.headersSent) json(res, 500, { message: "Please try again." });
    });
    return;
  }
  serveStatic(req, res);
});

if (require.main === module) server.listen(PORT, () => {
  console.log(`CodeAlpha Social Media Platform running at http://localhost:${server.address().port}`);
});
module.exports = server;
