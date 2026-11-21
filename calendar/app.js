import { CLIENT_ID, CALENDAR_ID } from "./config.js";

const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const TOKEN_KEY = "calendar.token";
const AUTHED_KEY = "calendar.authed";
const CACHE_PREFIX = "calendar.events.";
const REFRESH_MS = 10 * 60 * 1000;

// Google Calendar's event color palette (colorId → background).
const EVENT_COLORS = {
  1: "#7986cb", 2: "#33b679", 3: "#8e24aa", 4: "#e67c73", 5: "#f6bf26",
  6: "#f4511e", 7: "#039be5", 8: "#616161", 9: "#3f51b5", 10: "#0b8043",
  11: "#d50000",
};

const $ = (id) => document.getElementById(id);
const els = {
  status: $("status"),
  signin: $("signin"),
  today: $("today"),
  todayHeading: $("today-heading"),
  todayList: $("today-list"),
  weekHeading: $("week-heading"),
  weekGrid: $("week-grid"),
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayNameFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const stampFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

const state = {
  weekStart: startOfWeek(new Date()),
  selected: startOfDay(new Date()),
  events: [],
  fetchedAt: null,
};

// ---------- storage helpers (storage may be unavailable) ----------

function store(kind, key, value) {
  try {
    const s = kind === "session" ? sessionStorage : localStorage;
    if (value === undefined) return JSON.parse(s.getItem(key));
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
  } catch {
    return null;
  }
}

// ---------- dates ----------

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d) {
  return addDays(startOfDay(d), -d.getDay()); // Sunday
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// All-day events use "YYYY-MM-DD" (end exclusive); treat as local dates.
function parseWhen(when) {
  if (when.date) {
    const [y, m, d] = when.date.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(when.dateTime);
}

function normalize(item) {
  return {
    id: item.id,
    title: item.summary || "(No title)",
    allDay: Boolean(item.start.date),
    start: parseWhen(item.start),
    end: parseWhen(item.end),
    location: item.location || "",
    description: item.description || "",
    link: item.htmlLink,
    color: EVENT_COLORS[item.colorId] || null,
  };
}

function eventsOn(day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return state.events
    .filter((e) => e.start < dayEnd && (e.end > dayStart || +e.end === +e.start && e.start >= dayStart))
    .sort((a, b) => (b.allDay - a.allDay) || (a.start - b.start) || a.title.localeCompare(b.title));
}

function timeLabel(e, day) {
  if (e.allDay) return "All day";
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const startsToday = e.start >= dayStart;
  const endsToday = e.end <= dayEnd;
  if (startsToday && endsToday) {
    return +e.start === +e.end ? timeFmt.format(e.start) : timeFmt.formatRange(e.start, e.end);
  }
  if (startsToday) return `${timeFmt.format(e.start)} →`;
  if (endsToday) return `→ ${timeFmt.format(e.end)}`;
  return "All day";
}

function shortTime(e, day) {
  return e.start >= startOfDay(day) ? timeFmt.format(e.start) : "…";
}

// ---------- auth (OAuth implicit redirect flow; works in standalone PWAs) ----------

function redirectUri() {
  return new URL("./", location.href).href;
}

function authorize({ silent }) {
  const nonce = crypto.randomUUID();
  store("session", "calendar.oauthState", nonce);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "token",
    scope: SCOPE,
    include_granted_scopes: "true",
    state: nonce,
  });
  const hint = store("local", AUTHED_KEY);
  if (typeof hint === "string") params.set("login_hint", hint);
  if (silent) params.set("prompt", "none");
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

function consumeRedirect() {
  if (!location.hash.includes("access_token") && !location.hash.includes("error")) return;
  const params = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);
  const expected = store("session", "calendar.oauthState");
  store("session", "calendar.oauthState", null);
  if (!expected || params.get("state") !== expected) return;

  if (params.get("access_token")) {
    const expiresIn = Number(params.get("expires_in") || 3600);
    store("local", TOKEN_KEY, { value: params.get("access_token"), expires: Date.now() + expiresIn * 1000 });
    if (!store("local", AUTHED_KEY)) store("local", AUTHED_KEY, true);
    store("session", "calendar.silentFailed", null);
  } else if (params.get("error")) {
    store("session", "calendar.silentFailed", true);
  }
}

function currentToken() {
  const t = store("local", TOKEN_KEY);
  return t && t.expires - 60_000 > Date.now() ? t.value : null;
}

