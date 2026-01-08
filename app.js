console.log('*** SCRIPT LOADED: PerfumeRecSys front ***');

function $(id) { return document.getElementById(id); }

/* ===================== 首页固定配置 ===================== */
const HOME_K = 15;           // 默认 K=15（热门/均衡/办公/大模型）
const HOME_ALL_K = 9999;     // 首页用一个足够大的数，等于“全量”
const PAGE_SIZE_MAX = 10;    // 每页最多 10 条

/* ===================== 稳定 userId ===================== */
function uuidv4() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getStableUserId() {
  const key = 'perfume_uid';
  let uid = localStorage.getItem(key);
  if (!uid) {
    uid = uuidv4();
    localStorage.setItem(key, uid);
  }
  return uid;
}

const UID = getStableUserId();

/* ===================== HTTP 工具 ===================== */
async function callApi(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-User-Id', UID);

  const res = await fetch(url, { ...options, headers });
  const resp = await res.json().catch(() => null);
  if (!resp) throw new Error('响应不是合法 JSON');
  if (resp.ok !== true) throw new Error(resp.error || '请求失败');
  return resp;
}

async function postJson(url, payload) {
  return await callApi(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {})
  });
}

function getRecoCtx() {
  return window.__recoCtx || {};
}

/* ===================== UI 基础 ===================== */
function setStatus(msg, type) {
  const box = $('status');
  if (!box) return;

  const t = (type === 'error' || type === 'ok' || type === 'warn' || type === 'info') ? type : 'info';
  box.className = `statusbar ${t}`;

  let text = '';
  if (Array.isArray(msg)) {
    text = msg.map(x => (x === null || x === undefined) ? '' : String(x)).join('\n');
  } else if (typeof msg === 'string') {
    text = msg;
  } else if (msg === null || msg === undefined) {
    text = '';
  } else {
    text = String(msg);
  }
  box.textContent = text;
}

