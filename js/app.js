(() => {
  "use strict";

  const ROUNDS_CSV =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vT5ptE4nm4MeUEjrBtVLg-l19mlLfk_Ng89kPC0OM1JMskfk0CuFhnJeDpS1l7RxbKQPE8L053QT2lt/pub?gid=620210277&single=true&output=csv";

  const POINTS_PER_WIN = 3;
  const $ = (id) => document.getElementById(id);

  let cacheRounds = null;

  const PLAYER_BIOS = {
    "Ran Halifa":
      "הוותיק מבין המשתתפים, עם כמות המשחקים הגבוהה ביותר. יציאה מהמקום מהירה מאוד, סובל מפציעות באיברים שונים בגוף. לא אוהב שמגישים אליו סרב, ושחקן הגנה ברמה גבוהה מאוד עם שימוש מצוין בקיר. ללא ספק פייבוריט לסיים את הליגה במקום הראשון.",
    "Tal Shor":
      "מהירות של אוסיין בולט. משחק הרבה יותר עם השכל מאשר עם הרגש. האיש והלובים – לוביסט אמיתי. לעיתים נרתע מכדורים נמוכים. בקצב של 2–3 משחקים בשבוע, טל ניצב כפייבוריט ברור לזכייה בליגה.",
    "Omer Muallem":
      "לא מחבב לתת לוב, ויש שיגידו שעוד לא ניסה אפילו. יסודות הסקווש מעניקים לו את הטכניקה הטובה ביותר על המגרש, עם שימוש בזכוכית כמו שאף אחד מאיתנו לא יודע. חובט פצצות לצידי המגרש ומוגדר כפייבוריט חזק לזכייה בליגה.",
    "Lior Usishkin Engelchin":
      "חולם לסיים במקום השלישי – הישג שיהיה גדול מאוד מבחינתו."
  };

  function setStatus(msg) {
    const el = $("status");
    if (el) el.textContent = msg || "";
  }

  async function fetchText(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`CSV load failed (${r.status})`);
    return await r.text();
  }

  function esc(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normHeader(s) {
    return String(s ?? "")
      .toLowerCase()
      .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
      .replace(/\s+/g, "")
      .replace(/[:\-_]/g, "")
      .trim();
  }

  function parseCsv(text) {
    const raw = String(text ?? "").replace(/\r/g, "").replace(/^\uFEFF/, "");
    if (!raw.trim()) return { headers: [], rows: [] };

    const lines = raw.split("\n").filter((l) => l.trim() !== "");

    const splitLine = (line) => {
      const out = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (q && line[i + 1] === '"') { cur += '"'; i++; }
          else q = !q;
        } else if (ch === "," && !q) {
          out.push(cur); cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((x) => String(x ?? "").trim());
    };

    const all = lines.map(splitLine);
    const headers = (all[0] ?? []).map((h) => String(h ?? "").trim());
    const bodyRaw = all.slice(1);

    const body = bodyRaw.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));

    const normBody = body.map((r) => {
      const arr = r.slice(0, headers.length);
      while (arr.length < headers.length) arr.push("");
      return arr;
    });

    return { headers, rows: normBody };
  }

  function stripEmptyColumns(headers, rows) {
    const keep = headers.map((h, i) => {
      const hasHeader = String(h ?? "").trim() !== "";
      const hasData = rows.some((r) => String(r[i] ?? "").trim() !== "");
      return hasHeader || hasData;
    });

    let first = 0;
    while (first < keep.length && !keep[first]) first++;
    let last = keep.length - 1;
    while (last >= 0 && !keep[last]) last--;

    const idxs = [];
    const newHeaders = [];
    for (let i = first; i <= last; i++) {
      if (keep[i]) { idxs.push(i); newHeaders.push(headers[i] ?? ""); }
    }
    const newRows = rows.map((r) => idxs.map((i) => r[i] ?? ""));
    return { headers: newHeaders, rows: newRows };
  }

  function findHeaderIndex(headers, candidates) {
    const nh = headers.map(normHeader);
    for (const c of candidates) {
      const idx = nh.indexOf(normHeader(c));
      if (idx >= 0) return idx;
    }
    for (const c of candidates) {
      const key = normHeader(c);
      const idx = nh.findIndex((h) => h.includes(key));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseScore(s) {
    const t = String(s ?? "").trim();
    if (!t) return null;
    const clean = t.replace(/[–—−־]/g, "-").replaceAll(":", "-");
    const m = clean.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (!((a === 2 && (b === 0 || b === 1)) || (b === 2 && (a === 0 || a === 1)))) return null;
    return { a, b };
  }

  function parseRoundNumber(v) {
    const t = String(v ?? "").trim();
    if (!t) return null;
    const m = t.match(/\d+/);
    if (!m) return null;
    const num = Number(m[0]);
    return Number.isFinite(num) ? num : null;
  }

  function isPlaceholderName(name) {
    const n = String(name ?? "").trim();
    if (!n) return true;
    const low = n.toLowerCase();
    if (low === "vs") return true;
    if (/^player\s*\d+$/i.test(n)) return true;
    if (low === "team a" || low === "team b") return true;
    return false;
  }

  function firstNameSlug(fullName) {
    const n = String(fullName ?? "").trim();
    if (!n) return "";
    const first = n.split(/\s+/)[0] || "";
    return first.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function initials(fullName) {
    const parts = String(fullName ?? "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "";
    const a = parts[0]?.[0] ?? "";
    const b = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
    return (a + b).toUpperCase();
  }

  function playerImagePath(fullName) {
    const slug = firstNameSlug(fullName);
    return slug ? `images/${slug}.png` : "";
  }

  async function loadRounds() {
    if (cacheRounds) return cacheRounds;
    setStatus("Loading rounds…");
    const txt = await fetchText(ROUNDS_CSV);
    const parsed = parseCsv(txt);
    cacheRounds = stripEmptyColumns(parsed.headers, parsed.rows);
    setStatus("");
    return cacheRounds;
  }

  function computeStandingsFromRounds(rounds) {
    const h = rounds.headers;
    const rows = rounds.rows;

    const iRound = (() => { const x = findHeaderIndex(h, ["round"]); return x >= 0 ? x : 0; })();
    const iP1    = (() => { const x = findHeaderIndex(h, ["player1","player 1"]); return x >= 0 ? x : 1; })();
    const iP2    = (() => { const x = findHeaderIndex(h, ["player2","player 2"]); return x >= 0 ? x : 2; })();
    const iP3    = (() => { const x = findHeaderIndex(h, ["player3","player 3"]); return x >= 0 ? x : 4; })();
    const iP4    = (() => { const x = findHeaderIndex(h, ["player4","player 4"]); return x >= 0 ? x : 5; })();
    const iScore = (() => { const x = findHeaderIndex(h, ["score","result"]); return x >= 0 ? x : 6; })();

    const stats = new Map();
    const ensure = (name) => {
      const n = String(name ?? "").trim();
      if (!n || isPlaceholderName(n)) return null;
      if (!stats.has(n)) stats.set(n, { name:n, points:0, sw:0, sl:0 });
      return stats.get(n);
    };

    for (const r of rows) {
      const rn = parseRoundNumber(r[iRound]);
      if (rn === null) continue;

      const p1 = String(r[iP1] ?? "").trim();
      const p2 = String(r[iP2] ?? "").trim();
      const p3 = String(r[iP3] ?? "").trim();
      const p4 = String(r[iP4] ?? "").trim();

      [p1,p2,p3,p4].forEach(ensure);

      const sc = parseScore(r[iScore]);
      if (!sc) continue;

      const teamA = [p1,p2].filter(x => x && !isPlaceholderName(x));
      const teamB = [p3,p4].filter(x => x && !isPlaceholderName(x));
      if (teamA.length !== 2 || teamB.length !== 2) continue;

      const a = sc.a, b = sc.b;

      teamA.forEach(n => { const s = ensure(n); if (s){ s.sw += a; s.sl += b; }});
      teamB.forEach(n => { const s = ensure(n); if (s){ s.sw += b; s.sl += a; }});

      if (a > b) teamA.forEach(n => { const s = ensure(n); if (s) s.points += POINTS_PER_WIN; });
      else if (b > a) teamB.forEach(n => { const s = ensure(n); if (s) s.points += POINTS_PER_WIN; });
    }

    const list = Array.from(stats.values());
    list.sort((x,y)=>{
      const pd = y.points - x.points; if(pd) return pd;
      const sd = (y.sw - y.sl) - (x.sw - x.sl); if(sd) return sd;
      const swd = y.sw - x.sw; if(swd) return swd;
      return x.name.localeCompare(y.name);
    });

    return list.map((s, idx)=>({
      place: idx+1,
      name: s.name,
      points: s.points,
      setsRecord: `${s.sw}-${s.sl}`
    }));
  }

  function renderStandings(tableEl, standings) {
    if (!tableEl) return;

    const headers = ["Place","Player Name","Points","Sets Record"];
    const thead = `<thead><tr>` + headers.map(h=>`<th>${esc(h.toUpperCase())}</th>`).join("") + `</tr></thead>`;

    const tbody = `<tbody>` + standings.map(row=>{
      const p = String(row.place);
      const cls = p==="1"?"posBadge pos1":p==="2"?"posBadge pos2":p==="3"?"posBadge pos3":"posBadge";

      const cells = [
        `<td data-label="PLACE"><span class="${cls}">${esc(row.place)}</span></td>`,
        `<td data-label="PLAYER NAME">${esc(row.name)}</td>`,
        `<td data-label="POINTS">${esc(row.points)}</td>`,
        `<td data-label="SETS RECORD">${esc(row.setsRecord)}</td>`
      ].join("");

      return `<tr>${cells}</tr>`;
    }).join("") + `</tbody>`;

    tableEl.innerHTML = thead + tbody;
  }

  function renderRoundsTable(tableEl, headers, rows) {
    if (!tableEl) return;

    const order = ["round","player1","player2","vs","player3","player4","score"];
    const idxMap = new Map(headers.map((h,i)=>[normHeader(h), i]));
    const cols = order.map(k=>({k, i: idxMap.get(k)})).filter(c=>Number.isInteger(c.i));

    const useHeaders = cols.length >= 5 ? cols.map(c=>headers[c.i]) : headers;
    const useIdxs    = cols.length >= 5 ? cols.map(c=>c.i) : headers.map((_,i)=>i);

    const labels = useHeaders.map(h => String(h ?? "").trim().toUpperCase());
    const scoreIdx = useHeaders.map(normHeader).findIndex(h=>h==="score");

    const thead = `<thead><tr>` + useHeaders.map(h=>`<th>${esc(String(h??"").trim().toUpperCase())}</th>`).join("") + `</tr></thead>`;
    const tbody = `<tbody>` + rows.map(r=>{
      const tds = useIdxs.map((srcI, outI)=>{
        const raw = String(r[srcI] ?? "").trim();
        const label = labels[outI] || "VALUE";
        if(outI === scoreIdx && raw){
          const shown = raw.replace(/[–—−־]/g,"-");
          return `<td data-label="${esc(label)}" class="scoreCell">${esc(shown)}</td>`;
        }
        return `<td data-label="${esc(label)}">${esc(raw)}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    }).join("") + `</tbody>`;

    tableEl.innerHTML = thead + tbody;
  }

  function buildPlayersFromRounds(rounds) {
    const box = $("playersList");
    if (!box) return;

    const h = rounds.headers;
    const rows = rounds.rows;

    const iP1 = (() => { const x = findHeaderIndex(h, ["player1","player 1"]); return x >= 0 ? x : 1; })();
    const iP2 = (() => { const x = findHeaderIndex(h, ["player2","player 2"]); return x >= 0 ? x : 2; })();
    const iP3 = (() => { const x = findHeaderIndex(h, ["player3","player 3"]); return x >= 0 ? x : 4; })();
    const iP4 = (() => { const x = findHeaderIndex(h, ["player4","player 4"]); return x >= 0 ? x : 5; })();

    const set = new Set();
    for (const r of rows) {
      [iP1,iP2,iP3,iP4].forEach(i=>{
        const v = String(r[i] ?? "").trim();
        if (v && !isPlaceholderName(v)) set.add(v);
      });
    }

    const list = Array.from(set).sort((a,b)=>a.localeCompare(b));

    box.innerHTML = list.map(name=>{
      const img = playerImagePath(name);
      const bio = PLAYER_BIOS[name] || "";
      const init = initials(name);

      return `
        <div class="playerCard">
          <div class="playerAvatarWrap">
            <img class="playerAvatar" src="${esc(img)}" alt="${esc(name)}"
              onerror="this.style.display='none'; this.parentElement.querySelector('.playerFallback').style.display='grid';" />
            <div class="playerFallback" style="display:none">${esc(init)}</div>
          </div>
          <div class="playerName">${esc(name)}</div>
          ${bio ? `<div class="playerBio">${esc(bio)}</div>` : ``}
        </div>
      `;
    }).join("");
  }

  function renderRules() {
    const box = $("rulesBox");
    if (!box) return;

    box.innerHTML = `
      <ul class="rulesList">
        <li>הליגה תיארך כ־6 מחזורים כאשר כל אחד משחק עם כלל חברי הליגה 2 משחקים</li>
        <li>ניצחון שווה 3 נקודות לכל שחקן מהצמד המנצח</li>
        <li>המשחקים הם הטוב מ־3!</li>
        <li>מקום ראשון חותם על המחבטים של שאר המתמודדים בטוש לא מחיק</li>
        <li>מקום אחרון מארח את שאר המתמודדים</li>
      </ul>
    `;
  }

  function hideAllPanels() {
    ["panelTable","panelRounds","panelPlayers","panelRules"].forEach(id=>{
      const el = $(id);
      if (!el) return;
      el.classList.add("isHidden");
      el.setAttribute("aria-hidden","true");
    });
  }

  function showPanel(id) {
    hideAllPanels();
    const el = $(id);
    if (!el) return;
    el.classList.remove("isHidden");
    el.setAttribute("aria-hidden","false");
    el.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  async function openTable() {
    showPanel("panelTable");
    const rounds = await loadRounds();
    const standings = computeStandingsFromRounds(rounds);
    renderStandings($("table"), standings);
  }

  async function openRounds() {
    showPanel("panelRounds");
    const data = await loadRounds();
    renderRoundsTable($("rounds"), data.headers, data.rows);
  }

  async function openPlayers() {
    showPanel("panelPlayers");
    const rounds = await loadRounds();
    buildPlayersFromRounds(rounds);
  }

  async function openRules() {
    showPanel("panelRules");
    renderRules();
  }

  function wireUI() {
    hideAllPanels();

    $("btnTable")?.addEventListener("click", () => openTable().catch(console.error));
    $("btnRounds")?.addEventListener("click", () => openRounds().catch(console.error));
    $("btnPlayers")?.addEventListener("click", () => openPlayers().catch(console.error));
    $("btnRules")?.addEventListener("click", () => openRules().catch(console.error));

    document.querySelectorAll("[data-close]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        hideAllPanels();
        window.scrollTo({ top:0, behavior:"smooth" });
      });
    });

    loadRounds().catch(()=>{});
  }

  wireUI();
})();
