

document.addEventListener("DOMContentLoaded", () => {
  initCounter();
  initToast();
  initFakeActions();
  initGoggle();
  initNowPlaying();
  initCommentForm();
  initMetube();
  initWikiweirdia();
  initGuestbook();
  initBlockbuster();
  initNapsteroid();
});

/* ---------- shared toast ---------- */
let toastEl = null;
function initToast(){
  toastEl = document.createElement("div");
  toastEl.className = "toast";
  document.body.appendChild(toastEl);
}
function showToast(msg, ms = 1800){
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("show"), ms);
}

function escapeHtml(value){
  return value.replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
  })[ch]);
}

/* ---------- live misfit counter ---------- */
function initCounter(){
  const counter = document.querySelector("[data-counter]");
  if (!counter) return;
  let base = 1337742 + Math.floor((Date.now() / 1000) % 333);
  counter.textContent = base.toLocaleString();
  setInterval(() => {
    base += Math.floor(Math.random() * 5) - 1;
    if (base < 1337742) base = 1337742;
    counter.textContent = base.toLocaleString();
  }, 2600);
}

/* ---------- generic fake-action buttons (send msg, add friend, etc) ---------- */
function initFakeActions(){
  document.querySelectorAll("[data-fake-action]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      const old = el.textContent;
      el.textContent = "✓ Signal sent";
      setTimeout(() => el.textContent = old, 1400);
    });
  });
}

/* ---------- goggle search ---------- */
const GOGGLE_POOL = [
  q => ({ title: `WikiWeirdia: ${q}`, href: "../wikiweirdia/", desc: "Facts, rumors, and at least one suspicious footnote." }),
  q => ({ title: "GeoGlitches Fan Shrine", href: "../geoglitches/", desc: "Best viewed at 800×600 with three broken plugins." }),
  q => ({ title: `Blockbuster.exe: rent "${q}"`, href: "../blockbuster-exe/", desc: `${q} may already be overdue in another timeline.` }),
  q => ({ title: `MeTube: "${q}" compilation`, href: "../metube/", desc: "Low resolution. High consequences." }),
  q => ({ title: `Napsteroid results for ${q}`, href: "../napsteroid/", desc: "Seeders: 7. Leechers: 1. Time remaining: forever." }),
  q => ({ title: `Did you mean: ${q.split("").reverse().join("")}`, href: "#", desc: "This reality suggests checking your spelling and your timeline." }),
];
function initGoggle(){
  const form = document.querySelector("#goggle-form");
  if (!form) return;
  const input = document.querySelector("#goggle-q");
  const results = document.querySelector("#goggle-results");

  function render(q){
    const query = q || "maximum reality";
    const shuffled = [...GOGGLE_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
    results.innerHTML = shuffled.map(fn => {
      const r = fn(escapeHtml(query));
      return `<div class="result"><h3><a href="${r.href}">${r.title}</a></h3><p>${r.desc}</p></div>`;
    }).join("");
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    render(input.value.trim());
  });

  const lucky = document.querySelector("#feeling-lucky");
  if (lucky){
    lucky.addEventListener("click", () => {
      const pages = ["../wikiweirdia/", "../metube/", "../geoglitches/", "../blockbuster-exe/", "../napsteroid/", "../you/"];
      window.location.href = pages[Math.floor(Math.random() * pages.length)];
    });
  }
}

/* ---------- now playing / fake player ---------- */
const PLAYLIST = [
  { artist: "Lori Lori", title: "GODMODE in Reverse" },
  { artist: "UNIT-7", title: "Dial-Up Ghosts" },
  { artist: "Azul feat. Mochkil", title: "Tuna Empire (Club Mix)" },
  { artist: "FM-∞", title: "Running in the Wrong Night" },
];
function initNowPlaying(){
  const track = document.querySelector("[data-track]");
  const eq = document.querySelector(".eq");
  const playBtn = document.querySelector("[data-play-toggle]");
  const nextBtn = document.querySelector("[data-play-next]");
  const prevBtn = document.querySelector("[data-play-prev]");
  if (!track) return;

  let idx = 0;
  let playing = true;

  function render(){
    const t = PLAYLIST[idx];
    track.innerHTML = `${escapeHtml(t.artist)}<br>"${escapeHtml(t.title)}"`;
    if (playBtn) playBtn.textContent = playing ? "❚❚" : "▶";
    if (eq) eq.classList.toggle("paused", !playing);
  }

  playBtn?.addEventListener("click", () => { playing = !playing; render(); });
  nextBtn?.addEventListener("click", () => { idx = (idx + 1) % PLAYLIST.length; playing = true; render(); });
  prevBtn?.addEventListener("click", () => { idx = (idx - 1 + PLAYLIST.length) % PLAYLIST.length; playing = true; render(); });

  render();
}

