/* ==========================================================================
   通用查看器逻辑
   使用方式：viewer.html?p=<题库id>
   数据约定：data/<id>.js  内容为  window.PAPER = { title, sub, questions:[...] }
   ========================================================================== */
(function () {
  "use strict";

  const TYPE_NAME = { "1": "单选题", "2": "多选题", "3": "判断题" };
  const LS_THEME = "qb.theme";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
  const KEY = (i) => String.fromCharCode(65 + i);

  let DATA = [];
  let curKw = "";
  let io = null;

  /* ----------------------------- 主题 ----------------------------- */
  function setTheme(t, save) {
    document.documentElement.dataset.theme = t;
    const btn = $("theme");
    if (btn) btn.textContent = t === "dark" ? "🌙" : "☀️";
    if (save) { try { localStorage.setItem(LS_THEME, t); } catch (e) {} }
  }
  (function initTheme() {
    let t = null;
    try { t = localStorage.getItem(LS_THEME); } catch (e) {}
    if (t !== "light" && t !== "dark") t = "dark";   // 默认深色
    setTheme(t, false);
  })();
  const themeBtn = $("theme");
  if (themeBtn) {
    themeBtn.onclick = () =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
  }

  /* --------------------------- 答案解析 --------------------------- */
  // 返回大写字母数组；判断题等文本答案返回原文
  function parseAns(ans) {
    const a = String(ans == null ? "" : ans).trim();
    if (/^[A-Za-z](?:\s*[,，、;；\s]\s*[A-Za-z])*$/.test(a)) {
      return a.toUpperCase().replace(/[^A-Z]/g, "").split("");
    }
    return [a];
  }

  /* --------------------------- 关键词高亮 --------------------------- */
  function hl(raw) {
    const s = String(raw == null ? "" : raw);
    if (!curKw) return esc(s);
    const low = s.toLowerCase();
    let out = "", i = 0, guard = 0;
    while (guard++ < 500) {
      const p = low.indexOf(curKw, i);
      if (p === -1) { out += esc(s.slice(i)); break; }
      out += esc(s.slice(i, p)) + "<mark>" + esc(s.slice(p, p + curKw.length)) + "</mark>";
      i = p + curKw.length;
    }
    return out;
  }

  /* ----------------------------- 渲染 ----------------------------- */
  function cardHTML(q, i) {
    const ans = parseAns(q.ans);
    const isJudge = q.type === "3";
    const ansLabel = isJudge
      ? ans.join("")
      : (ans.length > 1 ? ans.join("") + "（多选）" : ans.join(""));
    const opts = (q.opts || []).map((text, j) => {
      const k = KEY(j);
      const ok = ans.includes(k) || ans.includes(String(text).trim());
      return `<li class="opt${ok ? " correct" : ""}">
        <span class="key">${isJudge ? (j === 0 ? "√" : "×") : k}</span>
        <span class="txt">${hl(text)}</span>
      </li>`;
    }).join("");
    const exp = q.exp ? `<div class="exp"><span class="k">解析：</span>${hl(q.exp)}</div>` : "";
    const flat = [q.q].concat(q.opts || [], [q.exp || ""]).join(" ");
    return `<article class="card" data-id="${esc(q.id)}" data-t="${esc(q.type)}" data-text="${esc(flat.toLowerCase())}">
      <div class="card-head">
        <span class="idx">${i + 1}</span>
        <span class="tag t${q.type}">${TYPE_NAME[q.type] || "题目"}</span>
      </div>
      <p class="q">${hl(q.q)}</p>
      <ul class="opts">${opts}</ul>
      <div class="ans"><span class="k">答案</span><span class="v">${esc(ansLabel)}</span></div>
      ${exp}
    </article>`;
  }

  function renderStats() {
    const box = $("stats");
    if (!box) return;
    const c = (t) => DATA.filter((q) => q.type === t).length;
    box.innerHTML =
      `<span class="chip">共 <b>${DATA.length}</b> 题</span>` +
      `<span class="chip">单选 <b>${c("1")}</b></span>` +
      `<span class="chip">多选 <b>${c("2")}</b></span>` +
      `<span class="chip">判断 <b>${c("3")}</b></span>` +
      `<span class="chip hit" id="hitChip" style="display:none">搜索到 <b id="hitN">0</b> 题</span>`;
  }

  function render() {
    $("list").innerHTML = DATA.map(cardHTML).join("");
    renderStats();
  }

  /* ----------------------------- 搜索 ----------------------------- */
  const search = $("search");
  const clearBtn = $("clear");

  function applyFilter() {
    const cards = document.querySelectorAll(".card");
    let hit = 0;
    cards.forEach((c) => {
      const ok = !curKw || c.dataset.text.includes(curKw);
      c.style.display = ok ? "" : "none";
      if (ok) hit++;
    });
    const chip = $("hitChip");
    if (chip) {
      chip.style.display = curKw ? "" : "none";
      $("hitN").textContent = hit;
    }
  }

  function doSearch() {
    const kw = search.value.trim().toLowerCase();
    clearBtn.classList.toggle("show", !!kw);
    if (kw !== curKw) {
      curKw = kw;
      render();           // 重建以应用 / 清除高亮
    }
    applyFilter();
  }

  let timer;
  search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(doSearch, 120); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { search.value = ""; doSearch(); }
  });
  clearBtn.onclick = () => { search.value = ""; doSearch(); search.focus(); };

  /* --------------------------- 回到顶部 --------------------------- */
  const totop = $("totop");
  addEventListener("scroll", () => totop.classList.toggle("show", scrollY > 500), { passive: true });
  totop.onclick = () => scrollTo({ top: 0, behavior: "smooth" });

  /* --------------------------- 加载题库 --------------------------- */
  function fail(msg) {
    const bar = $("bar");
    if (bar) bar.style.display = "none";          // 出错时不显示搜索栏
    const t = $("ptitle");
    if (t) t.textContent = "题库加载失败";
    const sub = $("sub");
    if (sub) sub.textContent = "";
    const stats = $("stats");
    if (stats) stats.innerHTML = "";
    document.title = "题库加载失败";
    const list = $("list");
    if (list) {
      list.innerHTML = `<div class="empty"><span>😕</span>${esc(msg)}` +
        `<div style="margin-top:16px"><a class="go" style="display:inline-block;padding:9px 18px;border-radius:11px;" href="index.html">返回题库导航</a></div></div>`;
    }
  }

  function init() {
    const id = new URLSearchParams(location.search).get("p");
    if (!id) { fail("没有指定题库，请从题库导航页进入。"); return; }

    const s = document.createElement("script");
    s.src = "data/" + encodeURIComponent(id) + ".js";
    s.onload = function () {
      const P = window.PAPER;
      if (!P || !Array.isArray(P.questions) || !P.questions.length) {
        fail("题库「" + id + "」数据为空。"); return;
      }
      DATA = P.questions;
      document.title = P.title + (P.sub ? " · " + P.sub : "");
      const t = $("ptitle");
      if (t) t.textContent = P.title;
      const sub = $("sub");
      if (sub) sub.textContent = P.sub || "";
      render();
    };
    s.onerror = function () {
      fail("找不到题库「" + id + "」，请检查 data/" + id + ".js 是否存在。");
    };
    document.head.appendChild(s);
  }

  init();
})();
