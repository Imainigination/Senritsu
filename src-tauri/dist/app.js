const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const big = (u) => u.replace("mqdefault", "hqdefault");
const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M10.600 9.200 5.400 4 4 5.400l5.200 5.200 1.400-1.400zM14.500 4l2.040 2.040L4 18.590 5.410 20 17.960 7.460 20 9.500V4h-5.500zm.33 9.410-1.410 1.410 3.130 3.130L14.500 20H20v-5.500l-2.040 2.040-3.130-3.130z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
};
let toastTimer;
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
const CHIPS = ["Lofi hip hop", "Phonk", "Anime openings", "Rock classics", "Jazz", "Synthwave", "Metalcore", "Chill electronic"];

const THEMES = {
  midnight: { bg: "#0d0b14", panel: "#171325", text: "#f2effa", muted: "#8f89a3", accent: "#a78bfa" },
  sakura:   { bg: "#1a1015", panel: "#26181f", text: "#fdeef3", muted: "#b0869a", accent: "#ff7eb6" },
  ocean:    { bg: "#07131c", panel: "#0e2230", text: "#e6f4ff", muted: "#7fa3ba", accent: "#38bdf8" },
  forest:   { bg: "#0a130e", panel: "#12211a", text: "#e9f7ee", muted: "#7fa38d", accent: "#4ade80" },
  sunset:   { bg: "#170d0c", panel: "#26150f", text: "#fff0e6", muted: "#b58a76", accent: "#fb923c" },
  amoled:   { bg: "#000000", panel: "#0b0b0b", text: "#ffffff", muted: "#888888", accent: "#ffffff" },
  paper:    { bg: "#f6f3ee", panel: "#ffffff", text: "#1d1b20", muted: "#7a7480", accent: "#7c3aed" },
};
const onAccent = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111111" : "#ffffff";
};

const S = {
  view: "home", q: "", results: [], loading: false,
  queue: load("queue", []), index: -1, liked: load("liked", []),
  set: { theme: "midnight", accent: null, blur: true, radius: 14, volume: 80, panel: true, tab: "lyrics", shuffle: false, repeat: 0, ...load("settings", {}) },
  st: { pos: 0, dur: 0, paused: true }, lyrics: null, dragging: false, lastLy: -1,
};
const cur = () => S.queue[S.index] || null;
const isLiked = (t) => S.liked.some((x) => x.id === t.id);

function applySettings() {
  const t = THEMES[S.set.theme] || THEMES.midnight, r = document.documentElement.style;
  const accent = S.set.accent || t.accent;
  r.setProperty("--bg", t.bg); r.setProperty("--panel", t.panel);
  r.setProperty("--text", t.text); r.setProperty("--muted", t.muted);
  r.setProperty("--accent", accent); r.setProperty("--on-accent", onAccent(accent));
  r.setProperty("--radius", S.set.radius + "px");
  $("#bg").style.display = S.set.blur ? "block" : "none";
  $(".app").classList.toggle("nopanel", !S.set.panel);
  $("#tQueue").classList.toggle("on", S.set.panel && S.set.tab === "queue");
  $("#tLyrics").classList.toggle("on", S.set.panel && S.set.tab === "lyrics");
  $("#shuffle").classList.toggle("on", S.set.shuffle);
  $("#repeat").classList.toggle("on", S.set.repeat > 0);
  $("#repeat").title = ["Repeat off", "Repeat all", "Repeat one"][S.set.repeat];
}
const commit = () => { save("settings", S.set); applySettings(); };