function clearResult() {
  const root = $('result');
  if (root) root.innerHTML = '';
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtNum(x) {
  if (x === null || x === undefined || x === '') return '-';
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return n.toFixed(4);
}

/* ===================== 收藏/购买 状态缓存 ===================== */
let likedSetCache = null;
let purchasedSetCache = null;

async function loadLikedSet() {
  if (likedSetCache) return likedSetCache;
  const resp = await callApi('/api/events/liked');
  const arr = resp.data || [];
  likedSetCache = new Set(arr.map(x => Number(x)).filter(x => Number.isFinite(x)));
  return likedSetCache;
}

async function loadPurchasedSet() {
  if (purchasedSetCache) return purchasedSetCache;
  const resp = await callApi('/api/events/purchased');
  const arr = resp.data || [];
  purchasedSetCache = new Set(arr.map(x => Number(x)).filter(x => Number.isFinite(x)));
  return purchasedSetCache;
}

function markFlagsOnItems(items) {
  for (const it of items || []) {
    const id = Number(it.id);
    it.collected = likedSetCache ? likedSetCache.has(id) : false;
    it.purchased = purchasedSetCache ? purchasedSetCache.has(id) : false;
  }
  return items;
}

/* ===================== 前端分页 ===================== */
const __pager = { items: [], page: 1, pageSize: 10 };

function computePageSize(total) {
  const t = Number(total) || 0;
  if (t <= 0) return PAGE_SIZE_MAX;
  return Math.min(PAGE_SIZE_MAX, t);
}

function setPagedItems(items) {
  __pager.items = Array.isArray(items) ? items : [];
  __pager.page = 1;
  __pager.pageSize = computePageSize(__pager.items.length);
}

function gotoPage(p) {
  const total = __pager.items.length;
  const ps = __pager.pageSize || PAGE_SIZE_MAX;
  const totalPages = Math.max(1, Math.ceil(total / ps));

  let page = Number(p);
  if (!Number.isFinite(page)) page = 1;
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  __pager.page = page;
  renderPagedView();
}

function buildPager(totalPages, currentPage) {
  const wrap = document.createElement('div');
  wrap.className = 'pagination';

  function addBtn(text, page, disabled, active) {
    const b = document.createElement('button');
    b.className = 'page-btn' + (active ? ' active' : '');
    b.textContent = text;
    b.disabled = !!disabled;
    b.onclick = () => gotoPage(page);
    wrap.appendChild(b);
  }

  addBtn('上一页', currentPage - 1, currentPage <= 1, false);

  const windowSize = 7;
  let left = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let right = left + windowSize - 1;
  if (right > totalPages) {
    right = totalPages;
    left = Math.max(1, right - windowSize + 1);
  }

  if (left > 1) {
    addBtn('1', 1, false, currentPage === 1);
    if (left > 2) {
      const dots = document.createElement('span');
      dots.textContent = '...';
      dots.style.padding = '0 6px';
      wrap.appendChild(dots);
    }
  }

  for (let i = left; i <= right; i++) {
    addBtn(String(i), i, false, i === currentPage);
  }

  if (right < totalPages) {
    if (right < totalPages - 1) {
      const dots = document.createElement('span');
      dots.textContent = '...';
      dots.style.padding = '0 6px';
      wrap.appendChild(dots);
    }
    addBtn(String(totalPages), totalPages, false, currentPage === totalPages);
  }

  addBtn('下一页', currentPage + 1, currentPage >= totalPages, false);
  return wrap;
}

function renderPagedView() {
  const root = $('result');
  if (!root) return;

  root.innerHTML = '';

  const total = __pager.items.length;
  if (total === 0) {
    root.innerHTML = '<div class="statusbar info">暂无推荐结果</div>';
    return;
  }

  const ps = __pager.pageSize || PAGE_SIZE_MAX;
  const totalPages = Math.max(1, Math.ceil(total / ps));
  const page = Math.min(Math.max(1, __pager.page), totalPages);

  const start = (page - 1) * ps;
  const end = Math.min(start + ps, total);
  const slice = __pager.items.slice(start, end);

  renderItemsPage(slice, start);

  if (totalPages > 1) {
    root.appendChild(buildPager(totalPages, page));
  }
}

/* ===================== 顶部状态条摘要 ===================== */
function renderHeader(data, warning) {
  const lines = [];
  if (warning) lines.push(`提示：${String(warning)}`);

  const mode = (data && data.mode) ? String(data.mode) : (getRecoCtx().model || 'BALANCED');
  const k = (data && typeof data.k !== 'undefined') ? data.k : HOME_K;
  const seedText = (data && data.seed && data.seed.name)
    ? `${data.seed.name}${data.seed.brand ? `（${data.seed.brand}）` : ''}` : null;

  const total = __pager.items.length;
  const ps = __pager.pageSize || PAGE_SIZE_MAX;
  const totalPages = Math.max(1, Math.ceil(total / ps));
  const page = Math.min(Math.max(1, __pager.page || 1), totalPages);

  if (seedText) {
    lines.push(`相似推荐：基于「${seedText}」 · 模式 ${mode} · K=${k} · 共 ${total} 条 · 第 ${page}/${totalPages} 页`);
  } else {
    lines.push(`热门推荐：模式 ${mode} · K=${k} · 共 ${total} 条 · 第 ${page}/${totalPages} 页`);
  }

  setStatus(lines, 'info');
}

/* ===================== 列表渲染 ===================== */
function renderItems(items) {
  setPagedItems(items);
  renderPagedView();
}

function goPerfumeDetail(itemOrId) {
  const id = (typeof itemOrId === 'object') ? Number(itemOrId.id) : Number(itemOrId);
  if (!Number.isFinite(id)) return;
  window.location.href = `/perfume.html?id=${encodeURIComponent(String(id))}`;
}

function renderItemsPage(items, offset) {
  const root = $('result');
  if (!root) return;

  const showDebug = !!($('debug') && $('debug').checked);

  const grid = document.createElement('div');
  grid.className = 'grid';

  function isCollected(it) { return !!(it && (it._collected || it.collected)); }
  function isPurchased(it) { return !!(it && (it._purchased || it.purchased)); }

  // ✅ 生成商品图 URL（按 id 命名最稳）
  function buildPosterUrl(it) {
    const id = it && (it.id !== undefined && it.id !== null) ? String(it.id) : '';
    // 图片路径：/static/images/perfumes/{id}.jpg  →  浏览器访问：/images/perfumes/{id}.jpg
    return id ? `/images/perfumes/${encodeURIComponent(id)}.jpg` : '';
  }

  // ✅ 给 background-image 做安全包装
  function cssUrl(u) {
    if (!u) return '';
    return `url('${String(u).replaceAll("'", "%27")}')`;
  }

  function extractChips(it) {
    const chips = [];
    const tryArrays = [it && it.accords, it && it.tags, it && it.styles, it && it.seasons, it && it.scenes];
    for (const arr of tryArrays) {
      if (Array.isArray(arr)) {
        for (const x of arr) {
          const s = String(x || '').trim();
          if (s) chips.push(s);
          if (chips.length >= 3) return chips;
        }
      }
    }
    const tryStrings = [it && it.gender, it && it.family, it && it.type];
    for (const s0 of tryStrings) {
      const s = String(s0 || '').trim();
      if (s) chips.push(s);
      if (chips.length >= 3) break;
    }
    return chips.slice(0, 3);
  }

  items.forEach((it, idx) => {
    const rank = (Number(offset) || 0) + idx + 1;

    const card = document.createElement('div');
    card.className = 'card card-link';

    const name = it && it.name ? String(it.name) : '未命名香水';
    const brand = it && it.brand ? String(it.brand) : '';

    const chips = extractChips(it);
    const chipsHtml = chips.length
      ? `<div class="chips">${chips.map(x => `<span class="chip">${escapeHtml(x)}</span>`).join('')}</div>`
      : '';

    const collected = isCollected(it);
    const purchased = isPurchased(it);

    let debugHtml = '';
    if (showDebug) {
      const reasons = (it && Array.isArray(it.reasons)) ? it.reasons : [];
      debugHtml = `
        <details class="debug">
          <summary>调试信息（可折叠）</summary>
          <div class="meta" style="margin-top:10px;">
            <span>score: ${fmtNum(it && it.score)}</span>
            <span>simCore: ${fmtNum(it && it.simCore)}</span>
            <span>accordSim: ${fmtNum(it && it.accordSim)}</span>
            <span>mapSim: ${fmtNum(it && it.mapSim)}</span>
          </div>
          ${reasons.length ? `<ul class="reasons">${reasons.map(x => `<li>${escapeHtml(String(x))}</li>`).join('')}</ul>` : ''}
        </details>
      `;
    }

    const posterUrl = buildPosterUrl(it);
    const fallbackUrl = '/images/perfumes/placeholder.jpg';

    card.innerHTML = `
      <div class="poster" style="${posterUrl ? `background-image:${cssUrl(posterUrl)};` : ''}">
        <img class="poster-img"
             src="${escapeHtml(posterUrl || fallbackUrl)}"
             alt=""
             loading="lazy"
             onerror="this.onerror=null; this.src='${escapeHtml(fallbackUrl)}';"
             style="display:none;" />
      </div>

      <div class="card-body">
        <div class="item-title">${escapeHtml(`${rank}. ${name}`)}</div>
        ${brand ? `<div class="item-subtitle">${escapeHtml(brand)}</div>` : ''}
        ${chipsHtml}

        <div style="margin-top:12px;display:flex;gap:10px;align-items:center;">
          <button class="btn btn-primary btn-collect">${collected ? '已收藏' : '收藏'}</button>
          <button class="btn btn-purchase">${purchased ? '再次购买' : '购买'}</button>
        </div>

        ${debugHtml}
      </div>
    `;

    const posterDiv = card.querySelector('.poster');
    const probeImg = card.querySelector('.poster-img');
    if (posterDiv && probeImg) {
      probeImg.onload = () => {
        try { posterDiv.style.backgroundImage = cssUrl(probeImg.src); } catch (_) {}
      };
      if (posterUrl) probeImg.src = posterUrl;
    }

    card.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.closest && t.closest('button')) return;
      goPerfumeDetail(it);
    });

    const btnCollect = card.querySelector('.btn-collect');
    const btnPurchase = card.querySelector('.btn-purchase');

    if (collected && btnCollect) btnCollect.disabled = true;

    if (btnCollect) {
      btnCollect.onclick = async (e) => {
        e.stopPropagation();
        try {
          btnCollect.disabled = true;
          await sendCollect(it.id, rank);
          it._collected = true;
          btnCollect.textContent = '已收藏';
          btnCollect.disabled = true;
        } catch (e2) {
          btnCollect.disabled = false;
          alert('收藏失败：' + (e2 && e2.message ? e2.message : e2));
        }
      };
    }

    if (btnPurchase) {
      btnPurchase.onclick = async (e) => {
        e.stopPropagation();
        const oldText = btnPurchase.textContent;
        btnPurchase.disabled = true;
        btnPurchase.textContent = '记录中...';
        try {
          await sendPurchase(it.id, rank);
          it._purchased = true;
          btnPurchase.textContent = '再次购买';
        } catch (e2) {
          btnPurchase.textContent = oldText;
          alert('购买失败：' + (e2 && e2.message ? e2.message : e2));
        } finally {
          btnPurchase.disabled = false;
        }
      };
    }

    grid.appendChild(card);
  });

  root.appendChild(grid);
}

