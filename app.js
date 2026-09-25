// 远程岗位工作台 — 数据加载 / 搜索 / 筛选 / 统计 / 渲染
const PAGE_SIZE = 50;

let allJobs = [];
let filtered = [];
let rendered = 0;
const state = { query: "", cat: "", region: "" };

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function dayOf(v) {
  if (!v) return "";
  return String(v).slice(0, 10);
}

async function boot() {
  const res = await fetch("data.json", { cache: "no-store" });
  const data = await res.json();
  allJobs = (data.jobs || []).map((j, i) => ({ ...j, n: i }));
  renderStats(data.generatedAt);
  renderChart();
  buildFilters();
  applyFilters();
  bind();
}

/* ── 统计 ── */
function renderStats(generatedAt) {
  const today = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const todayStr = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const weekStr = `${weekAgo.getFullYear()}-${p(weekAgo.getMonth() + 1)}-${p(weekAgo.getDate())}`;

  $("statToday").textContent = allJobs.filter((j) => dayOf(j.fetchedAt) === todayStr).length;
  $("stat7d").textContent = allJobs.filter((j) => dayOf(j.fetchedAt) >= weekStr).length;
  $("statTotal").textContent = allJobs.length;

  if (generatedAt) {
    $("syncInfo").textContent = `数据更新 ${generatedAt}`;
  } else {
    $("syncInfo").textContent = `累计 ${allJobs.length} 条岗位`;
  }
}

/* ── 14 天趋势图（responsive:false，手动按容器实测尺寸渲染，杜绝时序性溢出）── */
let trendChart = null;
function renderChart() {
  const days = [];
  const p = (n) => String(n).padStart(2, "0");
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  const counts = days.map((d) => allJobs.filter((j) => dayOf(j.fetchedAt) === d).length);
  const labels = days.map((d) => d.slice(5).replace("-", "/"));

  Chart.defaults.font.family = '"IBM Plex Mono", "PingFang SC", monospace';
  Chart.defaults.font.size = 10;

  const build = () => {
    const box = document.querySelector(".chart-box");
    box.innerHTML = '<canvas id="trendChart"></canvas>';
    const w = Math.max(box.clientWidth, 120);
    const h = Math.max(box.clientHeight, 60);
    const dpr = window.devicePixelRatio || 1;
    const cv = $("trendChart");
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    if (trendChart) trendChart.destroy();
    trendChart = new Chart(cv, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data: counts,
          backgroundColor: counts.map((c, i) => (i === 13 ? "#FF4F00" : "#D8D4CB")),
          hoverBackgroundColor: "#16181D",
          borderWidth: 0,
          maxBarThickness: 14,
        }],
      },
      options: {
        responsive: false,
        animation: false,
        devicePixelRatio: dpr,
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          x: {
            grid: { display: false },
            border: { color: "#E5E2DB" },
            ticks: { color: "#6F6D66", maxRotation: 0, autoSkip: true, maxTicksLimit: 6 },
          },
          y: { beginAtZero: true, ticks: { precision: 0, color: "#6F6D66" }, grid: { color: "#E5E2DB" }, border: { display: false } },
        },
      },
    });
  };

  build();
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(build, 200);
  });
}

/* ── 筛选器（Hero 区下拉框）── */
function buildFilters() {
  const cats = [...new Set(allJobs.map((j) => j.category).filter(Boolean))];
  const regions = [...new Set(allJobs.map((j) => j.region).filter(Boolean))];
  $("filterCat").innerHTML = cats.map((v) => `<sl-option value="${esc(v)}">${esc(v)}</sl-option>`).join("");
  $("filterRegion").innerHTML = regions.map((v) => `<sl-option value="${esc(v)}">${esc(v)}</sl-option>`).join("");
}