async function playIndex(i) {
  if (i < 0 || i >= S.queue.length) return;
  S.index = i; save("queue", S.queue);
  const t = S.queue[i];
  setNow(t); fetchLyrics(t); renderPanel();
  if (S.view === "now") render();
  try { await invoke("play", { id: t.id }); } catch (e) { toast(String(e)); }
}
function playList(list, i) { S.queue = [...list]; playIndex(i); }
function toggle() {
  if (S.index < 0) { if (S.queue.length) playIndex(0); return; }
  invoke("toggle_pause").catch((e) => toast(String(e)));
}
async function next(auto) {
  if (auto && S.set.repeat === 2) return playIndex(S.index);
  if (S.set.shuffle && S.queue.length > 1) {
    let j; do { j = Math.floor(Math.random() * S.queue.length); } while (j === S.index);
    return playIndex(j);
  }
  if (S.index + 1 < S.queue.length) return playIndex(S.index + 1);
  if (S.set.repeat === 1 && S.queue.length) return playIndex(0);
  const t = cur(); if (!t) return;
  try {
    const more = await invoke("radio", { id: t.id });
    const seen = new Set(S.queue.map((x) => x.id));
    const fresh = more.filter((x) => !seen.has(x.id));
    if (fresh.length) { S.queue.push(...fresh); return playIndex(S.index + 1); }
  } catch (e) { toast(String(e)); }
}
function prev() {
  if (S.st.pos > 4) return invoke("seek", { secs: 0 }).catch(() => {});
  playIndex(Math.max(0, S.index - 1));
}
function toggleLike(t) {
  if (!t) return;
  S.liked = isLiked(t) ? S.liked.filter((x) => x.id !== t.id) : [t, ...S.liked];
  save("liked", S.liked); setNow(cur());
}
function setNow(t) {
  if (!t) return;
  $("#title").textContent = t.title; $("#artist").textContent = t.artist;
  $("#cover").src = t.thumb; $("#bg").style.backgroundImage = `url("${t.thumb}")`;
  $("#likeNow").classList.toggle("on", isLiked(t));
  $("#ttot").textContent = fmt(t.duration);
  document.title = `${t.title} · Senritsu`;
}