function needSignIn() {
  if (navigator.onLine === false) {
    setStatus(state.fetchedAt ? `Offline — showing events from ${stampFmt.format(state.fetchedAt)}` : "Offline");
    return;
  }
  // Previously authorized: try a silent round-trip once per session before asking.
  if (store("local", AUTHED_KEY) && !store("session", "calendar.silentFailed")) {
    store("session", "calendar.silentFailed", true); // cleared on success
    authorize({ silent: true });
    return;
  }
  els.signin.hidden = false;
  setStatus(state.fetchedAt ? `Sign in to refresh (last updated ${stampFmt.format(state.fetchedAt)})` : "Sign in to see the calendar.");
}

// ---------- data ----------

async function fetchWeek(weekStart, token) {
  const items = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      timeMin: weekStart.toISOString(),
      timeMax: addDays(weekStart, 7).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 401) {
      const err = new Error("unauthorized");
      err.unauthorized = true;
      throw err;
    }
    if (!res.ok) {
      const detail = await res.json().then((b) => b.error?.message).catch(() => null);
      throw new Error(`Calendar request failed (${res.status})${detail ? `: ${detail}` : ""}`);
    }
    const body = await res.json();
    items.push(...body.items.filter((i) => i.status !== "cancelled"));
    pageToken = body.nextPageToken;
  } while (pageToken);
  return items;
}

function loadCached(weekStart) {
  const cached = store("local", CACHE_PREFIX + dayKey(weekStart));
  if (cached) {
    state.events = cached.items.map(normalize);
    state.fetchedAt = new Date(cached.fetchedAt);
  } else {
    state.events = [];
    state.fetchedAt = null;
  }
}

function pruneCache() {
  try {
    const keep = new Set([-1, 0, 1].map((n) => CACHE_PREFIX + dayKey(addDays(startOfWeek(new Date()), n * 7))));
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX) && !keep.has(k))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

async function refresh() {
  const weekStart = state.weekStart;
  const token = currentToken();
  if (!token) return needSignIn();
  els.signin.hidden = true;
  setStatus("Updating…");
  try {
    const items = await fetchWeek(weekStart, token);
    store("local", CACHE_PREFIX + dayKey(weekStart), { fetchedAt: Date.now(), items });
    pruneCache();
    if (+weekStart !== +state.weekStart) return; // user navigated away meanwhile
    state.events = items.map(normalize);
    state.fetchedAt = new Date();
    setStatus("");
    render();
  } catch (err) {
    if (err.unauthorized) {
      store("local", TOKEN_KEY, null);
      return needSignIn();
    }
    setStatus(state.fetchedAt ? `Couldn't update — showing events from ${stampFmt.format(state.fetchedAt)}` : err.message);
  }
}

// ---------- rendering ----------

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "style") for (const [prop, val] of Object.entries(v)) node.style.setProperty(prop, val);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  node.append(...children.filter((c) => c != null && c !== false));
  return node;
}

const ALLOWED_TAGS = new Set(["A", "B", "STRONG", "I", "EM", "U", "BR", "P", "UL", "OL", "LI", "SPAN", "DIV"]);

// Google event descriptions may contain a small subset of HTML; keep only safe bits.
function sanitizeInto(source, target) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.append(node.textContent);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!ALLOWED_TAGS.has(node.tagName)) {
        sanitizeInto(node, target);
        continue;
      }
      const copy = document.createElement(node.tagName);
      if (node.tagName === "A") {
        const href = node.getAttribute("href") || "";
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          copy.href = href;
          copy.target = "_blank";
          copy.rel = "noopener noreferrer";
        }
      }
      sanitizeInto(node, copy);
      target.append(copy);
    }
  }
}

function linkify(text, target) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  parts.forEach((part, i) => {
    if (i % 2) target.append(el("a", { href: part, target: "_blank", rel: "noopener noreferrer" }, part));
    else target.append(part);
  });
}

function description(text) {
  const div = el("div", { class: "description" });
  if (/<[a-z][\s\S]*>/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    sanitizeInto(doc.body, div);
  } else {
    div.classList.add("plain");
    linkify(text, div);
  }
  return div;
}

function colorStyle(e) {
  return e.color ? { "--event-color": e.color } : {};
}