/* ===================== 事件上报 ===================== */
async function sendCollect(itemId, rank) {
  const ctx = getRecoCtx();
  const payload = {
    itemId: Number(itemId),
    seedId: (ctx.seedId === null || ctx.seedId === undefined) ? null : Number(ctx.seedId),
    rank: Number(rank),
    model: String(ctx.model || 'BALANCED'),
    source: 'reco',
    extra: ''
  };
  return await postJson('/api/events/reco/collect', payload);
}

async function sendPurchase(itemId, rank) {
  const ctx = getRecoCtx();
  const payload = {
    itemId: Number(itemId),
    seedId: (ctx.seedId === null || ctx.seedId === undefined) ? null : Number(ctx.seedId),
    rank: Number(rank),
    model: String(ctx.model || 'BALANCED'),
    source: 'reco',
    extra: ''
  };
  return await postJson('/api/events/reco/purchase', payload);
}

/* ===================== 推荐请求 ===================== */
async function recommendPopular(kOverride) {
  const k = Number.isFinite(Number(kOverride)) ? Number(kOverride) : HOME_K;
  const debug = ($('debug') && $('debug').checked) ? 1 : 0;

  setStatus('正在加载：热门推荐...', 'info');
  clearResult();

  try {
    const url = `/api/recommend/popular?k=${encodeURIComponent(String(k))}&debug=${debug}`;
    const resp = await callApi(url);

    window.__recoCtx = { seedId: null, model: 'POPULAR' };

    await loadLikedSet();
    await loadPurchasedSet();

    const items = (resp.data && Array.isArray(resp.data.items)) ? resp.data.items : [];
    markFlagsOnItems(items);

    renderItems(items);
    renderHeader(resp.data, resp.warning);

  } catch (err) {
    setStatus('加载失败：' + (err && err.message ? err.message : err), 'error');
  }
}