const cleanTitle = (s) => s.replace(/\(.*?\)|\[.*?\]/g, "").replace(/official|music video|lyrics?|video|audio|hd|4k/gi, "").replace(/\s+/g, " ").trim();
function parseLRC(txt) {
  const out = [];
  for (const l of txt.split("\n")) {
    const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
    if (m) out.push({ t: +m[1] * 60 + parseFloat(m[2]), text: m[3] });
  }
  return out;
}
async function fetchLyrics(t) {
  S.lyrics = { id: t.id, loading: true }; S.lastLy = -1;
  try {
    const q = encodeURIComponent(`${t.artist} ${cleanTitle(t.title)}`);
    const res = await (await fetch(`https://lrclib.net/api/search?q=${q}`)).json();
    const ok = res.filter((r) => !t.duration || Math.abs(r.duration - t.duration) < 8);
    const pick = ok.find((r) => r.syncedLyrics) || res.find((r) => r.syncedLyrics) || ok.find((r) => r.plainLyrics) || res.find((r) => r.plainLyrics);
    if (cur()?.id !== t.id) return;
    if (pick?.syncedLyrics) S.lyrics = { id: t.id, lines: parseLRC(pick.syncedLyrics) };
    else if (pick?.plainLyrics) S.lyrics = { id: t.id, plain: pick.plainLyrics };
    else S.lyrics = { id: t.id, none: true };
  } catch { if (cur()?.id === t.id) S.lyrics = { id: t.id, none: true }; }
  if (cur()?.id === t.id) renderPanel();
}
function syncLyrics() {
  if (!S.set.panel || S.set.tab !== "lyrics" || !S.lyrics?.lines) return;
  const ls = S.lyrics.lines; let a = -1;
  for (let i = 0; i < ls.length; i++) { if (ls[i].t <= S.st.pos + 0.2) a = i; else break; }
  if (a === S.lastLy) return; S.lastLy = a;
  const els = document.querySelectorAll("#pbody .ly");
  els.forEach((el, i) => el.classList.toggle("on", i === a));
  const body = $("#pbody"), el = els[a];
  if (el) body.scrollTo({ top: el.offsetTop - body.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
}

function row(t, i, ctx) {
  const c = cur(), active = c && c.id === t.id;
  const a = ctx === "queue" ? '<button data-a="remove" title="Remove">✕</button>' : '<button data-a="queue" title="Add to queue">＋</button>';
  return `<div class="row ${active ? "active" : ""}" data-i="${i}" data-ctx="${ctx}">
    <img src="${esc(t.thumb)}" loading="lazy" alt="">
    <div class="meta"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>
    <span class="dur">${t.duration ? fmt(t.duration) : ""}</span>
    <div class="acts">${a}<button data-a="like" class="${isLiked(t) ? "on" : ""}" title="Like">♥</button></div></div>`;
}
const listHTML = (list, ctx, empty) => list.length ? list.map((t, i) => row(t, i, ctx)).join("") : `<p class="hint">${empty}</p>`;
const listFor = (ctx) => ({ search: S.results, queue: S.queue, liked: S.liked }[ctx] || []);

function vHome(v) {
  if (S.loading) v.innerHTML = '<p class="hint">Searching…</p>';
  else if (S.results.length) v.innerHTML = `<h1>Results for “${esc(S.q)}”</h1>${listHTML(S.results, "search", "")}`;
  else v.innerHTML = `<h1>What are we listening to?</h1><p class="hint">Search above, or start with a mood:</p>
    <div class="chips">${CHIPS.map((c) => `<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
  v.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { $("#q").value = b.dataset.chip; doSearch(); }));
}
async function doSearch() {
  const q = $("#q").value.trim(); if (!q) return;
  S.q = q; S.view = "home"; S.loading = true; render();
  try { S.results = await invoke("search", { query: q }); } catch (e) { toast(String(e)); S.results = []; }
  S.loading = false; render();
}
function vNow(v) {
  const t = cur();
  if (!t) { v.innerHTML = '<div class="empty">Nothing playing yet</div>'; return; }
  v.innerHTML = `<div class="nowwrap"><img class="bigcover" src="${esc(big(t.thumb))}" alt="">
    <div class="nowmeta"><h1>${esc(t.title)}</h1><p>${esc(t.artist)}</p></div></div>`;
}
function vLiked(v) {
  v.innerHTML = `<h1>Liked</h1>${S.liked.length ? '<button id="pall" class="pri">Play all</button>' : ""}
    <h2>${S.liked.length} tracks</h2>${listHTML(S.liked, "liked", "Tap ♥ on any track to save it here.")}`;
  $("#pall") && ($("#pall").onclick = () => playList(S.liked, 0));
}
function vThemes(v) {
  const accent = S.set.accent || (THEMES[S.set.theme] || THEMES.midnight).accent;
  v.innerHTML = `<h1>Themes</h1><div class="themes">${Object.entries(THEMES).map(([k, t]) =>
    `<button class="sw ${S.set.theme === k ? "on" : ""}" data-t="${k}" style="--c1:${t.bg};--c2:${t.accent}">${k}</button>`).join("")}</div>
    <h2>Customize</h2>
    <div class="setrow"><label>Accent color</label><input id="accent" type="color" value="${accent}"><button id="reset" class="sec" style="margin:0">Reset</button></div>
    <div class="setrow"><label>Corner radius</label><input id="radius" type="range" min="0" max="26" value="${S.set.radius}"></div>
    <div class="setrow"><label>Blurred cover glow</label><input id="blur" type="checkbox" ${S.set.blur ? "checked" : ""}></div>`;
  v.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { S.set.theme = b.dataset.t; S.set.accent = null; commit(); render(); }));
  $("#accent").oninput = (e) => { S.set.accent = e.target.value; commit(); };
  $("#reset").onclick = () => { S.set.accent = null; commit(); render(); };
  $("#radius").oninput = (e) => { S.set.radius = +e.target.value; commit(); };
  $("#blur").onchange = (e) => { S.set.blur = e.target.checked; commit(); };
}
function render() {
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
  ({ home: vHome, now: vNow, liked: vLiked, themes: vThemes }[S.view])($("#view"));
}

function renderPanel() {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.set.tab));
  const p = $("#pbody"), L = S.lyrics, t = cur();
  if (S.set.tab === "queue") {
    p.innerHTML = listHTML(S.queue, "queue", "Queue is empty.") + (S.queue.length ? '<button id="clr" class="sec">Clear upcoming</button>' : "");
    $("#clr") && ($("#clr").onclick = () => { S.queue = S.queue.slice(0, S.index + 1); save("queue", S.queue); renderPanel(); });
    return;
  }
  if (!t) p.innerHTML = '<p class="hint">Play a song to see lyrics.</p>';
  else if (!L || L.loading) p.innerHTML = '<p class="hint">Looking for lyrics…</p>';
  else if (L.lines) p.innerHTML = L.lines.map((l) => `<div class="ly" data-t="${l.t}">${esc(l.text) || "♪"}</div>`).join("");
  else if (L.plain) p.innerHTML = `<div class="plain">${esc(L.plain)}</div>`;
  else p.innerHTML = '<p class="hint">No lyrics found for this track.</p>';
  p.querySelectorAll(".ly").forEach((el) => (el.onclick = () => invoke("seek", { secs: +el.dataset.t }).catch(() => {})));
  S.lastLy = -1; syncLyrics();
}
function openTab(tab) {
  if (S.set.panel && S.set.tab === tab) S.set.panel = false;
  else { S.set.panel = true; S.set.tab = tab; }
  commit(); renderPanel();
}

