const express = require("express");
const http = require("node:http");
const { Server } = require("socket.io");
const { DatabaseSync } = require("node:sqlite");
const {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const hash = (value) => createHash("sha256").update(value).digest("hex");
const passwordHash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
};
const passwordMatches = (password, encoded) => {
  const [salt, value] = encoded.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(value, "hex"),
  );
};
const cleanUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  color: u.color,
});
const cookies = (header) =>
  Object.fromEntries(
    (header || "")
      .split(";")
      .map((v) => v.trim().split("="))
      .filter((v) => v.length === 2),
  );
const statuses = ["backlog", "progress", "review", "done"];
const priorities = ["low", "medium", "high", "urgent"];
const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
function text(value, label, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    (required && !value.trim()) ||
    value.length > max
  )
    throw fail(`${label} must be ${required ? "1" : "0"}-${max} characters.`);
  return value.trim();
}

function createApp({
  dbPath = process.env.DB_PATH ||
    path.join(__dirname, "data", "projects.sqlite"),
  seed = true,
} = {}) {
  if (dbPath !== ":memory:")
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,color TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,userId TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL,prefix TEXT NOT NULL,color TEXT NOT NULL,ownerId TEXT REFERENCES users(id),createdAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS members(projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,userId TEXT REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(projectId,userId));
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,number INTEGER,title TEXT,description TEXT,status TEXT,priority TEXT,assigneeId TEXT REFERENCES users(id),dueDate TEXT,label TEXT,cover TEXT,checklist TEXT,version INTEGER DEFAULT 1,createdAt TEXT,updatedAt TEXT);
    CREATE TABLE IF NOT EXISTS comments(id TEXT PRIMARY KEY,taskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,userId TEXT REFERENCES users(id),body TEXT,createdAt TEXT);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,userId TEXT REFERENCES users(id),projectId TEXT REFERENCES projects(id) ON DELETE CASCADE,taskId TEXT REFERENCES tasks(id) ON DELETE CASCADE,body TEXT,read INTEGER DEFAULT 0,createdAt TEXT);
    CREATE INDEX IF NOT EXISTS task_project ON tasks(projectId); CREATE INDEX IF NOT EXISTS notification_user ON notifications(userId);
  `);
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const transaction = (action) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  if (seed && !one("SELECT id FROM users LIMIT 1")) {
    transaction(() => {
      const pwd = passwordHash("DemoPass123!");
      [
        ["demo-hamza", "Hamza Talha", "hamza@demo.codealpha.test", "#3659e3"],
        ["demo-sara", "Sara Malik", "sara@demo.codealpha.test", "#b36286"],
        ["demo-ali", "Ali Hassan", "ali@demo.codealpha.test", "#398477"],
      ].forEach((u) =>
        run("INSERT INTO users VALUES(?,?,?,?,?)", ...u.slice(0, 3), pwd, u[3]),
      );
      const projects = [
        [
          "launch",
          "Website relaunch",
          "A considered new home for a creative studio. From first sketch to final ship.",
          "WEB",
          "#3659e3",
        ],
        [
          "mobile",
          "Mobile experience",
          "A simpler, faster experience for people on the move.",
          "MOB",
          "#b26941",
        ],
        [
          "brand",
          "Brand system",
          "One clear voice across every touchpoint.",
          "BRD",
          "#398477",
        ],
      ];
      projects.forEach((p) => {
        run(
          "INSERT INTO projects VALUES(?,?,?,?,?,?,?)",
          ...p,
          "demo-hamza",
          new Date().toISOString(),
        );
        ["demo-hamza", "demo-sara", "demo-ali"].forEach((u) =>
          run("INSERT INTO members VALUES(?,?)", p[0], u),
        );
      });
      const date = (offset) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
      };
      const tasks = [
        [
          "Map the customer journey",
          "backlog",
          "high",
          "demo-hamza",
          3,
          "Research",
          "",
          "Document the key paths from discovery to enquiry. Include the mobile experience and accessibility checkpoints.",
        ],
        [
          "Collect visual references",
          "backlog",
          "low",
          "demo-sara",
          5,
          "Design",
          "",
          "Curate references for typography, photography and motion. Keep the direction calm and purposeful.",
        ],
        [
          "Write the studio story",
          "backlog",
          "medium",
          "demo-hamza",
          6,
          "Content",
          "",
          "Draft a concise introduction, an about page and the values that shape the studio.",
        ],
        [
          "Design the new homepage",
          "progress",
          "high",
          "demo-sara",
          2,
          "Design",
          "architecture",
          "Bring the new visual direction to life. The homepage should balance the studio story with selected work.",
        ],
        [
          "Build the component library",
          "progress",
          "medium",
          "demo-ali",
          4,
          "Development",
          "",
          "Create accessible buttons, form fields and navigation components. Include loading, focus and error states.",
        ],
        [
          "Explore page transitions",
          "progress",
          "low",
          "demo-sara",
          5,
          "Design",
          "",
          "Prototype subtle transitions that support navigation. Respect reduced-motion preferences.",
        ],
        [
          "Review the mobile layouts",
          "review",
          "high",
          "demo-hamza",
          1,
          "Design",
          "",
          "Review all breakpoints, touch targets and content wrapping before handoff.",
        ],
        [
          "Finalize product photography",
          "review",
          "medium",
          "demo-sara",
          2,
          "Content",
          "desk",
          "Select the final image set and prepare responsive exports with descriptive alt text.",
        ],
        [
          "Kickoff & project brief",
          "done",
          "medium",
          "demo-hamza",
          -2,
          "Planning",
          "",
          "Agree on the scope, milestones and success criteria with everyone on the project.",
        ],
        [
          "Audit the existing website",
          "done",
          "low",
          "demo-ali",
          -1,
          "Research",
          "",
          "Capture performance, accessibility and usability issues to address in the relaunch.",
        ],
      ];
      tasks.forEach((t, i) =>
        run(
          "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          `task-${i + 1}`,
          "launch",
          i + 1,
          t[0],
          t[7],
          t[1],
          t[2],
          t[3],
          date(t[4]),
          t[5],
          t[6],
          JSON.stringify([
            { id: "a", text: "Prepare first draft", done: i > 2 },
            { id: "b", text: "Review with the team", done: i > 7 },
          ]),
          1,
          new Date().toISOString(),
          new Date().toISOString(),
        ),
      );
      [
        ["mobile", "Outline onboarding"],
        ["brand", "Define color & type"],
      ].forEach(([p, t]) =>
        run(
          "INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          randomUUID(),
          p,
          1,
          t,
          "Agree on the direction with the team.",
          "backlog",
          "medium",
          "demo-ali",
          date(7),
          "Planning",
          "",
          "[]",
          1,
          new Date().toISOString(),
          new Date().toISOString(),
        ),
      );
      run(
        "INSERT INTO comments VALUES(?,?,?,?,?)",
        "comment-1",
        "task-4",
        "demo-hamza",
        "The direction is looking good. Let us give the selected work more room to breathe.",
        new Date().toISOString(),
      );
      run(
        "INSERT INTO notifications VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        "demo-hamza",
        "launch",
        "task-4",
        "Sara shared an update on Design the new homepage.",
        0,
        new Date().toISOString(),
      );
    });
  }
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 100000 });
  app.disable("x-powered-by");
  app.use(express.json({ limit: "120kb" }));
  app.use((req, res, next) => {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "same-origin");
    res.set("X-Frame-Options", "DENY");
    if (req.path.startsWith("/api")) res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin
    ) {
      try {
        if (new URL(req.headers.origin).host !== req.headers.host)
          throw Error();
      } catch {
        return res
          .status(403)
          .json({ error: "Request origin is not allowed." });
      }
    }
    next();
  });
  const sessionUser = (req) => {
    const token = cookies(req.headers.cookie).ca_projects;
    if (!token) return null;
    return one(
      "SELECT users.* FROM sessions JOIN users ON users.id=sessions.userId WHERE token=? AND expires>?",
      hash(token),
      Date.now(),
    );
  };
  const auth = (req, res, next) => {
    req.user = sessionUser(req);
    if (!req.user)
      return res.status(401).json({ error: "Please sign in to continue." });
    next();
  };
  const member = (projectId, userId) => {
    const project = one(
      "SELECT p.* FROM projects p JOIN members m ON p.id=m.projectId WHERE p.id=? AND m.userId=?",
      projectId,
      userId,
    );
    if (!project) throw fail("Project not found.", 404);
    return project;
  };
  const taskFor = (id, userId) => {
    const task = one("SELECT * FROM tasks WHERE id=?", id);
    if (!task) throw fail("Task not found.", 404);
    member(task.projectId, userId);
    return task;
  };
  const emit = (projectId) => io.to(`project:${projectId}`).emit("changed");
  const notify = (projectId, taskId, body, except) => {
    all("SELECT userId FROM members WHERE projectId=?", projectId)
      .filter((m) => m.userId !== except)
      .forEach((m) => {
        run(
          "INSERT INTO notifications VALUES(?,?,?,?,?,?,?)",
          randomUUID(),
          m.userId,
          projectId,
          taskId,
          body,
          0,
          new Date().toISOString(),
        );
        io.to(`user:${m.userId}`).emit("changed");
      });
  };
  const establish = (req, res, user) => {
    const token = randomBytes(32).toString("hex");
    run("DELETE FROM sessions WHERE expires<?", Date.now());
    run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(token),
      user.id,
      Date.now() + 604800000,
    );
    res.cookie("ca_projects", token, {
      httpOnly: true,
      sameSite: "strict",
      secure: req.secure || process.env.COOKIE_SECURE === "true",
      maxAge: 604800000,
      path: "/",
    });
    res.json({ user: cleanUser(user) });
  };
  const attempts = new Map();
  app.use("/api/auth", (req, res, next) => {
    const key = req.ip;
    const now = Date.now();
    let item = attempts.get(key);
    if (!item || item.until < now) item = { count: 0, until: now + 60000 };
    item.count++;
    attempts.set(key, item);
    if (attempts.size > 10000)
      for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    if (item.count > 30)
      return res
        .status(429)
        .json({ error: "Too many attempts. Please wait a minute." });
    next();
  });
  app.post("/api/auth/register", (req, res) => {
    const name = text(req.body.name, "Name", 70);
    const email = text(req.body.email, "Email", 160).toLowerCase();
    const password = text(req.body.password, "Password", 128);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw fail("Enter a valid email address.");
    if (password.length < 8)
      throw fail("Password needs at least 8 characters.");
    if (one("SELECT id FROM users WHERE email=?", email))
      throw fail("An account already exists with that email.", 409);
    const user = { id: randomUUID(), name, email, color: "#3659e3" };
    run(
      "INSERT INTO users VALUES(?,?,?,?,?)",
      user.id,
      name,
      email,
      passwordHash(password),
      user.color,
    );
    establish(req, res, user);
  });
  app.post("/api/auth/login", (req, res) => {
    const email = text(req.body.email, "Email", 160).toLowerCase();
    const password = text(req.body.password, "Password", 128);
    const user = one("SELECT * FROM users WHERE email=?", email);
    if (!user || !passwordMatches(password, user.password))
      throw fail("Email or password is incorrect.", 401);
    establish(req, res, user);
  });
  app.post("/api/auth/demo", (req, res) => {
    const user = one("SELECT * FROM users WHERE id='demo-hamza'");
    if (!user) throw fail("Demo is unavailable.", 404);
    establish(req, res, user);
  });
  app.post("/api/auth/logout", auth, (req, res) => {
    const token = cookies(req.headers.cookie).ca_projects;
    run("DELETE FROM sessions WHERE token=?", hash(token));
    io.in(`session:${hash(token)}`).disconnectSockets();
    res.clearCookie("ca_projects", { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/health", (req, res) => res.json({ status: "online" }));
  app.get("/api/state", auth, (req, res) => {
    const projects = all(
      "SELECT p.* FROM projects p JOIN members m ON p.id=m.projectId WHERE m.userId=? ORDER BY p.createdAt",
      req.user.id,
    ).map((p) => ({
      ...p,
      members: all(
        "SELECT u.id,u.name,u.email,u.color FROM users u JOIN members m ON u.id=m.userId WHERE m.projectId=?",
        p.id,
      ),
    }));
    const tasks = all(
      "SELECT t.* FROM tasks t JOIN members m ON m.projectId=t.projectId WHERE m.userId=? ORDER BY t.number",
      req.user.id,
    ).map((t) => ({
      ...t,
      checklist: JSON.parse(t.checklist),
      comments: all(
        "SELECT c.*,u.name,u.color FROM comments c JOIN users u ON c.userId=u.id WHERE c.taskId=? ORDER BY c.createdAt",
        t.id,
      ),
    }));
    res.json({
      user: cleanUser(req.user),
      projects,
      tasks,
      notifications: all(
        "SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT 100",
        req.user.id,
      ),
    });
  });
  app.post("/api/projects", auth, (req, res) => {
    const name = text(req.body.name, "Project name", 80);
    const description = text(
      req.body.description || "",
      "Description",
      600,
      false,
    );
    const id = randomUUID();
    const prefix = (
      req.body.prefix || name.replace(/[^a-z]/gi, "").slice(0, 3)
    ).toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(prefix))
      throw fail("Project code needs 2-5 letters.");
    const color = ["#3659e3", "#b26941", "#398477", "#a35e89"].includes(
      req.body.color,
    )
      ? req.body.color
      : "#3659e3";
    transaction(() => {
      run(
        "INSERT INTO projects VALUES(?,?,?,?,?,?,?)",
        id,
        name,
        description,
        prefix,
        color,
        req.user.id,
        new Date().toISOString(),
      );
      run("INSERT INTO members VALUES(?,?)", id, req.user.id);
    });
    io.in(`user:${req.user.id}`).socketsJoin(`project:${id}`);
    io.to(`user:${req.user.id}`).emit("changed");
    res.status(201).json({ id });
  });
  app.patch("/api/projects/:id", auth, (req, res) => {
    const p = member(req.params.id, req.user.id);
    if (p.ownerId !== req.user.id)
      throw fail("Only the project owner can edit this project.", 403);
    run(
      "UPDATE projects SET name=?,description=? WHERE id=?",
      text(req.body.name, "Project name", 80),
      text(req.body.description || "", "Description", 600, false),
      p.id,
    );
    emit(p.id);
    res.json({ ok: true });
  });
  app.delete("/api/projects/:id", auth, (req, res) => {
    const p = member(req.params.id, req.user.id);
    if (p.ownerId !== req.user.id)
      throw fail("Only the project owner can delete this project.", 403);
    run("DELETE FROM projects WHERE id=?", p.id);
    emit(p.id);
    res.json({ ok: true });
  });
  app.post("/api/projects/:id/members", auth, (req, res) => {
    const p = member(req.params.id, req.user.id);
    if (p.ownerId !== req.user.id)
      throw fail("Only the project owner can add members.", 403);
    const email = text(req.body.email, "Email", 160).toLowerCase();
    const u = one("SELECT * FROM users WHERE email=?", email);
    if (!u)
      throw fail(
        "No account with that email. Ask your teammate to create an account first.",
        404,
      );
    if (one("SELECT * FROM members WHERE projectId=? AND userId=?", p.id, u.id))
      throw fail("This person is already on the project.", 409);
    run("INSERT INTO members VALUES(?,?)", p.id, u.id);
    io.in(`user:${u.id}`).socketsJoin(`project:${p.id}`);
    notify(
      p.id,
      null,
      `${req.user.name} added ${u.name} to ${p.name}.`,
      req.user.id,
    );
    emit(p.id);
    res.status(201).json({ ok: true });
  });
  function taskValues(body, p, previous = {}) {
    const t = { ...previous, ...body };
    const title = text(t.title, "Task title", 160);
    const description = text(t.description || "", "Description", 5000, false);
    const status = t.status || "backlog";
    const priority = t.priority || "medium";
    if (!statuses.includes(status) || !priorities.includes(priority))
      throw fail("Choose a valid status and priority.");
    const assigneeId = t.assigneeId || null;
    if (
      assigneeId &&
      !one(
        "SELECT * FROM members WHERE projectId=? AND userId=?",
        p.id,
        assigneeId,
      )
    )
      throw fail("Assignee must belong to this project.");
    const dueDate = t.dueDate || "";
    if (
      dueDate &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
        Number.isNaN(Date.parse(dueDate)) ||
        new Date(dueDate).toISOString().slice(0, 10) !== dueDate)
    )
      throw fail("Enter a valid due date.");
    const checklist = t.checklist || [];
    if (!Array.isArray(checklist) || checklist.length > 40)
      throw fail("A checklist can contain up to 40 items.");
    const normalized = checklist.map((item) => ({
      id: text(item.id, "Checklist ID", 80),
      text: text(item.text, "Checklist item", 180),
      done: !!item.done,
    }));
    return [
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
      text(t.label || "General", "Label", 30),
      JSON.stringify(normalized),
    ];
  }
  app.post("/api/projects/:id/tasks", auth, (req, res) => {
    const p = member(req.params.id, req.user.id);
    const values = taskValues(req.body, p);
    const id = randomUUID();
    const now = new Date().toISOString();
    transaction(() => {
      const number = one(
        "SELECT COALESCE(MAX(number),0)+1 AS n FROM tasks WHERE projectId=?",
        p.id,
      ).n;
      run(
        "INSERT INTO tasks(id,projectId,number,title,description,status,priority,assigneeId,dueDate,label,checklist,cover,version,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        id,
        p.id,
        number,
        ...values,
        "",
        1,
        now,
        now,
      );
      notify(p.id, id, `${req.user.name} created ${values[0]}.`, req.user.id);
    });
    emit(p.id);
    res.status(201).json({ id });
  });
  app.patch("/api/tasks/:id", auth, (req, res) => {
    const t = taskFor(req.params.id, req.user.id);
    if (req.body.version !== t.version)
      throw fail(
        "This task changed. Your board has been refreshed; please try again.",
        409,
      );
    const p = member(t.projectId, req.user.id);
    const values = taskValues(req.body, p, {
      ...t,
      checklist: JSON.parse(t.checklist),
    });
    transaction(() => {
      run(
        "UPDATE tasks SET title=?,description=?,status=?,priority=?,assigneeId=?,dueDate=?,label=?,checklist=?,version=version+1,updatedAt=? WHERE id=?",
        ...values,
        new Date().toISOString(),
        t.id,
      );
      if (t.status !== values[2] || t.assigneeId !== values[4])
        notify(
          p.id,
          t.id,
          `${req.user.name} updated ${values[0]}.`,
          req.user.id,
        );
    });
    emit(p.id);
    res.json({ ok: true });
  });
  app.delete("/api/tasks/:id", auth, (req, res) => {
    const t = taskFor(req.params.id, req.user.id);
    run("DELETE FROM tasks WHERE id=?", t.id);
    emit(t.projectId);
    res.json({ ok: true });
  });
  app.post("/api/tasks/:id/comments", auth, (req, res) => {
    const t = taskFor(req.params.id, req.user.id);
    const body = text(req.body.body, "Comment", 2000);
    transaction(() => {
      run(
        "INSERT INTO comments VALUES(?,?,?,?,?)",
        randomUUID(),
        t.id,
        req.user.id,
        body,
        new Date().toISOString(),
      );
      notify(
        t.projectId,
        t.id,
        `${req.user.name} commented on ${t.title}.`,
        req.user.id,
      );
    });
    emit(t.projectId);
    res.status(201).json({ ok: true });
  });
  app.patch("/api/notifications", auth, (req, res) => {
    run("UPDATE notifications SET read=1 WHERE userId=?", req.user.id);
    io.to(`user:${req.user.id}`).emit("changed");
    res.json({ ok: true });
  });
  io.use((socket, next) => {
    const u = sessionUser(socket.request);
    if (!u) return next(Error("Unauthorized"));
    socket.user = u;
    next();
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.user.id}`);
    socket.join(
      `session:${hash(cookies(socket.request.headers.cookie).ca_projects)}`,
    );
    all("SELECT projectId FROM members WHERE userId=?", socket.user.id).forEach(
      (p) => socket.join(`project:${p.projectId}`),
    );
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(express.static(path.join(__dirname, "public")));
  app.get("/", (req, res) =>
    res.sendFile(path.join(__dirname, "public", "index.html")),
  );
  app.use((err, req, res, next) => {
    if (!err.status) console.error(err);
    res
      .status(err.status || 500)
      .json({
        error: err.status
          ? err.message
          : "Something went wrong. Please try again.",
      });
  });
  return { app, server, io, db };
}
if (require.main === module) {
  const { server } = createApp();
  server.listen(
    Number(process.env.PORT) || 3200,
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        `CodeAlpha Projects: http://localhost:${process.env.PORT || 3200}`,
      ),
  );
}
module.exports = { createApp };