function getLastSeedId() {
  const v = sessionStorage.getItem('lastSeedId');
  if (!v) return null;
  const id = Number(v);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

async function recommendSeedById(seedId, mode) {
  const id = Number(seedId);
  if (!Number.isFinite(id) || id <= 0) {
    setStatus('提示：请先进入任意香水详情页，再返回首页即可生成相似推荐。', 'info');
    clearResult();
    return;
  }

  const m = mode ? String(mode) : 'BALANCED';
  const debug = ($('debug') && $('debug').checked) ? 1 : 0;

  setStatus('正在加载：相似推荐...', 'info');
  clearResult();

  try {
    const url = `/api/recommend?seedId=${encodeURIComponent(String(id))}` +
      `&k=${encodeURIComponent(String(HOME_K))}&mode=${encodeURIComponent(String(m))}&debug=${debug}`;

    const resp = await callApi(url);

    window.__recoCtx = { seedId: id, model: m };

    await loadLikedSet();
    await loadPurchasedSet();

    const items = (resp.data && Array.isArray(resp.data.items)) ? resp.data.items : [];
    markFlagsOnItems(items);

    renderItems(items);
    renderHeader(resp.data, resp.warning);

  } catch (err) {
    setStatus('加载失败：' + (err && err.message ? err.message : err), 'error');
  }
}

function initPerfumeDetailPage() {
  // 1️⃣ 读取 URL 参数 ?id=xx
  const params = new URLSearchParams(window.location.search);
  const idStr = params.get('id');
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    console.error('无效的香水 id:', idStr);
    return;
  }

  // 2️⃣ 拉取香水详情数据
  // ⚠️ 这里用的是“最保守写法”，你项目里如果已有 fetchPerfume / getPerfumeById
  //    直接把下面 fetch 换成你已有的方法即可
  fetch(`/api/perfume?id=${encodeURIComponent(String(id))}`)
    .then(res => {
      if (!res.ok) throw new Error('接口请求失败');
      return res.json();
    })
    .then(resp => {
      // 兼容常见返回结构
      const perfume =
        resp && resp.data ? resp.data :
        resp && resp.perfume ? resp.perfume :
        resp;

      if (!perfume) {
        throw new Error('未获取到香水详情数据');
      }

      // 3️⃣ 渲染详情页（Grid + 右侧海报 + 延申白卡）
      renderPerfumeDetailPage(perfume);
    })
    .catch(err => {
      console.error(err);
      const root = document.getElementById('result') || document.body;
      root.innerHTML = `<div style="padding:24px;color:#c00;">加载香水详情失败</div>`;
    });
}