document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => { S.view = b.dataset.view; render(); }));
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { S.set.tab = b.dataset.tab; commit(); renderPanel(); }));
$("#tQueue").onclick = () => openTab("queue");
$("#tLyrics").onclick = () => openTab("lyrics");
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

document.addEventListener("click", (e) => {
  const rowEl = e.target.closest(".row"); if (!rowEl) return;
  const ctx = rowEl.dataset.ctx, i = +rowEl.dataset.i, list = listFor(ctx), t = list[i]; if (!t) return;
  const a = e.target.closest("button")?.dataset.a;
  const refresh = () => { render(); renderPanel(); };
  if (a === "queue") { S.queue.push(t); save("queue", S.queue); toast("Added to queue"); if (S.index < 0) playIndex(S.queue.length - 1); else renderPanel(); }
  else if (a === "like") { toggleLike(t); refresh(); }
  else if (a === "remove") {
    if (i === S.index) return toast("Can't remove the playing track");
    S.queue.splice(i, 1); if (i < S.index) S.index--; save("queue", S.queue); renderPanel();
  }
  else if (ctx === "queue") playIndex(i);
  else playList(list, i);
});

$("#play").onclick = toggle;
$("#next").onclick = () => next(false);
$("#prev").onclick = prev;
$("#shuffle").onclick = () => { S.set.shuffle = !S.set.shuffle; commit(); };
$("#repeat").onclick = () => { S.set.repeat = (S.set.repeat + 1) % 3; commit(); };
$("#likeNow").onclick = () => { toggleLike(cur()); render(); renderPanel(); };
$("#prev").innerHTML = ICON.prev; $("#next").innerHTML = ICON.next; $("#play").innerHTML = ICON.play;
$("#shuffle").innerHTML = ICON.shuffle; $("#repeat").innerHTML = ICON.repeat;

const seek = $("#seek");
seek.addEventListener("input", () => {
  S.dragging = true; seek.style.setProperty("--p", seek.value / 10 + "%");
  $("#tcur").textContent = fmt((seek.value / 1000) * (S.st.dur || cur()?.duration || 0));
});
seek.addEventListener("change", () => {
  const dur = S.st.dur || cur()?.duration || 0;
  invoke("seek", { secs: (seek.value / 1000) * dur }).catch((e) => toast(String(e)));
  S.dragging = false;
});
const vol = $("#vol");
vol.addEventListener("input", () => {
  vol.style.setProperty("--p", vol.value + "%");
  S.set.volume = +vol.value; save("settings", S.set);
  invoke("set_volume", { v: +vol.value }).catch(() => {});
});

listen("player-state", (e) => {
  S.st = e.payload; const { pos, dur, paused } = S.st;
  $("#play").innerHTML = paused ? ICON.play : ICON.pause;
  if (!S.dragging) {
    $("#tcur").textContent = fmt(pos);
    const d = dur || cur()?.duration || 0, p = d ? Math.min(1000, (pos / d) * 1000) : 0;
    seek.value = p; seek.style.setProperty("--p", p / 10 + "%");
  }
  if (dur) $("#ttot").textContent = fmt(dur);
  syncLyrics();
});
listen("player-ended", () => next(true));
listen("player-error", (e) => { toast(String(e.payload)); next(false); });
listen("media-key", (e) => ({ toggle, next: () => next(false), prev }[e.payload] || (() => {}))());

document.addEventListener("keydown", (e) => {
  const typing = e.target.tagName === "INPUT" && e.target.type === "text";
  if (e.code === "Space" && !typing) { e.preventDefault(); toggle(); }
  if (e.key === "/" && !typing) { e.preventDefault(); $("#q").focus(); }
});

applySettings();
vol.value = S.set.volume; vol.style.setProperty("--p", S.set.volume + "%");
invoke("set_volume", { v: S.set.volume }).catch((e) => toast(String(e))); 
render(); renderPanel();