/* ── 过滤与渲染 ── */
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  filtered = allJobs.filter((j) => {
    if (state.cat && j.category !== state.cat) return false;
    if (state.region && j.region !== state.region) return false;
    if (q) {
      const hay = `${j.title}\n${j.company}\n${j.desc}\n${j.req}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  rendered = 0;
  $("jobList").innerHTML = "";
  renderBatch();
  renderToolbar();
}

function renderToolbar() {
  $("resultCount").innerHTML = `共 <strong>${filtered.length}</strong> 条 / 总计 ${allJobs.length}`;
  const chips = [];
  if (state.query) chips.push(["搜索", state.query, "query"]);
  if (state.cat) chips.push(["职类", state.cat, "cat"]);
  if (state.region) chips.push(["地区", state.region, "region"]);
  $("activeChips").innerHTML = chips
    .map(([k, v, key]) => `<sl-tag removable data-key="${key}">${k} · ${esc(v)}</sl-tag>`)
    .join("");
  $("activeChips").querySelectorAll("sl-tag[removable]").forEach((tag) => {
    tag.addEventListener("sl-remove", () => {
      const key = tag.dataset.key;
      if (key === "query") { $("search").value = ""; state.query = ""; }
      if (key === "cat") { $("filterCat").value = ""; state.cat = ""; }
      if (key === "region") { $("filterRegion").value = ""; state.region = ""; }
      applyFilters();
    });
  });
}

function renderBatch() {
  const slice = filtered.slice(rendered, rendered + PAGE_SIZE);
  const start = rendered;
  const html = slice
    .map((j, i) => {
      const idx = String(start + i + 1).padStart(3, "0");
      const desc = (j.desc || "").trim();
      const req = (j.req || "").trim();
      const long = desc.length > 180 || req.length > 90;
      return `
<article class="job-row" data-id="${esc(j.id)}">
  <div class="job-index">${idx}</div>
  <div class="job-main">
    <h3 class="job-title">${esc(j.title)}</h3>
    <div class="job-tags">
      ${j.company ? `<sl-badge class="badge-company">${esc(j.company.slice(0, 40))}</sl-badge>` : ""}
      ${j.category ? `<sl-badge class="badge-cat">${esc(j.category)}</sl-badge>` : ""}
      ${j.region ? `<sl-badge class="badge-region">${esc(j.region)}</sl-badge>` : ""}
    </div>
    <div class="field-block">
      <span class="field-label">职位描述</span>
      ${desc ? `<p class="field-text clamp-3">${esc(desc)}</p>` : `<p class="field-empty">本源未提供描述</p>`}
    </div>
    ${req ? `
    <div class="field-block">
      <span class="field-label">岗位需求</span>
      <p class="field-text clamp-2">${esc(req)}</p>
    </div>` : ""}
    ${long ? `
    <div class="expand-btn">
      <sl-button variant="text" size="small" class="expand-toggle">
        展开全文 <sl-icon name="chevron-down" slot="suffix" class="chev"></sl-icon>
      </sl-button>
    </div>` : ""}
  </div>
  <div class="job-cta">
    ${j.url ? `<sl-button variant="primary" size="small" href="${esc(j.url)}" target="_blank" rel="noopener">
      投递 <sl-icon name="arrow-up-right" slot="suffix"></sl-icon>
    </sl-button>` : ""}
  </div>
</article>`;
    })
    .join("");
  $("jobList").insertAdjacentHTML("beforeend", html);
  rendered += slice.length;
  $("moreWrap").hidden = rendered >= filtered.length;
  const endShown = rendered >= filtered.length && filtered.length > PAGE_SIZE;
  $("listEnd").hidden = !endShown;
  const empty = filtered.length === 0;
  $("emptyState").hidden = !empty;
}

/* ── 事件 ── */
function bind() {
  let t;
  $("search").addEventListener("sl-input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value || ""; applyFilters(); }, 160);
  });
  $("filterCat").addEventListener("sl-change", (e) => { state.cat = e.target.value || ""; applyFilters(); });
  $("filterRegion").addEventListener("sl-change", (e) => { state.region = e.target.value || ""; applyFilters(); });
  $("moreBtn").addEventListener("click", renderBatch);
  $("jobList").addEventListener("click", (e) => {
    const btn = e.target.closest(".expand-toggle");
    if (!btn) return;
    const row = btn.closest(".job-row");
    const expanded = row.classList.toggle("expanded");
    btn.innerHTML = expanded
      ? `收起 <sl-icon name="chevron-down" slot="suffix" class="chev" style="transform:rotate(180deg)"></sl-icon>`
      : `展开全文 <sl-icon name="chevron-down" slot="suffix" class="chev"></sl-icon>`;
  });
}

boot();
