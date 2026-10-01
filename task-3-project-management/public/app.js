const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icon = (name) => `<i data-lucide="${name}"></i>`;
const icons = () => window.lucide?.createIcons();
const STATUS = {
  backlog: "To do",
  progress: "In progress",
  review: "In review",
  done: "Done",
};
const PRIORITY = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};
const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
const avatar = (u, size = "") =>
  u
    ? `<span class="avatar ${size}" style="--avatar:${esc(u.color)}" title="${esc(u.name)}">${esc(initials(u.name))}</span>`
    : `<span class="avatar ${size}" style="--avatar:#c2c8d4" title="Unassigned">${icon("user-round")}</span>`;
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateLabel = (date) =>
  date
    ? new Date(date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No date";
const timeLabel = (date) =>
  new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
let state,
  socket,
  page = "board",
  activeId = localStorage.getItem("ca_project"),
  view = "board",
  query = "",
  assignee = "",
  priority = "",
  calendarDate = new Date(),
  authMode = "login",
  toastTimer,
  refreshTimer,
  refreshPromise,
  drawerChecklist = [],
  editingId = null;
let sortables = [];
let mobileLane = "backlog";
let filtersOpen = false;
let taskOrder = "manual";
async function api(url, method = "GET", body) {
  const res = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith("/auth/")) showAuth();
    if (res.status === 409 && state) await refresh(false);
    const error = Error(data.error || "Unable to complete this action.");
    error.status = res.status;
    throw error;
  }
  return data;
}
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
}
function currentProject() {
  return state?.projects.find((p) => p.id === activeId);
}
function projectOf(t) {
  return state.projects.find((p) => p.id === t.projectId);
}
function assigneeOf(t) {
  return projectOf(t)?.members.find((u) => u.id === t.assigneeId);
}
function progress(tasks) {
  return tasks.length
    ? Math.round(
        (tasks.filter((t) => t.status === "done").length / tasks.length) * 100,
      )
    : 0;
}
function iconButton(name, action, label, extra = "") {
  return `<button type="button" class="icon-button" data-action="${action}" title="${label}" aria-label="${label}" ${extra}>${icon(name)}</button>`;
}
function priorityHTML(p) {
  return `<span class="priority ${p}">${icon(p === "urgent" ? "flag" : p === "high" ? "signal-high" : p === "medium" ? "signal-medium" : "signal-low")}${PRIORITY[p]}</span>`;
}
function dueHTML(t) {
  return `<span class="due ${t.dueDate && t.dueDate < dateKey(new Date()) && t.status !== "done" ? "overdue" : ""}">${icon("calendar-days")}${dateLabel(t.dueDate)}</span>`;
}
function membersHTML(members) {
  return `<div class="avatar-group">${members
    .slice(0, 3)
    .map((u) => avatar(u))
    .join(
      "",
    )}${members.length > 3 ? `<span class="avatar more">+${members.length - 3}</span>` : ""}</div>`;
}
function labelHTML(label) {
  return `<span class="label-tag label-${["Design", "Development", "Research", "Content", "Planning"].includes(label) ? label.toLowerCase() : "other"}">${esc(label)}</span>`;
}
function empty(title, copy, button = "") {
  return `<div class="empty-state">${icon("inbox")}<h2>${title}</h2><p>${copy}</p>${button}</div>`;
}
function openModal(html, drawer = false) {
  const modal = $("#modal");
  modal.classList.toggle("task-drawer", drawer);
  $("#modal-content").innerHTML = html;
  if (!modal.open) modal.showModal();
  icons();
}
function closeModal() {
  $("#modal").close();
  editingId = null;
  if (state) renderMain();
}
function modalHeader(title) {
  return `<div class="modal-header"><h2>${title}</h2>${iconButton("x", "close-modal", "Close dialog")}</div>`;
}
function modalError(form, error) {
  let el = form.querySelector(".form-error");
  if (!el) {
    el = document.createElement("p");
    el.className = "form-error";
    el.setAttribute("role", "alert");
    form.append(el);
  }
  el.textContent = error.message;
  if (error.status === 409 && form.id === "task-form") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button small";
    button.dataset.action = "reload-task";
    button.textContent = "Load latest task";
    el.append(document.createElement("br"), button);
  }
}
function formValues(form) {
  return Object.fromEntries(new FormData(form));
}
async function submit(form, action) {
  const button = form.querySelector("[type=submit]");
  if (button) button.disabled = true;
  try {
    await action();
  } catch (e) {
    modalError(form, e);
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}
function showAuth() {
  socket?.disconnect();
  socket = null;
  state = null;
  $("#app").hidden = true;
  $("#auth-screen").hidden = false;
  $("#modal").close();
  $("#sidebar").classList.remove("open");
  $("#sidebar-shade").hidden = true;
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event("scene-visibility"));
}
function connect() {
  socket?.disconnect();
  socket = io();
  socket.on("connect", () => {
    $("#connection").className = "connection live";
    $("#connection").innerHTML = "<span></span>Live sync";
  });
  socket.on("disconnect", () => {
    $("#connection").className = "connection";
    $("#connection").innerHTML = "<span></span>Reconnecting";
  });
  socket.on("changed", () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () => refresh().catch((e) => toast(e.message)),
      150,
    );
  });
}
async function refresh(render = true) {
  if (!refreshPromise)
    refreshPromise = api("/state").finally(() => (refreshPromise = null));
  state = await refreshPromise;
  if (!state.projects.some((p) => p.id === activeId))
    activeId = state.projects[0]?.id || null;
  if (!activeId && page === "board") page = "overview";
  if (render) {
    renderSidebar();
    if (!$("#modal").open) renderMain();
    else if (editingId && $("#comment-list")) {
      const t = state.tasks.find((t) => t.id === editingId);
      if (t) {
        $("#comment-list").innerHTML =
          t.comments.map(commentHTML).join("") ||
          '<p class="form-note">Start the conversation.</p>';
        icons();
      } else {
        closeModal();
        toast("This task was removed by a teammate.");
      }
    }
  }
}
async function enterWorkspace() {
  await refresh(false);
  $("#auth-screen").hidden = true;
  $("#app").hidden = false;
  renderSidebar();
  renderMain();
  connect();
  window.scrollTo(0, 0);
  window.dispatchEvent(new Event("scene-visibility"));
}
function renderSidebar() {
  $("#project-nav").innerHTML =
    state.projects
      .map(
        (p) =>
          `<button data-project="${p.id}" class="${page === "board" && p.id === activeId ? "active" : ""}"><span class="project-dot" style="background:${p.color}"></span><span>${esc(p.name)}</span></button>`,
      )
      .join("") || '<span class="no-results">No projects yet</span>';
  document
    .querySelectorAll(".main-nav [data-nav]")
    .forEach((b) =>
      b.classList.toggle(
        "active",
        b.dataset.nav === page ||
          (b.dataset.nav === "overview" && page === "board"),
      ),
    );
  $("#my-count").textContent =
    state.tasks.filter(
      (t) => t.assigneeId === state.user.id && t.status !== "done",
    ).length || "";
  const unread = state.notifications.filter((n) => !n.read).length;
  $("#inbox-count").textContent = unread || "";
  $("#bell-dot").textContent = unread ? "New" : "";
  $("#profile").innerHTML =
    `${avatar(state.user)}<span class="user-name">${esc(state.user.name)}<small>${state.user.id.startsWith("demo-") ? "Demo workspace" : "Personal account"}</small></span>${iconButton("log-out", "logout", "Sign out")}`;
  $("#top-avatar").innerHTML = avatar(state.user);
  icons();
}
function navigate(to, projectId) {
  page = to;
  if (projectId) {
    activeId = projectId;
    localStorage.setItem("ca_project", activeId);
    query = "";
    assignee = "";
    priority = "";
  }
  $("#sidebar").classList.remove("open");
  $("#sidebar-shade").hidden = true;
  renderSidebar();
  renderMain();
  window.scrollTo(0, 0);
}
function renderMain() {
  sortables.forEach((s) => s.destroy());
  sortables = [];
  const p = currentProject();
  $("#breadcrumb-title").textContent =
    page === "board"
      ? p?.name || "Projects"
      : {
          overview: "Overview",
          "my-tasks": "My tasks",
          inbox: "Inbox",
          team: "Project members",
        }[page] || "Workspace";
  $("#footer-status").textContent =
    `${state.projects.length} projects / ${state.tasks.filter((t) => t.status !== "done").length} open tasks`;
  if (page === "board" && p) renderProject(p);
  else if (page === "my-tasks") renderMyTasks();
  else if (page === "inbox") renderInbox();
  else if (page === "team") renderTeam();
  else renderOverview();
  icons();
}
function renderProject(p) {
  const tasks = state.tasks.filter((t) => t.projectId === p.id);
  const finished = tasks.filter((t) => t.status === "done").length;
  const pct = progress(tasks);
  $("#main").innerHTML = `
    <section class="project-heading">
      <div class="heading-main">
        <div class="heading-title"><span class="project-emblem" style="--project-color:${p.color}">${icon("panels-top-left")}</span><div><h1>${esc(p.name)}</h1><p>${esc(p.description || "Plan the work. Build something great.")}</p></div></div>
        <div class="heading-actions">${membersHTML(p.members)}<button class="button" data-action="invite">${icon("user-plus")}Invite people</button>${iconButton("ellipsis", "project-settings", "Project settings")}</div>
      </div>
      <div class="project-navigation"><nav class="project-tabs" aria-label="Project view">${[
        ["overview", "chart-no-axes-combined", "Overview"],
        ["board", "columns-3", "Board"],
        ["list", "list", "List"],
        ["calendar", "calendar-days", "Calendar"],
      ]
        .map(
          ([id, i, label]) =>
            `<button data-view="${id}" class="${view === id ? "active" : ""}" aria-current="${view === id ? "page" : "false"}">${icon(i)}${label}</button>`,
        )
        .join(
          "",
        )}<button data-action="team">${icon("users-round")}People</button></nav><div class="project-completion"><span>${finished}/${tasks.length} done</span><span class="progress-line"><span style="width:${pct}%"></span></span><b>${pct}%</b></div></div>
    </section>
    ${
      view === "overview"
        ? ""
        : `<div class="board-toolbar"><div class="toolbar-left"><button class="button primary" data-action="new-task">${icon("plus")}Add task</button><label class="search-field">${icon("search")}<input id="task-search" type="search" placeholder="Search this project" aria-label="Search tasks" value="${esc(query)}"></label></div><div class="toolbar-right"><button class="button filter-toggle ${filtersOpen ? "selected" : ""}" data-action="toggle-filters" aria-expanded="${filtersOpen}">${icon("sliders-horizontal")}Filter${assignee || priority ? '<span class="filter-indicator"></span>' : ""}</button><label class="sort-field">${icon("arrow-down-wide-narrow")}<select id="task-sort" aria-label="Sort tasks"><option value="manual" ${taskOrder === "manual" ? "selected" : ""}>Sort</option><option value="due" ${taskOrder === "due" ? "selected" : ""}>Due date</option><option value="priority" ${taskOrder === "priority" ? "selected" : ""}>Priority</option><option value="recent" ${taskOrder === "recent" ? "selected" : ""}>Newest</option></select></label></div></div><div class="advanced-filters" ${filtersOpen ? "" : "hidden"}><label>Assignee<select id="assignee-filter" aria-label="Filter by assignee"><option value="">Everyone</option><option value="mine" ${assignee === "mine" ? "selected" : ""}>Assigned to me</option><option value="unassigned" ${assignee === "unassigned" ? "selected" : ""}>Unassigned</option>${p.members.map((u) => `<option value="${u.id}" ${assignee === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label><label>Priority<select id="priority-filter" aria-label="Filter by priority"><option value="">All priorities</option>${Object.entries(
            PRIORITY,
          )
            .map(
              ([id, label]) =>
                `<option value="${id}" ${priority === id ? "selected" : ""}>${label}</option>`,
            )
            .join(
              "",
            )}</select></label><button class="text-button" data-action="clear-filters">Clear filters</button></div>`
    }
    <section id="project-content"></section>`;
  renderProjectContent();
}
function filteredTasks() {
  const tasks = state.tasks.filter(
    (t) =>
      t.projectId === activeId &&
      (!query ||
        `${t.title} ${t.description} ${t.label} ${projectOf(t).prefix}-${t.number}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!priority || t.priority === priority) &&
      (!assignee ||
        (assignee === "mine"
          ? t.assigneeId === state.user.id
          : assignee === "unassigned"
            ? !t.assigneeId
            : t.assigneeId === assignee)),
  );
  if (taskOrder === "due")
    tasks.sort((a, b) =>
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
    );
  if (taskOrder === "priority") {
    const order = { urgent: 0, high: 1, medium: 2, low: 3 };
    tasks.sort((a, b) => order[a.priority] - order[b.priority]);
  }
  if (taskOrder === "recent")
    tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tasks;
}
function renderProjectContent() {
  sortables.forEach((s) => s.destroy());
  sortables = [];
  const tasks = filteredTasks(),
    container = $("#project-content");
  if (!container) return;
  if (view === "board") {
    container.className = "kanban-wrap";
    container.innerHTML = `<nav class="mobile-lanes" aria-label="Board status">${Object.entries(
      { backlog: "To do", progress: "Doing", review: "Review", done: "Done" },
    )
      .map(
        ([id, label]) =>
          `<button data-lane="${id}" class="${id === mobileLane ? "active" : ""}" aria-pressed="${id === mobileLane}">${label}<span>${tasks.filter((t) => t.status === id).length}</span></button>`,
      )
      .join("")}</nav><div class="kanban">${Object.entries(STATUS)
      .map(
        ([status, label]) =>
          `<section class="kanban-column" data-lane-active="${status === mobileLane}"><div class="column-heading ${status}"><span class="status-dot"></span>${label}<span class="count">${tasks.filter((t) => t.status === status).length}</span>${iconButton("plus", "new-task", `Add task to ${label}`, `data-status="${status}"`)}</div><div class="task-stack" data-status="${status}">${tasks
            .filter((t) => t.status === status)
            .map(taskCard)
            .join(
              "",
            )}</div><button class="add-task" data-action="new-task" data-status="${status}">${icon("plus")}Add task</button></section>`,
      )
      .join("")}</div>`;
    container.querySelectorAll(".task-stack").forEach((el) =>
      sortables.push(
        new Sortable(el, {
          group: "tasks",
          animation: 170,
          ghostClass: "sort-ghost",
          chosenClass: "sort-chosen",
          delay: 120,
          delayOnTouchOnly: true,
          onEnd: async (event) => {
            const t = state.tasks.find((t) => t.id === event.item.dataset.task);
            if (!t || event.to.dataset.status === t.status) {
              renderProjectContent();
              return;
            }
            try {
              await api("/tasks/" + t.id, "PATCH", {
                version: t.version,
                status: event.to.dataset.status,
              });
              await refresh();
              toast("Task moved to " + STATUS[event.to.dataset.status]);
            } catch (e) {
              toast(e.message);
              await refresh();
            }
          },
        }),
      ),
    );
  } else if (view === "overview") {
    container.className = "project-overview";
    container.innerHTML = projectOverviewHTML(currentProject());
  } else if (view === "list") {
    container.className = "list-area";
    container.innerHTML = taskTable(tasks);
  } else {
    container.className = "calendar-area";
    container.innerHTML = calendarHTML(tasks);
  }
  icons();
}
function taskCard(t) {
  const p = projectOf(t),
    u = assigneeOf(t);
  const photos = {
    architecture: "photo-1600607687920-4e2a09cf159d",
    desk: "photo-1497366754035-f200968a6e72",
  };
  return `<article class="task-card ${t.status === "done" ? "completed" : ""}" tabindex="0" role="button" aria-label="Open ${esc(t.title)}" data-task="${t.id}">
 ${photos[t.cover] ? `<img class="task-cover" src="https://images.unsplash.com/${photos[t.cover]}?auto=format&fit=crop&w=600&q=80" alt="${t.cover === "architecture" ? "Homepage art direction: contemporary interior" : "Studio workspace photography"}" loading="lazy">` : ""}
 <div class="task-card-content"><div class="task-topline"><span class="task-code">${esc(p.prefix)}-${String(t.number).padStart(2, "0")}</span>${priorityHTML(t.priority)}</div>
 <div class="task-title-row">${icon(t.status === "done" ? "circle-check" : "circle")}<h3>${esc(t.title)}</h3></div>
 <div class="task-labels">${labelHTML(t.label)}${t.checklist.length ? `<span class="task-counter">${icon("list-checks")}${t.checklist.filter((c) => c.done).length}/${t.checklist.length}</span>` : ""}</div>
 <div class="task-bottom"><span class="task-assignee">${avatar(u, "sm")}<span>${esc(u?.name.split(" ")[0] || "Unassigned")}</span></span><div class="task-foot-right">${t.comments.length ? `<span class="task-counter">${icon("message-square")}${t.comments.length}</span>` : ""}${dueHTML(t)}</div></div></div></article>`;
}
function projectOverviewHTML(p) {
  const tasks = state.tasks.filter((t) => t.projectId === p.id),
    open = tasks.filter((t) => t.status !== "done"),
    overdue = open.filter((t) => t.dueDate && t.dueDate < dateKey(new Date()));
  return `<div class="project-summary"><section class="summary-main"><span class="eyebrow">PROJECT BRIEF</span><h2>${esc(p.name)}</h2><p>${esc(p.description || "Add a project description in settings.")}</p><div class="summary-metrics"><div><strong>${tasks.length}</strong><span>Total tasks</span></div><div><strong>${open.length}</strong><span>In flight</span></div><div><strong>${overdue.length}</strong><span>Overdue</span></div><div><strong>${progress(tasks)}%</strong><span>Complete</span></div></div><div class="section-label"><h2>Upcoming deadlines</h2></div>${taskTable(
    open
      .filter((t) => t.dueDate)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 6),
  )}</section><aside class="summary-aside"><h3>Project team</h3>${p.members.map((u) => `<div class="summary-person">${avatar(u)}<div><strong>${esc(u.name)}</strong><span>${u.id === p.ownerId ? "Project owner" : "Team member"}</span></div></div>`).join("")}<div class="section-label"><h3>Task breakdown</h3></div>${Object.entries(
    STATUS,
  )
    .map(
      ([id, label]) =>
        `<div class="summary-status"><span class="status-dot ${id}"></span><span>${label}</span><strong>${tasks.filter((t) => t.status === id).length}</strong></div>`,
    )
    .join("")}</aside></div>`;
}
function workspaceSearch() {
  openModal(
    `${modalHeader("Search workspace")}<div class="modal-body"><label class="search-field workspace-search-input">${icon("search")}<input id="workspace-query" type="search" placeholder="Search tasks or projects" aria-label="Search all tasks and projects" autofocus></label><div id="workspace-results" class="workspace-results"></div></div>`,
  );
  renderSearchResults("");
  $("#workspace-query").focus();
}
function renderSearchResults(value) {
  const q = value.trim().toLowerCase();
  const projects = state.projects.filter((p) =>
    p.name.toLowerCase().includes(q),
  );
  const tasks = state.tasks
    .filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q))
    .slice(0, 12);
  $("#workspace-results").innerHTML =
    `<span class="eyebrow">PROJECTS</span>${projects.map((p) => `<button class="search-result" data-project="${p.id}">${icon("folder")}<span>${esc(p.name)}</span>${icon("arrow-up-right")}</button>`).join("")}<span class="eyebrow">TASKS</span>${tasks.map((t) => `<button class="search-result" data-task="${t.id}">${icon("circle-check")}<span>${esc(t.title)}<small>${esc(projectOf(t).name)}</small></span>${icon("arrow-up-right")}</button>`).join("")}${!tasks.length && !projects.length ? '<p class="form-note">No matching projects or tasks.</p>' : ""}`;
  icons();
}
function taskTable(tasks) {
  if (!tasks.length)
    return empty("Nothing here yet", "No tasks match this view.");
  return `<div class="task-list"><table class="task-table"><thead><tr><th>TASK</th><th>STATUS</th><th>PRIORITY</th><th>ASSIGNEE</th><th>DUE DATE</th></tr></thead><tbody>${tasks.map((t) => `<tr tabindex="0" data-task="${t.id}" aria-label="Open ${esc(t.title)}"><td class="title-cell"><span class="task-code">${esc(projectOf(t).prefix)}-${String(t.number).padStart(2, "0")}</span><strong>${esc(t.title)}</strong></td><td><span class="status-pill ${t.status}">${STATUS[t.status]}</span></td><td>${priorityHTML(t.priority)}</td><td>${avatar(assigneeOf(t), "sm")} <span>${esc(assigneeOf(t)?.name.split(" ")[0] || "Unassigned")}</span></td><td>${dueHTML(t)}</td></tr>`).join("")}</tbody></table></div>`;
}
function calendarHTML(tasks) {
  const year = calendarDate.getFullYear(),
    month = calendarDate.getMonth(),
    first = new Date(year, month, 1),
    start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  return `<div class="calendar-nav"><h2>${calendarDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2><div><button class="button small" data-action="calendar-today">Today</button>${iconButton("chevron-left", "calendar-prev", "Previous month")}${iconButton("chevron-right", "calendar-next", "Next month")}</div></div><div class="calendar">${["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => `<div class="calendar-weekday">${d}</div>`).join("")}${Array.from(
    { length: 42 },
    (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      return `<div class="calendar-day ${d.getMonth() !== month ? "outside" : ""} ${key === dateKey(new Date()) ? "today" : ""}"><span class="calendar-date">${d.getDate()}</span>${tasks
        .filter((t) => t.dueDate === key)
        .map(
          (t) =>
            `<button class="calendar-task" data-task="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`,
        )
        .join("")}</div>`;
    },
  ).join(
    "",
  )}</div><p class="form-note">${tasks.filter((t) => !t.dueDate).length} tasks without a due date.</p>`;
}
function renderOverview() {
  const pending = state.tasks.filter((t) => t.status !== "done"),
    done = state.tasks.filter((t) => t.status === "done");
  $("#main").innerHTML =
    `<section class="section-page"><div class="page-top"><div><span class="eyebrow">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()}</span><h1>Your workspace</h1></div><button class="button primary" data-action="new-project">${icon("plus")}New project</button></div><section class="overview-intro"><div><span class="eyebrow">A FRESH PERSPECTIVE</span><h2>Let's make progress, ${esc(state.user.name.split(" ")[0])}.</h2><p>${pending.length ? "A little clarity for everything you are working on." : "Your next chapter starts with a project."}</p></div><div class="overview-stats"><div class="overview-stat"><strong>${state.projects.length.toString().padStart(2, "0")}</strong><span>Active projects</span></div><div class="overview-stat"><strong>${pending.length.toString().padStart(2, "0")}</strong><span>Open tasks</span></div><div class="overview-stat"><strong>${done.length.toString().padStart(2, "0")}</strong><span>Completed</span></div></div></section><div class="section-label"><h2>Projects</h2><span>${state.projects.length} TOTAL</span></div>${
      state.projects.length
        ? `<div class="project-grid">${state.projects
            .map((p) => {
              const tasks = state.tasks.filter((t) => t.projectId === p.id);
              return `<button class="project-item" data-project="${p.id}"><span class="project-emblem" style="color:${p.color}">${icon("folder-kanban")}</span><h3>${esc(p.name)}</h3><p>${esc(p.description || "A new project, ready for your ideas.")}</p><div class="progress-line"><span style="width:${progress(tasks)}%;background:${p.color}"></span></div><div class="project-item-bottom"><span>${tasks.filter((t) => t.status === "done").length}/${tasks.length} tasks</span>${membersHTML(p.members)}</div></button>`;
            })
            .join("")}</div>`
        : empty(
            "Start something good",
            "Create a project and bring your team together.",
            `<button class="button primary" data-action="new-project">${icon("plus")}Create project</button>`,
          )
    }<div class="section-label"><h2>On your radar</h2><span>ASSIGNED TO YOU</span></div>${taskTable(
      pending
        .filter((t) => t.assigneeId === state.user.id)
        .sort((a, b) =>
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999"),
        )
        .slice(0, 5),
    )}</section>`;
}
function renderMyTasks() {
  const tasks = state.tasks.filter((t) => t.assigneeId === state.user.id);
  $("#main").innerHTML =
    `<section class="section-page"><div class="page-top"><div><span class="eyebrow">YOUR PERSONAL VIEW</span><h1>My tasks</h1><p>${tasks.filter((t) => t.status !== "done").length} open tasks across your projects.</p></div>${avatar(state.user, "lg")}</div>${taskTable(tasks.sort((a, b) => (a.status === "done") - (b.status === "done") || (a.dueDate || "9999").localeCompare(b.dueDate || "9999")))}</section>`;
}
function renderInbox() {
  $("#main").innerHTML =
    `<section class="section-page"><div class="page-top"><div><span class="eyebrow">STAY IN THE LOOP</span><h1>Inbox</h1><p>The latest from your projects.</p></div><button class="button small" data-action="read-all">${icon("check-check")}Mark all read</button></div>${state.notifications.length ? `<div class="inbox-list">${state.notifications.map((n) => `<button class="notification ${n.read ? "" : "unread"}" ${n.taskId ? `data-task="${n.taskId}"` : `data-project="${n.projectId}"`}><span class="icon-button">${icon("message-square")}</span><span><strong>${esc(n.body)}</strong><small>${esc(state.projects.find((p) => p.id === n.projectId)?.name || "Project")} &middot; ${timeLabel(n.createdAt)}</small></span></button>`).join("")}</div>` : empty("All caught up", "Updates from your teammates will appear here.")}</section>`;
}
function renderTeam() {
  const p = currentProject();
  $("#main").innerHTML =
    `<section class="section-page"><div class="page-top"><div><span class="eyebrow">${esc(p?.name.toUpperCase() || "WORKSPACE")}</span><h1>Better together.</h1><p>People making this project happen.</p></div>${p ? '<button class="button primary" data-action="invite">' + icon("user-plus") + "Add teammate</button>" : ""}</div>${p ? `<div class="team-grid">${p.members.map((u) => `<article class="member-card">${avatar(u, "lg")}<h3>${esc(u.name)}</h3><p>${esc(u.email)}</p><small>${u.id === p.ownerId ? "PROJECT OWNER" : "MEMBER"} / ${state.tasks.filter((t) => t.projectId === p.id && t.assigneeId === u.id && t.status !== "done").length} OPEN TASKS</small></article>`).join("")}</div>` : empty("No project selected", "Create a project before adding your team.")}</section>`;
}
function newProjectModal() {
  openModal(
    `${modalHeader("A new beginning")}<div class="modal-body"><form id="project-form"><label>Project name<input name="name" placeholder="e.g. Summer campaign" required maxlength="80"></label><div class="form-row"><label class="field-label">Project code<input name="prefix" placeholder="SUM" pattern="[A-Za-z]{2,5}" maxlength="5" required></label><div><span class="field-label">Project color</span><div class="color-options">${["#3659e3", "#b26941", "#398477", "#a35e89"].map((c, i) => `<label><input type="radio" name="color" value="${c}" ${!i ? "checked" : ""} aria-label="${["Blue", "Terracotta", "Green", "Rose"][i]}"><span style="--swatch:${c}"></span></label>`).join("")}</div></div></div><label>Description<textarea name="description" placeholder="What are we working towards?" maxlength="600"></textarea></label><div class="form-actions"><button class="button" type="button" data-action="close-modal">Cancel</button><button class="button primary" type="submit">Create project${icon("arrow-right")}</button></div></form></div>`,
  );
}
function inviteModal() {
  const p = currentProject();
  if (!p) {
    toast("Create a project first.");
    return;
  }
  if (p.ownerId !== state.user.id) {
    toast("Only the project owner can add members.");
    return;
  }
  openModal(
    `${modalHeader("Bring your team together")}<div class="modal-body"><form id="invite-form"><label>Email address<input type="email" name="email" placeholder="teammate@company.com" required></label><p class="form-note">Add an existing CodeAlpha Projects account to <strong>${esc(p.name)}</strong>. Your teammate needs to register first. This adds them directly; no email invitation is sent.</p><div class="form-actions"><button class="button primary" type="submit">${icon("user-plus")}Add to project</button></div></form></div>`,
  );
}
function projectSettings() {
  const p = currentProject();
  if (!p) return;
  if (p.ownerId !== state.user.id) {
    toast("Only the project owner can change project settings.");
    return;
  }
  openModal(
    `${modalHeader("Project settings")}<div class="modal-body"><form id="settings-form"><label>Project name<input name="name" value="${esc(p.name)}" required maxlength="80"></label><label>Description<textarea name="description" maxlength="600">${esc(p.description)}</textarea></label><div class="form-actions"><button class="button primary" type="submit">Save changes</button></div></form><div class="danger-zone"><button class="button danger small" data-action="delete-project">${icon("trash-2")}Delete project</button></div></div>`,
  );
}
function taskModal(id, status = "backlog") {
  const t = state.tasks.find((t) => t.id === id),
    p = t ? projectOf(t) : currentProject();
  if (!p) {
    toast("Create a project first.");
    return;
  }
  editingId = t?.id || null;
  drawerChecklist = structuredClone(t?.checklist || []);
  openModal(
    `<div class="modal-header"><span>${esc(p.prefix)} / ${t ? `${esc(p.prefix)}-${String(t.number).padStart(2, "0")}` : "NEW TASK"}</span><div>${t ? iconButton("trash-2", "delete-task", "Delete task") : ""}${iconButton("x", "close-modal", "Close task")}</div></div><div class="modal-body"><form id="task-form" data-project="${p.id}" data-version="${t?.version || 0}"><label class="sr-label" hidden for="task-title">Task title</label><textarea id="task-title" name="title" class="task-title-input" aria-label="Task title" placeholder="What needs to get done?" required maxlength="160">${esc(t?.title || "")}</textarea><div class="task-field-grid"><label>Status<select name="status">${Object.entries(
      STATUS,
    )
      .map(
        ([v, n]) =>
          `<option value="${v}" ${(t?.status || status) === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Priority<select name="priority">${Object.entries(
      PRIORITY,
    )
      .map(
        ([v, n]) =>
          `<option value="${v}" ${(t?.priority || "medium") === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Assignee<select name="assigneeId"><option value="">Unassigned</option>${p.members.map((u) => `<option value="${u.id}" ${t?.assigneeId === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select></label><label>Due date<input type="date" name="dueDate" value="${t?.dueDate || ""}"></label><label>Label<input name="label" list="labels" value="${esc(t?.label || "Planning")}" maxlength="30"><datalist id="labels">${["Design", "Development", "Research", "Content", "Planning"].map((l) => `<option value="${l}">`).join("")}</datalist></label></div><h3>${icon("align-left")}Description</h3><textarea name="description" aria-label="Task description" placeholder="Add context, a brief, or useful links..." maxlength="5000">${esc(t?.description || "")}</textarea><h3>${icon("list-checks")}Checklist</h3><div id="checklist" class="checklist"></div><div class="add-checklist"><input id="checklist-input" placeholder="Add a checklist item" aria-label="New checklist item" maxlength="180">${iconButton("plus", "add-checklist", "Add checklist item")}</div><div class="task-save"><small>${t ? "Updated " + timeLabel(t.updatedAt) : "Small steps. Real progress."}</small><button class="button primary" type="submit">${icon("check")}${t ? "Save changes" : "Create task"}</button></div></form>${t ? `<section class="comments-section"><h3>${icon("messages-square")}Conversation <span class="muted">(${t.comments.length})</span></h3><div id="comment-list">${t.comments.map((c) => `<article class="comment">${avatar(c, "sm")}<div><strong>${esc(c.name)}</strong><small>${timeLabel(c.createdAt)}</small><p>${esc(c.body)}</p></div></article>`).join("") || '<p class="form-note">Start the conversation.</p>'}</div><form class="comment-form" id="comment-form"><textarea name="body" aria-label="Write a comment" placeholder="Share an update or ask a question..." required maxlength="2000"></textarea><button class="button" type="submit">${icon("send")}Send comment</button></form></section>` : ""}</div>`,
    true,
  );
  renderChecklist();
}
function renderChecklist() {
  $("#checklist").innerHTML = drawerChecklist
    .map(
      (c) =>
        `<label class="checklist-item"><input type="checkbox" data-check="${c.id}" ${c.done ? "checked" : ""}><span>${esc(c.text)}</span>${iconButton("x", "remove-check", "Remove checklist item", `data-id="${c.id}"`)}</label>`,
    )
    .join("");
  icons();
}
function commentHTML(c) {
  return `<article class="comment">${avatar(c, "sm")}<div><strong>${esc(c.name)}</strong><small>${timeLabel(c.createdAt)}</small><p>${esc(c.body)}</p></div></article>`;
}
function confirmDelete(type) {
  const t = state.tasks.find((t) => t.id === editingId),
    p = currentProject();
  const id = type === "task" ? t?.id : p?.id;
  if (!id) return;
  openModal(
    `${modalHeader(`Delete ${type}?`)}<div class="modal-body"><p class="form-note">${esc(type === "task" ? t.title : p.name)} and its ${type === "task" ? "comments" : "tasks and comments"} will be permanently deleted. This cannot be undone.</p><form id="delete-form" data-type="${type}" data-id="${id}"><div class="form-actions"><button class="button" type="button" data-action="close-modal">Keep ${type}</button><button class="button danger" type="submit">Delete ${type}</button></div></form></div>`,
  );
}

document.addEventListener("click", async (e) => {
  const button = e.target.closest("button,[data-task],[data-project]");
  if (!button) return;
  try {
    if (button.dataset.nav) {
      navigate(button.dataset.nav);
      return;
    }
    if (button.dataset.project && button.tagName !== "FORM") {
      if ($("#modal").open) closeModal();
      navigate("board", button.dataset.project);
      return;
    }
    if (button.dataset.lane) {
      mobileLane = button.dataset.lane;
      renderProjectContent();
      return;
    }
    if (button.dataset.view) {
      view = button.dataset.view;
      renderMain();
      return;
    }
    if (button.dataset.task) {
      if (!state.tasks.some((t) => t.id === button.dataset.task)) {
        toast("This task is no longer available.");
        return;
      }
      taskModal(button.dataset.task);
      return;
    }
    switch (button.dataset.action) {
      case "workspace-search":
        workspaceSearch();
        break;
      case "account":
        openModal(
          `${modalHeader("Your account")}<div class="modal-body"><div class="account-detail">${avatar(state.user, "lg")}<div><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p></div></div><p class="form-note">${state.user.id.startsWith("demo-") ? "You are using the shared demonstration workspace." : "Your projects are visible only to their members."}</p><button class="button" data-action="logout">${icon("log-out")}Sign out</button></div>`,
        );
        break;
      case "close-projects":
        $("#sidebar").classList.remove("open");
        $("#sidebar-shade").hidden = true;
        break;
      case "toggle-filters":
        filtersOpen = !filtersOpen;
        renderMain();
        break;
      case "clear-filters":
        assignee = "";
        priority = "";
        query = "";
        renderMain();
        break;
      case "close-modal":
        closeModal();
        break;
      case "reload-task":
        taskModal(editingId);
        break;
      case "new-project":
        newProjectModal();
        break;
      case "new-task":
        taskModal(null, button.dataset.status);
        break;
      case "invite":
        inviteModal();
        break;
      case "project-settings":
        projectSettings();
        break;
      case "delete-task":
        confirmDelete("task");
        break;
      case "delete-project":
        confirmDelete("project");
        break;
      case "team":
        navigate("team");
        break;
      case "logout":
        await api("/auth/logout", "POST", {});
        showAuth();
        toast("You have signed out.");
        break;
      case "read-all":
        await api("/notifications", "PATCH", {});
        await refresh();
        toast("Inbox marked as read.");
        break;
      case "calendar-prev":
        calendarDate.setMonth(calendarDate.getMonth() - 1, 1);
        renderProjectContent();
        break;
      case "calendar-next":
        calendarDate.setMonth(calendarDate.getMonth() + 1, 1);
        renderProjectContent();
        break;
      case "calendar-today":
        calendarDate = new Date();
        renderProjectContent();
        break;
      case "add-checklist": {
        const input = $("#checklist-input");
        if (!input.value.trim()) return;
        if (drawerChecklist.length >= 40) {
          toast("Maximum 40 checklist items.");
          return;
        }
        drawerChecklist.push({
          id: crypto.randomUUID(),
          text: input.value.trim(),
          done: false,
        });
        input.value = "";
        renderChecklist();
        break;
      }
      case "remove-check":
        e.preventDefault();
        drawerChecklist = drawerChecklist.filter(
          (c) => c.id !== button.dataset.id,
        );
        renderChecklist();
        break;
      case "about":
        openModal(
          `${modalHeader("CodeAlpha Projects")}<div class="modal-body"><p class="form-note">A shared space for focused work and thoughtful collaboration.</p><p class="form-note">Projects are visible only to their members. Project owners manage membership. Anyone in a project can edit tasks and join the conversation.</p><p class="form-note">The demo workspace is shared. Use a personal account for your own projects, and keep sensitive information out of the demo.</p><p class="subtle-note">CODEALPHA / PROJECTS / 1.0</p></div>`,
        );
        break;
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-task]") && ["Enter", " "].includes(e.key)) {
    e.preventDefault();
    taskModal(e.target.dataset.task);
  }
  if (e.target.id === "checklist-input" && e.key === "Enter") {
    e.preventDefault();
    document.querySelector("[data-action=add-checklist]").click();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "workspace-query") renderSearchResults(e.target.value);
  if (e.target.id === "task-search") {
    query = e.target.value;
    renderProjectContent();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "task-sort") {
    taskOrder = e.target.value;
    renderProjectContent();
  }
  if (e.target.id === "assignee-filter") {
    assignee = e.target.value;
    renderProjectContent();
  }
  if (e.target.id === "priority-filter") {
    priority = e.target.value;
    renderProjectContent();
  }
  if (e.target.dataset.check) {
    const c = drawerChecklist.find((c) => c.id === e.target.dataset.check);
    if (c) c.done = e.target.checked;
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target;
  if (
    ![
      "auth-form",
      "project-form",
      "invite-form",
      "settings-form",
      "task-form",
      "comment-form",
      "delete-form",
    ].includes(form.id)
  )
    return;
  e.preventDefault();
  submit(form, async () => {
    const values = formValues(form);
    if (form.id === "auth-form") {
      await api("/auth/" + authMode, "POST", values);
      await enterWorkspace();
      return;
    }
    if (form.id === "project-form") {
      const result = await api("/projects", "POST", values);
      await refresh(false);
      activeId = result.id;
      page = "board";
      query = "";
      assignee = "";
      priority = "";
      closeModal();
      renderSidebar();
      toast("Project created.");
    }
    if (form.id === "invite-form") {
      await api("/projects/" + activeId + "/members", "POST", values);
      await refresh(false);
      closeModal();
      toast("Teammate added to the project.");
    }
    if (form.id === "settings-form") {
      await api("/projects/" + activeId, "PATCH", values);
      await refresh(false);
      closeModal();
      renderSidebar();
      toast("Project updated.");
    }
    if (form.id === "task-form") {
      const id = editingId;
      values.checklist = drawerChecklist;
      values.version = Number(form.dataset.version);
      await api(
        id ? "/tasks/" + id : "/projects/" + form.dataset.project + "/tasks",
        id ? "PATCH" : "POST",
        values,
      );
      await refresh(false);
      closeModal();
      renderSidebar();
      toast(id ? "Task updated." : "Task created.");
    }
    if (form.id === "comment-form") {
      const id = editingId;
      await api("/tasks/" + id + "/comments", "POST", values);
      await refresh(false);
      const t = state.tasks.find((t) => t.id === id);
      const list = $("#comment-list");
      list.innerHTML = t.comments
        .map(
          (c) =>
            `<article class="comment">${avatar(c, "sm")}<div><strong>${esc(c.name)}</strong><small>${timeLabel(c.createdAt)}</small><p>${esc(c.body)}</p></div></article>`,
        )
        .join("");
      form.reset();
      icons();
      toast("Comment added.");
    }
    if (form.id === "delete-form") {
      await api(
        "/" +
          (form.dataset.type === "task" ? "tasks" : "projects") +
          "/" +
          form.dataset.id,
        "DELETE",
      );
      await refresh(false);
      closeModal();
      renderSidebar();
      toast("Deleted.");
    }
  });
});
$("#auth-mode").addEventListener("click", () => {
  authMode = authMode === "login" ? "register" : "login";
  const registering = authMode === "register";
  $("#name-field").hidden = !registering;
  $("#name-field input").required = registering;
  $("#auth-title").innerHTML = registering
    ? "Make yourself<br>at home."
    : "Good to have<br>you here.";
  $("#auth-subtitle").textContent = registering
    ? "Create your personal workspace."
    : "Sign in to your workspace.";
  $("#auth-submit-label").textContent = registering
    ? "Create account"
    : "Sign in";
  $("#auth-mode").textContent = registering ? "Sign in" : "Create an account";
  $("#auth-switch-copy").textContent = registering
    ? "Already have an account?"
    : "New here?";
  $("#auth-error").textContent = "";
  $("#auth-form [name=password]").autocomplete = registering
    ? "new-password"
    : "current-password";
});
$("#password-toggle").addEventListener("click", () => {
  const input = $("#auth-form [name=password]"),
    show = input.type === "password";
  input.type = show ? "text" : "password";
  $("#password-toggle").innerHTML = icon(show ? "eye-off" : "eye");
  $("#password-toggle").ariaLabel = show ? "Hide password" : "Show password";
  $("#password-toggle").title = show ? "Hide password" : "Show password";
  icons();
});
$("#demo-login").addEventListener("click", async () => {
  const button = $("#demo-login");
  button.disabled = true;
  try {
    await api("/auth/demo", "POST", {});
    await enterWorkspace();
  } catch (e) {
    $("#auth-error").textContent = e.message;
  } finally {
    button.disabled = false;
  }
});
$("#menu-toggle").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
  $("#sidebar-shade").hidden = !$("#sidebar").classList.contains("open");
});
$("#sidebar-shade").addEventListener("click", () => {
  $("#sidebar").classList.remove("open");
  $("#sidebar-shade").hidden = true;
});
$("#modal").addEventListener("cancel", () => {
  editingId = null;
  setTimeout(() => state && renderMain(), 0);
});
icons();
api("/state")
  .then((data) => {
    state = data;
    return enterWorkspace();
  })
  .catch((error) => {
    if (!error.message.includes("sign in"))
      $("#auth-error").textContent = error.message;
  });
