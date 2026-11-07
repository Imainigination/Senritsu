const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const hq = (u) => u.replace("mqdefault", "hqdefault");
const maxres = (u) => u.replace("mqdefault", "maxresdefault");
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12 18 18V6z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24"><path d="M10.6 9.2 5.4 4 4 5.4l5.2 5.2 1.4-1.4zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="m12 21-1.5-1.3C5.4 15.4 2 12.3 2 8.5 2 5.4 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1C13.1 3.8 14.8 3 16.5 3 19.6 3 22 5.4 22 8.5c0 3.8-3.4 6.9-8.5 11.2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/></svg>',
  playnext: '<svg viewBox="0 0 24 24"><path d="M4 6h10v2H4zm0 5h10v2H4zm0 5h6v2H4zm12-5v6l5-3z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>',
};
let toastTimer;
function toast(msg) {
  const el = $("#toast"); el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

// ---------- themes ----------
const THEMES = {
  midnight: { bg: "#0d0b14", panel: "#171325", text: "#f2effa", muted: "#8f89a3", accent: "#a78bfa" },
  sakura:   { bg: "#1a1015", panel: "#26181f", text: "#fdeef3", muted: "#b0869a", accent: "#ff7eb6" },
  ocean:    { bg: "#07131c", panel: "#0e2230", text: "#e6f4ff", muted: "#7fa3ba", accent: "#38bdf8" },
  forest:   { bg: "#0a130e", panel: "#12211a", text: "#e9f7ee", muted: "#7fa38d", accent: "#4ade80" },
  sunset:   { bg: "#170d0c", panel: "#26150f", text: "#fff0e6", muted: "#b58a76", accent: "#fb923c" },
  amoled:   { bg: "#000000", panel: "#0b0b0b", text: "#ffffff", muted: "#888888", accent: "#ffffff" },
  paper:    { bg: "#f6f3ee", panel: "#ffffff", text: "#1d1b20", muted: "#7a7480", accent: "#7c3aed" },
};
const MOODS = [
  ["Lofi hip hop", "#6a5acd", "#2b1b5e"], ["Phonk", "#ef4444", "#4a0d0d"], ["Anime openings", "#ec4899", "#4c1d95"],
  ["Rock classics", "#f59e0b", "#7c2d12"], ["Jazz", "#0ea5e9", "#1e3a8a"], ["Synthwave", "#d946ef", "#1e1b4b"],
  ["Metalcore", "#64748b", "#0f172a"], ["Chill electronic", "#14b8a6", "#134e4a"],
];
const onAccent = (hex) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? "#111111" : "#ffffff";
};

// ---------- adaptive accent from the cover ----------
function toHex(r, g, b) { return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""); }
function vivid(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  s = Math.max(s, 0.5); l = Math.min(Math.max(l, 0.58), 0.72);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}
function dominant(url) {
  return new Promise((res) => {
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 24;
        const x = c.getContext("2d"), s = Math.min(im.width, im.height);
        x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 24, 24);
        const d = x.getImageData(0, 0, 24, 24).data; let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B);
          const sat = (mx - mn) / (mx || 1), lum = (R + G + B) / 3, wt = sat * sat * (lum > 40 && lum < 230 ? 1 : 0.1) + 0.001;
          r += R * wt; g += G * wt; b += B * wt; w += wt;
        }
        res(vivid(r / w, g / w, b / w));
      } catch { res(null); }
    };
    im.onerror = () => res(null); im.src = url;
  });
}

// ---------- state ----------
const S = {
  view: "home", q: "", results: [], loading: false,
  queue: load("queue", []), index: -1, liked: load("liked", []), recent: load("recent", []),
  set: { theme: "midnight", accent: null, adaptive: true, blur: true, radius: 16, volume: 80, panel: true, tab: "lyrics", shuffle: false, repeat: 0, video: false, height: 720, ...load("settings", {}) },
  st: { pos: 0, dur: 0, paused: true }, lyrics: null, dragging: false, lastLy: -1, dyn: null,
};
const cur = () => S.queue[S.index] || null;
const isLiked = (t) => S.liked.some((x) => x.id === t.id);