/* ===================== 顶部导航 ===================== */
function setNavActive(which) {
  const map = { home: 'navHome', bal: 'navBal', office: 'navOffice', popular: 'navPopular', model: 'navModel' };
  Object.keys(map).forEach(k => {
    const el = document.getElementById(map[k]);
    if (el) el.classList.toggle('active', k === which);
  });
}

async function enterByMode(modeKey) {
  // ✅ 首页：全量热门推荐（展示全部香水）
  if (modeKey === 'home') {
    setNavActive('home');
    await recommendPopular(HOME_ALL_K);
    return;
  }

  // ✅ 热门推荐入口：仍然只展示 15 条
  if (modeKey === 'popular') {
    setNavActive('popular');
    await recommendPopular(HOME_K);
    return;
  }

  // 其余：需要 seed
  const seedId = getLastSeedId();
  if (!Number.isFinite(seedId) || seedId <= 0) {
    setNavActive(modeKey);
    clearResult();
    setStatus('提示：请先点击任意香水进入详情页，再返回首页即可生成相似推荐。', 'info');
    return;
  }

  let mode = 'BALANCED';
  if (modeKey === 'bal') mode = 'BALANCED';
  if (modeKey === 'office') mode = 'OFFICE';
  if (modeKey === 'model') mode = 'MODEL_LR';

  setNavActive(modeKey);
  await recommendSeedById(seedId, mode);
}

function bindTopNav() {
  const map = { navHome: 'home', navBal: 'bal', navOffice: 'office', navPopular: 'popular', navModel: 'model' };
  Object.keys(map).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onclick = () => enterByMode(map[id]);
  });
}

/* ===================== 启动 ===================== */
(async function boot() {
  try {
    bindTopNav();
    setStatus('已进入首页，正在加载热门推荐...', 'info');

    // ✅ 默认进入首页：展示全部香水
    setNavActive('home');
    await recommendPopular(HOME_ALL_K);

  } catch (e) {
    setStatus('启动失败：' + (e && e.message ? e.message : e), 'error');
  }
})();