/* ---------- profile comment form ---------- */
function initCommentForm(){
  const form = document.querySelector("#comment-form");
  if (!form) return;
  const list = document.querySelector("#comments-list");
  const countEl = document.querySelector("#comment-count");
  let count = parseInt(countEl?.dataset.count || "247", 10);

  form.addEventListener("submit", e => {
    e.preventDefault();
    const nameInput = form.querySelector("#comment-name");
    const msgInput = form.querySelector("#comment-msg");
    const name = nameInput.value.trim() || "Anonymous";
    const msg = msgInput.value.trim();
    if (!msg) return;

    const now = new Date();
    const time = now.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

    const div = document.createElement("div");
    div.className = "comment new";
    div.innerHTML = `<div class="mini">☆</div><div><span class="name">${escapeHtml(name)}</span> <time>${time}</time><p>${escapeHtml(msg)}</p></div>`;
    list.prepend(div);

    count += 1;
    if (countEl) countEl.textContent = `(${Math.min(count, 6)} of ${count})`;

    nameInput.value = "";
    msgInput.value = "";
    showToast("Comment broadcast to the network.");
  });
}

/* ---------- metube video modal ---------- */
function initMetube(){
  const tiles = document.querySelectorAll("[data-video-title]");
  if (!tiles.length) return;

  const modal = document.createElement("div");
  modal.className = "video-modal";
  modal.innerHTML = `
    <div class="video-modal-inner">
      <div class="video-modal-screen">📼</div>
      <div class="video-modal-body">
        <button class="retro-btn video-modal-close" data-close-modal>✕ Close</button>
        <h3 data-modal-title></h3>
        <p data-modal-desc></p>
        <p class="dl-status" data-modal-views></p>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const titleEl = modal.querySelector("[data-modal-title]");
  const descEl = modal.querySelector("[data-modal-desc]");
  const viewsEl = modal.querySelector("[data-modal-views]");

  tiles.forEach(tile => {
    tile.addEventListener("click", e => {
      e.preventDefault();
      const title = tile.dataset.videoTitle;
      const desc = tile.dataset.videoDesc || "";
      let views = parseInt(tile.dataset.videoViews || "0", 10);
      views += 1;
      tile.dataset.videoViews = views;
      const p = tile.querySelector("p");
      if (p) p.textContent = p.textContent.replace(/[\d,]+(?= views)/, views.toLocaleString());

      titleEl.textContent = title;
      descEl.textContent = desc;
      viewsEl.textContent = `Now buffering across ${Math.floor(Math.random()*4)+2} unstable timelines...`;
      modal.classList.add("open");
    });
  });

  modal.addEventListener("click", e => {
    if (e.target === modal || e.target.closest("[data-close-modal]")) modal.classList.remove("open");
  });
}

/* ---------- wikiweirdia random article ---------- */
function initWikiweirdia(){
  const btn = document.querySelector("#random-article");
  if (!btn) return;
  const articles = [...document.querySelectorAll(".article-grid .tile")];

  btn.addEventListener("click", () => {
    articles.forEach(a => a.style.boxShadow = "");
    const pick = articles[Math.floor(Math.random() * articles.length)];
    pick.style.boxShadow = "0 0 0 2px var(--pink), 0 0 18px var(--pink)";
    pick.scrollIntoView({ behavior: "smooth", block: "center" });
    showToast(`Random entry: ${pick.querySelector("h2")?.textContent || "Unknown"}`);
  });

  document.querySelectorAll("[data-edit-article]").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      showToast("Edit reverted by a time traveler.");
    });
  });
}

/* ---------- geoglitches guestbook ---------- */
function initGuestbook(){
  const form = document.querySelector("#guestbook-form");
  if (!form) return;
  const list = document.querySelector("#guestbook-list");

  form.addEventListener("submit", e => {
    e.preventDefault();
    const nameInput = form.querySelector("#guestbook-name");
    const msgInput = form.querySelector("#guestbook-msg");
    const name = nameInput.value.trim() || "xX_Unknown_Xx";
    const msg = msgInput.value.trim();
    if (!msg) return;

    const div = document.createElement("div");
    div.className = "guestbook-entry new";
    div.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(msg)}`;
    list.prepend(div);

    nameInput.value = "";
    msgInput.value = "";
    showToast("Signed. It will outlive us all.");
  });
}

/* ---------- blockbuster rent ---------- */
function initBlockbuster(){
  document.querySelectorAll("[data-rent-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tile = btn.closest(".tile");
      if (!tile || tile.classList.contains("rented")) return;
      tile.classList.add("rented");
      btn.textContent = "Rented";
      const due = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
      showToast(`Rented. Due back ${due.toLocaleDateString()} in this timeline (or never, in others).`);
    });
  });
}

/* ---------- napsteroid download ---------- */
function initNapsteroid(){
  document.querySelectorAll("[data-download-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.busy) return;
      btn.dataset.busy = "1";
      const tile = btn.closest(".tile");
      const bar = tile.querySelector(".dl-progress");
      const fill = tile.querySelector(".dl-progress i");
      const status = tile.querySelector(".dl-status");
      bar.classList.add("show");
      btn.textContent = "Downloading...";
      let pct = 0;
      const timer = setInterval(() => {
        pct += Math.random() * 18;
        if (pct >= 99){
          pct = 99;
          clearInterval(timer);
          status.textContent = "99% — file corrupted in transit. Classic.";
          btn.textContent = "Retry Download";
          delete btn.dataset.busy;
        }
        fill.style.width = `${Math.min(pct,100)}%`;
        status.textContent = status.textContent.includes("corrupted") ? status.textContent : `${Math.floor(pct)}%`;
      }, 220);
    });
  });
}
