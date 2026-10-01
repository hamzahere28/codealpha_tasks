const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { io: connect } = require("socket.io-client");
const { createApp } = require("../server");

test("complete collaborative project workflow, permissions and persistence", async () => {
  const temp = mkdtempSync(path.join(tmpdir(), "codealpha-projects-test-"));
  const dbPath = path.join(temp, "test.sqlite");
  const context = createApp({ dbPath });
  await new Promise((resolve) =>
    context.server.listen(0, "127.0.0.1", resolve),
  );
  const base = `http://127.0.0.1:${context.server.address().port}/api`;
  const clients = [];
  async function request(route, method = "GET", body, cookie = "") {
    const res = await fetch(base + route, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
    };
  }
  try {
    assert.equal((await request("/state")).status, 401);
    const a = await request("/auth/register", "POST", {
      name: "Owner",
      email: "owner@test.example",
      password: "TestPass123!",
    });
    assert.equal(a.status, 200);
    const b = await request("/auth/register", "POST", {
      name: "Member",
      email: "member@test.example",
      password: "TestPass123!",
    });
    assert.equal(b.status, 200);
    const outsider = await request("/auth/register", "POST", {
      name: "Outside",
      email: "outside@test.example",
      password: "TestPass123!",
    });
    assert.equal(
      (
        await request("/auth/login", "POST", {
          email: "owner@test.example",
          password: "WrongPass123",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/register", "POST", {
          name: "Duplicate",
          email: "owner@test.example",
          password: "TestPass123!",
        })
      ).status,
      409,
    );
    const project = await request(
      "/projects",
      "POST",
      { name: "Release plan", description: "Team project", prefix: "REL" },
      a.cookie,
    );
    assert.equal(project.status, 201);
    const id = project.data.id;
    assert.equal(
      (
        await request(
          `/projects/${id}/members`,
          "POST",
          { email: "member@test.example" },
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/projects/${id}/members`,
          "POST",
          { email: "member@test.example" },
          a.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/projects/${id}/members`,
          "POST",
          { email: "outside@test.example" },
          b.cookie,
        )
      ).status,
      403,
    );
    const socket = connect(base.replace("/api", ""), {
      extraHeaders: { Cookie: b.cookie },
      transports: ["websocket"],
    });
    clients.push(socket);
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const event = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error("No real-time event")),
        5000,
      );
      socket.once("changed", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    const created = await request(
      `/projects/${id}/tasks`,
      "POST",
      {
        title: "Ship the first version",
        description: "Test everything",
        assigneeId: b.data.user.id,
        status: "backlog",
        dueDate: "2026-10-10",
        priority: "high",
        checklist: [{ id: "1", text: "QA", done: false }],
      },
      a.cookie,
    );
    assert.equal(created.status, 201);
    await event;
    const tid = created.data.id;
    const loaded = await request("/state", "GET", null, b.cookie);
    const task = loaded.data.tasks.find((t) => t.id === tid);
    assert.equal(task.assigneeId, b.data.user.id);
    assert.equal(task.checklist.length, 1);
    assert.ok(loaded.data.notifications.length > 0);
    assert.equal(
      (await request("/state", "GET", null, outsider.cookie)).data.tasks.length,
      0,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}`,
          "PATCH",
          { version: 1, status: "done" },
          outsider.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}`,
          "PATCH",
          { version: 1, assigneeId: outsider.data.user.id },
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}`,
          "PATCH",
          { version: 1, dueDate: "2026-02-30" },
          a.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}`,
          "PATCH",
          { version: 1, status: "progress" },
          b.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}`,
          "PATCH",
          { version: 1, status: "done" },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          `/tasks/${tid}/comments`,
          "POST",
          { body: "Ready for review." },
          b.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request("/notifications", "PATCH", {}, b.cookie)).status,
      200,
    );
    const updated = await request("/state", "GET", null, a.cookie);
    assert.equal(updated.data.tasks[0].status, "progress");
    assert.equal(updated.data.tasks[0].comments[0].body, "Ready for review.");
    assert.equal(updated.data.user.password, undefined);
    const second = createApp({ dbPath, seed: false });
    assert.equal(
      second.db.prepare("SELECT title FROM tasks WHERE id=?").get(tid).title,
      "Ship the first version",
    );
    second.io.close();
    second.db.close();
    const csrf = await fetch(base + `/projects/${id}/tasks`, {
      method: "POST",
      headers: {
        Cookie: a.cookie,
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Blocked" }),
    });
    assert.equal(csrf.status, 403);
    assert.equal(
      (await request(`/projects/${id}`, "DELETE", null, b.cookie)).status,
      403,
    );
    assert.equal(
      (await request(`/tasks/${tid}`, "DELETE", null, a.cookie)).status,
      200,
    );
    assert.equal(
      (await request(`/projects/${id}`, "DELETE", null, a.cookie)).status,
      200,
    );
    assert.equal(
      (await request("/auth/logout", "POST", {}, a.cookie)).status,
      200,
    );
    assert.equal((await request("/state", "GET", null, a.cookie)).status, 401);
    assert.equal((await request("/auth/demo", "POST", {})).status, 200);
  } finally {
    clients.forEach((s) => s.disconnect());
    await new Promise((resolve) => context.io.close(resolve));
    context.db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