function applySettings() {
  const t = THEMES[S.set.theme] || THEMES.midnight, r = document.documentElement.style;
  const accent = S.set.accent || (S.set.adaptive && S.dyn) || t.accent;
  r.setProperty("--bg", t.bg); r.setProperty("--panel", t.panel);
  r.setProperty("--text", t.text); r.setProperty("--muted", t.muted);
  r.setProperty("--accent", accent); r.setProperty("--on-accent", onAccent(accent));
  r.setProperty("--radius", S.set.radius + "px");
  $("#bg").style.display = S.set.blur ? "block" : "none";
  $(".app").classList.toggle("nopanel", !S.set.panel);
  $("#tQueue").classList.toggle("on", S.set.panel && S.set.tab === "queue");
  $("#tLyrics").classList.toggle("on", S.set.panel && S.set.tab === "lyrics");
  $("#tVideo").classList.toggle("on", S.set.video);
  $("#shuffle").classList.toggle("on", S.set.shuffle);
  $("#repeat").classList.toggle("on", S.set.repeat > 0);
  $("#repeat").title = ["Repeat off", "Repeat all", "Repeat one"][S.set.repeat];
}
const commit = () => { save("settings", S.set); applySettings(); };

// ---------- playback ----------
const playArgs = (t, start) => ({ id: t.id, video: S.set.video, height: S.set.height, start });
async function playIndex(i) {
  if (i < 0 || i >= S.queue.length) return;
  S.index = i; save("queue", S.queue);
  const t = S.queue[i];
  S.recent = [t, ...S.recent.filter((x) => x.id !== t.id)].slice(0, 12); save("recent", S.recent);
  setNow(t); fetchLyrics(t); renderPanel();
  if (S.view === "now") render();
  try { await invoke("play", playArgs(t, 0)); } catch (e) { toast(String(e)); }
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
function setVideo(on) {
  S.set.video = on; commit();
  const t = cur();
  if (!t) return toast(on ? "Video on. Play something to watch it" : "Video off");
  if (on) invoke("play", playArgs(t, S.st.pos)).catch((e) => toast(String(e)));
  else invoke("video_off").catch(() => {});
  if (S.view === "now" || S.view === "style") render();
}
function toggleLike(t) {
  if (!t) return;
  S.liked = isLiked(t) ? S.liked.filter((x) => x.id !== t.id) : [t, ...S.liked];
  save("liked", S.liked); setNow(cur());
}
function playNext(t) {
  if (S.index < 0) { S.queue.push(t); save("queue", S.queue); return playIndex(S.queue.length - 1); }
  S.queue.splice(S.index + 1, 0, t); save("queue", S.queue); toast("Playing next"); renderPanel();
}
function setNow(t) {
  if (!t) return;
  $("#title").textContent = t.title; $("#artist").textContent = t.artist;
  $("#cover").src = hq(t.thumb); $("#bg").style.backgroundImage = `url("${t.thumb}")`;
  $("#likeNow").classList.toggle("on", isLiked(t)); $("#likeNow").innerHTML = I.heart;
  $("#ttot").textContent = fmt(t.duration);
  document.title = `${t.title} · Senritsu`;
  if (S.set.adaptive) dominant(t.thumb).then((c) => { if (cur()?.id === t.id) { S.dyn = c; applySettings(); } });
}

// ---------- lyrics (lrclib.net) ----------
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

// ---------- components ----------
const listFor = (ctx) => ({ search: S.results, queue: S.queue, liked: S.liked, recent: S.recent }[ctx] || []);
function card(t, i, ctx) {
  const c = cur(), active = c && c.id === t.id;
  return `<div class="card ${active ? "active" : ""}" data-i="${i}" data-ctx="${ctx}">
    <div class="thumb"><img src="${esc(hq(t.thumb))}" loading="lazy" alt="">
      ${t.duration ? `<span class="dur">${fmt(t.duration)}</span>` : ""}
      <span class="playfab">${I.play}</span></div>
    <b title="${esc(t.title)}">${esc(t.title)}</b><span class="art">${esc(t.artist)}</span>
    <div class="cacts">
      <button data-a="like" class="${isLiked(t) ? "on" : ""}" title="Like">${I.heart}</button>
      <button data-a="queue" title="Add to queue">${I.plus}</button>
      <button data-a="playnext" title="Play next">${I.playnext}</button>
    </div></div>`;
}
function row(t, i, ctx) {
  const c = cur(), active = c && c.id === t.id;
  return `<div class="row ${active ? "active" : ""}" data-i="${i}" data-ctx="${ctx}">
    <img src="${esc(t.thumb)}" loading="lazy" alt="">
    <div class="meta"><b>${esc(t.title)}</b><span>${esc(t.artist)}</span></div>
    <div class="acts"><button data-a="like" class="${isLiked(t) ? "on" : ""}" title="Like">${I.heart}</button>
    <button data-a="remove" title="Remove">${I.close}</button></div></div>`;
}
const grid = (list, ctx) => `<div class="grid">${list.map((t, i) => card(t, i, ctx)).join("")}</div>`;

// ---------- views ----------
function greeting() { const h = new Date().getHours(); return h < 5 ? "Late night listening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }
function vHome(v) {
  if (S.loading) { v.innerHTML = '<p class="hint">Searching…</p>'; return; }
  if (S.results.length) {
    v.innerHTML = `<h1>Results for “${esc(S.q)}”</h1><p class="hint">${S.results.length} tracks. Click a cover to play, the rest of the list becomes your queue.</p>${grid(S.results, "search")}`;
    return;
  }
  v.innerHTML = `<h1>${greeting()}</h1><p class="hint">Search above or pick a mood to start.</p>
    ${S.recent.length ? `<h2>Jump back in</h2>${grid(S.recent, "recent")}` : ""}
    <h2>Moods</h2><div class="moods">${MOODS.map(([n, a, b]) => `<button class="mood" data-mood="${esc(n)}" style="--a:${a};--b:${b}">${esc(n)}</button>`).join("")}</div>`;
  v.querySelectorAll(".mood").forEach((b) => (b.onclick = () => { $("#q").value = b.dataset.mood; doSearch(); }));
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
  v.innerHTML = `<div class="now">
    <div class="coverwrap" id="tilt"><div class="glow"></div>
      <img class="bigcover" src="${esc(maxres(t.thumb))}" alt="" onerror="this.onerror=null;this.src='${esc(hq(t.thumb))}'"></div>
    <div class="nowinfo"><div class="eq"><i></i><i></i><i></i><i></i></div>
      <h1>${esc(t.title)}</h1><p>${esc(t.artist)}</p>
      <div class="nowbtn"><button class="pri" id="nvVideo">${S.set.video ? "Close video" : "Watch video"}</button>
      <button class="sec" id="nvLike">${isLiked(t) ? "Liked" : "Like"}</button></div></div></div>`;
  const w = $("#tilt");
  w.onmousemove = (e) => {
    const r = w.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    w.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg) scale(1.03)`;
  };
  w.onmouseleave = () => (w.style.transform = "");
  w.onclick = toggle;
  $("#nvVideo").onclick = () => setVideo(!S.set.video);
  $("#nvLike").onclick = () => { toggleLike(t); render(); renderPanel(); };
}
function vLiked(v) {
  v.innerHTML = `<div class="banner"><div class="bcover">${I.heart}</div><div><h1>Liked songs</h1><p>${S.liked.length} tracks</p>
    ${S.liked.length ? '<div class="brow"><button id="pall" class="pri">Play all</button><button id="pshuf" class="sec">Shuffle</button></div>' : ""}</div></div>
    ${S.liked.length ? grid(S.liked, "liked") : '<p class="hint">Hover any cover and tap the heart to save it here.</p>'}`;
  $("#pall") && ($("#pall").onclick = () => playList(S.liked, 0));
  $("#pshuf") && ($("#pshuf").onclick = () => playList([...S.liked].sort(() => Math.random() - 0.5), 0));
}
function vStyle(v) {
  const t = THEMES[S.set.theme] || THEMES.midnight, accent = S.set.accent || t.accent;
  v.innerHTML = `<h1>Style</h1><p class="hint">Everything here saves instantly.</p>
    <div class="themes">${Object.entries(THEMES).map(([k, th]) =>
      `<button class="sw ${S.set.theme === k ? "on" : ""}" data-t="${k}" style="--c1:${th.bg};--c2:${th.accent}">${k}</button>`).join("")}</div>
    <h2>Colors</h2>
    <div class="setrow"><label>Adapt colors to the cover</label><input id="adaptive" type="checkbox" ${S.set.adaptive ? "checked" : ""}></div>
    <div class="setrow"><label>Fixed accent color</label><input id="accent" type="color" value="${accent}"><button id="reset" class="sec">Reset</button></div>
    <div class="setrow"><label>Corner radius</label><input id="radius" type="range" min="0" max="28" value="${S.set.radius}"></div>
    <div class="setrow"><label>Blurred cover glow</label><input id="blur" type="checkbox" ${S.set.blur ? "checked" : ""}></div>
    <h2>Video</h2>
    <div class="setrow"><label>Play video</label><input id="video" type="checkbox" ${S.set.video ? "checked" : ""}></div>
    <div class="setrow"><label>Maximum quality</label><select id="hq">${[480, 720, 1080, 1440, 2160].map((h) => `<option value="${h}" ${S.set.height === h ? "selected" : ""}>${h}p</option>`).join("")}</select></div>
    <p class="hint">Video opens in its own player window. Press F there for fullscreen. Closing it keeps the music going.</p>`;
  v.querySelectorAll(".sw").forEach((b) => (b.onclick = () => { S.set.theme = b.dataset.t; S.set.accent = null; commit(); render(); }));
  $("#adaptive").onchange = (e) => { S.set.adaptive = e.target.checked; if (e.target.checked && cur()) setNow(cur()); else S.dyn = null; commit(); };
  $("#accent").oninput = (e) => { S.set.accent = e.target.value; commit(); };
  $("#reset").onclick = () => { S.set.accent = null; commit(); render(); };
  $("#radius").oninput = (e) => { S.set.radius = +e.target.value; commit(); };
  $("#blur").onchange = (e) => { S.set.blur = e.target.checked; commit(); };
  $("#video").onchange = (e) => setVideo(e.target.checked);
  $("#hq").onchange = (e) => { S.set.height = +e.target.value; commit(); toast(`Video quality ${e.target.value}p from the next track`); };
}
function render() {
  document.querySelectorAll(".nav").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view));
  const v = $("#view");
  v.style.animation = "none"; void v.offsetWidth; v.style.animation = "";
  ({ home: vHome, now: vNow, liked: vLiked, style: vStyle }[S.view])(v);
}

// ---------- right panel ----------
function renderPanel() {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.set.tab));
  const p = $("#pbody"), L = S.lyrics, t = cur();
  if (S.set.tab === "queue") {
    p.innerHTML = (S.queue.length ? S.queue.map((x, i) => row(x, i, "queue")).join("") : '<p class="hint">Queue is empty.</p>')
      + (S.queue.length ? '<button id="clr" class="sec" style="margin-top:12px">Clear upcoming</button>' : "");
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

// ---------- events ----------
document.querySelectorAll(".nav").forEach((b) => (b.onclick = () => {
  if (b.dataset.view === "home" && S.view === "home" && S.results.length) { S.results = []; S.q = ""; $("#q").value = ""; }
  S.view = b.dataset.view; render();
}));
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { S.set.tab = b.dataset.tab; commit(); renderPanel(); }));
$("#tQueue").onclick = () => openTab("queue");
$("#tLyrics").onclick = () => openTab("lyrics");
$("#tVideo").onclick = () => setVideo(!S.set.video);
$("#cover").onclick = () => { S.view = "now"; render(); };
$("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

document.addEventListener("click", (e) => {
  const el = e.target.closest(".card, .row"); if (!el) return;
  const ctx = el.dataset.ctx, i = +el.dataset.i, list = listFor(ctx), t = list[i]; if (!t) return;
  const a = e.target.closest("button")?.dataset.a;
  const refresh = () => { render(); renderPanel(); };
  if (a === "queue") { S.queue.push(t); save("queue", S.queue); toast("Added to queue"); if (S.index < 0) playIndex(S.queue.length - 1); else renderPanel(); }
  else if (a === "playnext") playNext(t);
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
$("#prev").innerHTML = I.prev; $("#next").innerHTML = I.next; $("#play").innerHTML = I.play;
$("#shuffle").innerHTML = I.shuffle; $("#repeat").innerHTML = I.repeat; $("#likeNow").innerHTML = I.heart;

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
function setVol(v) {
  v = Math.max(0, Math.min(100, v)); vol.value = v; vol.style.setProperty("--p", v + "%");
  S.set.volume = v; save("settings", S.set); invoke("set_volume", { v }).catch(() => {});
}
vol.addEventListener("input", () => setVol(+vol.value));

listen("player-state", (e) => {
  S.st = e.payload; const { pos, dur, paused } = S.st;
  $("#play").innerHTML = paused ? I.play : I.pause;
  document.body.classList.toggle("playing", !paused);
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
listen("video-closed", () => { S.set.video = false; commit(); if (S.view === "now" || S.view === "style") render(); toast("Video window closed, music keeps playing"); });
listen("media-key", (e) => ({ toggle, next: () => next(false), prev }[e.payload] || (() => {}))());

document.addEventListener("keydown", (e) => {
  const typing = ["INPUT", "SELECT"].includes(e.target.tagName) && e.target.type !== "range" && e.target.type !== "checkbox";
  if (typing) return;
  if (e.code === "Space") { e.preventDefault(); toggle(); }
  else if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
  else if (e.key === "ArrowRight") invoke("seek", { secs: S.st.pos + 5 }).catch(() => {});
  else if (e.key === "ArrowLeft") invoke("seek", { secs: Math.max(0, S.st.pos - 5) }).catch(() => {});
  else if (e.key === "ArrowUp") { e.preventDefault(); setVol(S.set.volume + 5); }
  else if (e.key === "ArrowDown") { e.preventDefault(); setVol(S.set.volume - 5); }
});

// ---------- init ----------
applySettings();
vol.value = S.set.volume; vol.style.setProperty("--p", S.set.volume + "%");
$("#likeNow").innerHTML = I.heart;
invoke("set_volume", { v: S.set.volume }).catch((e) => toast(String(e))); // also reports a missing mpv
render(); renderPanel();