function renderWeek() {
  const today = startOfDay(new Date());
  const end = addDays(state.weekStart, 6);
  els.weekHeading.textContent = `${shortDateFmt.formatRange(state.weekStart, end)}`;

  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  els.weekGrid.replaceChildren(
    ...days.map((day) => {
      const events = eventsOn(day);
      const classes = ["day"];
      if (sameDay(day, today)) classes.push("is-today");
      if (sameDay(day, state.selected)) classes.push("is-selected");
      if (day < today) classes.push("is-past");
      return el(
        "li",
        { class: classes.join(" ") },
        el(
          "button",
          { type: "button", class: "day-head", "aria-pressed": String(sameDay(day, state.selected)) },
          el("span", { class: "day-name" }, dayNameFmt.format(day)),
          el("span", { class: "day-num" }, String(day.getDate())),
        ),
        events.length
          ? el(
              "ul",
              { class: "day-events" },
              ...events.map((e) =>
                el(
                  "li",
                  { class: e.allDay ? "chip" : "timed", style: colorStyle(e) },
                  !e.allDay && el("span", { class: "ev-time" }, shortTime(e, day)),
                  el("span", { class: "ev-title" }, e.title),
                ),
              ),
            )
          : el("p", { class: "empty" }, "—"),
      );
    }),
  );

  els.weekGrid.querySelectorAll(".day-head").forEach((btn, i) => {
    btn.addEventListener("click", () => {
      state.selected = days[i];
      render();
      if (matchMedia("(max-width: 52rem)").matches) els.today.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderDetail() {
  const day = state.selected;
  const now = new Date();
  const isToday = sameDay(day, now);
  const inWeek = day >= state.weekStart && day < addDays(state.weekStart, 7);
  els.today.hidden = !inWeek;
  if (!inWeek) return;

  els.todayHeading.replaceChildren(
    el("span", { class: "eyebrow" }, isToday ? "Today" : "Selected day"),
    longDayFmt.format(day),
  );

  const events = eventsOn(day);
  if (!events.length) {
    els.todayList.replaceChildren(el("li", { class: "empty" }, state.fetchedAt ? "Nothing scheduled." : ""));
    return;
  }

  els.todayList.replaceChildren(
    ...events.map((e) => {
      const classes = ["detail"];
      if (isToday && !e.allDay && e.end <= now) classes.push("is-done");
      if (isToday && !e.allDay && e.start <= now && e.end > now) classes.push("is-now");
      return el(
        "li",
        { class: classes.join(" "), style: colorStyle(e) },
        el("div", { class: "detail-time" }, timeLabel(e, day), classes.includes("is-now") && el("span", { class: "now-badge" }, "Now")),
        el(
          "div",
          { class: "detail-body" },
          el("h3", {}, e.link ? el("a", { href: e.link, target: "_blank", rel: "noopener noreferrer" }, e.title) : e.title),
          e.location &&
            el(
              "p",
              { class: "location" },
              el(
                "a",
                { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`, target: "_blank", rel: "noopener noreferrer" },
                e.location,
              ),
            ),
          e.description && description(e.description),
        ),
      );
    }),
  );
}

function render() {
  renderDetail();
  renderWeek();
}

function goToWeek(weekStart, selected) {
  state.weekStart = weekStart;
  state.selected = selected ?? weekStart;
  loadCached(weekStart);
  render();
  refresh();
}

// ---------- wiring ----------

document.querySelector(".week-nav").addEventListener("click", (event) => {
  const action = event.target.closest("button")?.dataset.action;
  if (action === "prev") goToWeek(addDays(state.weekStart, -7));
  if (action === "next") goToWeek(addDays(state.weekStart, 7));
  if (action === "today") goToWeek(startOfWeek(new Date()), startOfDay(new Date()));
  if (action === "refresh") {
    store("session", "calendar.silentFailed", null);
    refresh();
  }
});

els.signin.addEventListener("click", () => authorize({ silent: false }));

// Keep "today" and the data fresh while the app stays open.
let lastDay = dayKey(new Date());
setInterval(() => {
  const nowKey = dayKey(new Date());
  if (nowKey !== lastDay) {
    lastDay = nowKey;
    goToWeek(startOfWeek(new Date()), startOfDay(new Date()));
  } else {
    render(); // update "now" / done markers
  }
}, 60_000);
setInterval(() => document.visibilityState === "visible" && refresh(), REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && (!state.fetchedAt || Date.now() - state.fetchedAt > 60_000)) refresh();
});
addEventListener("online", () => refresh());

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

consumeRedirect();
goToWeek(state.weekStart, state.selected);
