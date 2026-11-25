// Client-side behaviour for NPPR · Ro. Runs on every page load, including
// Astro view-transition navigations (astro:page-load).
import Fuse from 'fuse.js';

const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll(s)) as T[];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let globalsBound = false;

export function boot() {
  bindGlobalsOnce();
  initTheme();
  initRegion();
  initNav();
  initReveal();
  initProgress();
  initToc();
  initPageFilter();
  initHistory();
  initDashboard();
  initResearch();
}

// ---------------- global listeners (bound once) ----------------
function bindGlobalsOnce() {
  if (globalsBound) return;
  globalsBound = true;
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); }
    else if (e.key === 'Escape') { closePalette(); closeDrawers(); }
  });
  document.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('#search-btn, [data-open-palette]')) openPalette();
    else if (t.id === 'palette') closePalette();
    else if (t.id === 'scrim') closeDrawers();
  });
}

// ---------------- theme ----------------
function initTheme() {
  const btn = $('#theme-btn');
  if (!btn) return;
  btn.onclick = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('nppr-theme', root.dataset.theme); } catch {}
  };
}

// ---------------- region ----------------
function currentRegion(): string {
  const q = new URLSearchParams(location.search).get('region');
  if (q) { store.set('nppr-region', q.toUpperCase()); return q.toUpperCase(); }
  return store.get('nppr-region', 'BC');
}
function applyRegion(code: string) {
  for (const el of $$('[data-only]')) {
    const only = el.dataset.only, rg = el.dataset.region;
    const hide = (only === 'yes' && rg !== code) || (only === 'other' && rg === code);
    if (hide) el.dataset.hidden = 'region'; else if (el.dataset.hidden === 'region') delete el.dataset.hidden;
  }
}
function initRegion() {
  const sel = $<HTMLSelectElement>('#region');
  const code = currentRegion();
  if (sel) {
    sel.value = [...sel.options].some(o => o.value === code) ? code : 'BC';
    sel.onchange = () => { store.set('nppr-region', sel.value); applyRegion(sel.value); };
  }
  applyRegion(code);
}

// ---------------- side nav & drawers ----------------
function closeDrawers() {
  $('#side-nav')?.classList.remove('open');
  $('#research')?.classList.remove('open');
  $('#scrim')?.classList.remove('show');
  $('#menu-btn')?.setAttribute('aria-expanded', 'false');
  $('#panel-toggle')?.setAttribute('aria-expanded', 'false');
}
function openDrawer(el: HTMLElement | null, btn: HTMLElement | null) {
  if (!el) return;
  const willOpen = !el.classList.contains('open');
  closeDrawers();
  if (willOpen) { el.classList.add('open'); $('#scrim')?.classList.add('show'); btn?.setAttribute('aria-expanded', 'true'); }
}
function initNav() {
  const nav = $('#side-nav');
  const menuBtn = $('#menu-btn');
  if (menuBtn) menuBtn.onclick = () => openDrawer(nav, menuBtn);
  if (!nav) return;
  const cur = $('a[aria-current="page"]', nav);
  if (cur) {
    // Open every group containing the current page, then bring it into view.
    let d = cur.closest('details'); while (d) { d.open = true; d = d.parentElement?.closest('details') ?? null; }
    const navRect = nav.getBoundingClientRect(), r = cur.getBoundingClientRect();
    if (r.top < navRect.top || r.bottom > navRect.bottom) nav.scrollTop += r.top - navRect.top - navRect.height / 3;
  }
  const filter = $<HTMLInputElement>('.nav-filter', nav);
  if (filter) filter.oninput = () => {
    const q = filter.value.trim().toLowerCase();
    for (const g of $$<HTMLDetailsElement>('.nav-group', nav)) {
      let any = false;
      for (const li of $$('li[data-nav-text]', g)) {
        const hit = !q || li.dataset.navText!.includes(q) || $$('li[data-nav-text]', li).some(x => x.dataset.navText!.includes(q));
        li.style.display = hit ? '' : 'none'; any ||= hit;
      }
      g.style.display = any || !q ? '' : 'none';
      if (q && any) g.open = true;
    }
  };
}

// ---------------- reveal on scroll ----------------
function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion()) { els.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
}

// ---------------- reading progress ----------------
let progressHandler: (() => void) | null = null;
function initProgress() {
  const bar = $('#progress');
  if (progressHandler) removeEventListener('scroll', progressHandler);
  if (!bar) return;
  progressHandler = () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener('scroll', progressHandler, { passive: true });
  progressHandler();
}

// ---------------- on-page contents ----------------
function initToc() {
  const links = $$<HTMLAnchorElement>('.toc a');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const map = new Map(links.map(a => [decodeURIComponent(a.hash.slice(1)), a]));
  const io = new IntersectionObserver(entries => {
    for (const en of entries) if (en.isIntersecting) {
      links.forEach(l => l.classList.remove('active'));
      const a = map.get(en.target.id); a?.classList.add('active');
      a?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  map.forEach((_a, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
}

// ---------------- page filter ----------------
function initPageFilter() {
  const input = $<HTMLInputElement>('#page-filter');
  const hits = $('#page-filter-hits');
  if (!input) return;
  const rows = $$('.prose .item, .prose .sub, .prose .md-li');
  const run = () => {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const r of rows) {
      const text = (r.dataset.text || '') + ' ' + r.textContent!.toLowerCase();
      const hit = terms.every(t => text.includes(t));
      if (hit || !terms.length) { if (r.dataset.hidden === 'filter') delete r.dataset.hidden; } else if (!r.classList.contains('sub') || !r.closest('.item')) r.dataset.hidden = 'filter';
      if (hit && terms.length && r.dataset.hidden !== 'region') n++;
    }
    // A box stays visible when one of its sub-rows matches.
    for (const box of $$('.prose .box-item')) {
      const subHit = terms.length && $$('.sub', box).some(s => { const t = (s.dataset.text || '') + ' ' + s.textContent!.toLowerCase(); return terms.every(x => t.includes(x)); });
      if (subHit) { delete box.dataset.hidden; ($('details', box) as HTMLDetailsElement).open = true; }
    }
    for (const sec of $$('.prose .sheet-sec')) {
      const visible = $$('.item, .md-row, .sheet-note', sec).some(x => !x.dataset.hidden);
      sec.style.display = !terms.length || visible ? '' : 'none';
    }
    if (hits) hits.textContent = terms.length ? `${n} match${n === 1 ? '' : 'es'}` : '';
  };
  input.oninput = run;
}

// ---------------- history & bookmarks ----------------
type Item = { id: string; t: string; u: string; i: string; s?: string; at: number };
function initHistory() {
  const host = $('[data-page-id]');
  if (host) {
    const item: Item = { id: host.dataset.pageId!, t: host.dataset.pageTitle!, u: host.dataset.pageHref!, i: host.dataset.pageIcon || '📄', s: host.dataset.pageSection, at: Date.now() };
    const recent = store.get<Item[]>('nppr-recent', []).filter(r => r.id !== item.id);
    recent.unshift(item);
    store.set('nppr-recent', recent.slice(0, 8));
    const btn = $('#bookmark-btn');
    if (btn) {
      const saved = () => store.get<Item[]>('nppr-saved', []);
      const paint = () => { const on = saved().some(s => s.id === item.id); btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '★ Saved' : '☆ Save'; };
      paint();
      btn.onclick = () => {
        const list = saved();
        const on = list.some(s => s.id === item.id);
        store.set('nppr-saved', on ? list.filter(s => s.id !== item.id) : [item, ...list]);
        paint();
        if (!on && !reduceMotion()) btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 300 });
      };
    }
  }
  const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  const fill = (sel: string, list: Item[]) => {
    const ul = $(sel);
    if (!ul || !list.length) return;
    ul.innerHTML = list.slice(0, 6).map(r => `<li><span>${esc(r.i)}</span><a href="${esc(r.u)}">${esc(r.t)}</a><span class="when">${ago(r.at)}</span></li>`).join('');
  };
  fill('#recent-list', store.get<Item[]>('nppr-recent', []));
  fill('#saved-list', store.get<Item[]>('nppr-saved', []));
}

// ---------------- dashboard animations ----------------
function initDashboard() {
  const animate = !reduceMotion();
  requestAnimationFrame(() => {
    $$('.bar-fill[data-w]').forEach((b, i) => setTimeout(() => (b.style.width = b.dataset.w + '%'), animate ? 80 + i * 40 : 0));
    $$('.year-chart .col[data-h]').forEach((c, i) => setTimeout(() => (c.style.height = c.dataset.h + '%'), animate ? 120 + i * 35 : 0));
  });
  if (!animate) return;
  for (const el of $$('[data-count]')) {
    const target = Number(el.dataset.count); const start = performance.now(); const dur = 900;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur); const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

// ---------------- command palette ----------------
type SearchData = { pages: any[]; entries: any[] };
let searchData: Promise<SearchData> | null = null;
let fusePages: Fuse<any> | null = null, fuseEntries: Fuse<any> | null = null;
let docPages: any[] = [], docEntries: any[] = [];
let sel = 0;

function loadSearch() {
  if (!searchData) {
    const url = $('#palette')?.dataset.index || '/search.json';
    searchData = fetch(url).then(r => r.json()).then((d: SearchData) => {
      docPages = d.pages; docEntries = d.entries;
      fusePages = new Fuse(d.pages, { keys: [{ name: 't', weight: 3 }, { name: 'a', weight: 2 }, { name: 'd', weight: 0.5 }, { name: 's', weight: 0.3 }], threshold: 0.3, ignoreLocation: true });
      fuseEntries = new Fuse(d.entries, { keys: [{ name: 't', weight: 3 }, { name: 'k', weight: 1 }, { name: 'pg', weight: 0.6 }], threshold: 0.3, ignoreLocation: true });
      return d;
    });
  }
  return searchData;
}

function openPalette() {
  const p = $('#palette');
  if (!p || p.classList.contains('open')) return;
  p.classList.add('open');
  const input = $<HTMLInputElement>('#palette-q')!;
  input.value = ''; input.focus();
  loadSearch().then(() => render(''));
  input.oninput = () => render(input.value);
  input.onkeydown = e => {
    const items = $$('#palette-results li[data-href]');
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter') { const li = items[sel]; if (li) { e.preventDefault(); go(li.dataset.href!, li.dataset.ext === '1'); } }
  };
}
function closePalette() { $('#palette')?.classList.remove('open'); }
function go(href: string, ext: boolean) {
  closePalette();
  if (ext) window.open(href, '_blank', 'noopener'); else location.assign(href);
}
function mark() {
  const items = $$('#palette-results li[data-href]');
  items.forEach((li, i) => li.classList.toggle('sel', i === sel));
  items[sel]?.scrollIntoView({ block: 'nearest' });
}
function render(q: string) {
  const ul = $('#palette-results'); if (!ul) return;
  sel = 0;
  const recent = store.get<Item[]>('nppr-recent', []);
  let html = '';
  if (!q.trim()) {
    if (recent.length) html += `<li class="grp">Recently read</li>` + recent.slice(0, 6).map(r => row(r.u, r.i, r.t, r.s || '')).join('');
    else html += `<li class="grp">Try</li>` + ['asthma', 'metformin', 'chest pain', 'pediatric fever'].map(t => `<li><a href="#" data-try="${t}"><span class="pi">🔎</span><span><span class="pt">${t}</span></span></a></li>`).join('');
  } else if (fusePages && fuseEntries) {
    const pages = rank(fusePages, docPages, q, p => `${p.t} ${p.a} ${p.e}`, 7);
    const ents = rank(fuseEntries, docEntries, q, e => `${e.t} ${e.k || ''}`, 10);
    if (pages.length) html += `<li class="grp">Topics</li>` + pages.map(({ item: p }) => row(p.u, p.i, p.t, p.x ? `${p.s} · section` : p.s)).join('');
    if (ents.length) html += `<li class="grp">Guidelines and sources</li>` + ents.map(({ item: e }) => row(e.u, e.f ? '📄' : '🔗', e.t + (e.y ? ` (${e.y})` : ''), `on ${e.pg}${e.r ? ' · ' + e.r : ''}`, true)).join('');
    if (!html) html = `<li class="grp">No matches. Try another word or abbreviation.</li>`;
  } else html = `<li class="grp">Loading…</li>`;
  ul.innerHTML = html;
  mark();
  for (const a of $$<HTMLAnchorElement>('a[data-try]', ul)) a.onclick = e => { e.preventDefault(); const i = $<HTMLInputElement>('#palette-q')!; i.value = a.dataset.try!; render(i.value); };
  for (const li of $$('li[data-href]', ul)) li.onclick = e => { e.preventDefault(); go(li.dataset.href!, li.dataset.ext === '1'); };
}
// Exact word matches in titles and aliases first, then fuzzy matches.
function rank(fuse: Fuse<any>, all: any[], q: string, text: (x: any) => string, limit: number): { item: any }[] {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const exact = all.filter(x => { const t = text(x).toLowerCase(); return terms.every(w => t.includes(w)); })
    .sort((a, b) => Number(!a.t.toLowerCase().includes(terms[0])) - Number(!b.t.toLowerCase().includes(terms[0])) || (b.y || 0) - (a.y || 0));
  const seen = new Set(exact);
  const fuzzy = fuse.search(q, { limit: limit * 2 }).map(r => r.item).filter(x => !seen.has(x));
  return [...exact, ...fuzzy].slice(0, limit).map(item => ({ item }));
}

const row = (href: string, icon: string, title: string, sub: string, ext = false) =>
  `<li data-href="${esc(href)}" data-ext="${ext ? 1 : 0}"><a href="${esc(href)}"><span class="pi">${esc(icon)}</span><span><span class="pt">${esc(title)}</span><span class="ps">${esc(sub)}</span></span></a></li>`;

// ---------------- research sidebar ----------------
const NOW_YEAR = new Date().getFullYear();
const cacheGet = (k: string) => { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const cacheSet = (k: string, v: unknown) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
async function getJson(url: string) {
  const hit = cacheGet(url); if (hit) return hit;
  const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json(); cacheSet(url, j); return j;
}

type RItem = { title: string; url: string; meta: string[]; tags: { t: string; c?: string }[]; snippet?: string };

const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
async function searchPubMed(q: string, ptype: string, years: number, start: number): Promise<{ items: RItem[]; total: number }> {
  const pt: Record<string, string> = {
    review: ' AND (review[pt] OR systematic review[pt] OR meta-analysis[pt])',
    guideline: ' AND (guideline[pt] OR practice guideline[pt] OR consensus development conference[pt])',
    trial: ' AND (randomized controlled trial[pt])',
  };
  const term = `(${q})${pt[ptype] || ''} AND english[la] AND hasabstract`;
  const s = await getJson(`${EUTILS}esearch.fcgi?db=pubmed&retmode=json&retmax=10&retstart=${start}&sort=relevance&datetype=pdat&reldate=${years * 365}&tool=nppr-ro&term=${encodeURIComponent(term)}`);
  const ids: string[] = s.esearchresult?.idlist ?? [];
  const total = Number(s.esearchresult?.count ?? 0);
  if (!ids.length) return { items: [], total };
  const sum = await getJson(`${EUTILS}esummary.fcgi?db=pubmed&retmode=json&tool=nppr-ro&id=${ids.join(',')}`);
  const items = ids.map(id => sum.result?.[id]).filter(Boolean).map((r: any): RItem => {
    const types: string[] = r.pubtype || [];
    const tags: RItem['tags'] = [];
    if (types.some(t => /guideline/i.test(t))) tags.push({ t: 'Guideline' });
    else if (types.some(t => /systematic|meta-analysis/i.test(t))) tags.push({ t: 'Systematic review' });
    else if (types.some(t => /review/i.test(t))) tags.push({ t: 'Review' });
    else if (types.some(t => /randomized/i.test(t))) tags.push({ t: 'RCT' });
    if ((r.articleids || []).some((a: any) => a.idtype === 'pmc')) tags.push({ t: 'Free', c: 'oa' });
    const d = Date.parse(r.sortpubdate || r.pubdate);
    if (!isNaN(d) && Date.now() - d < 1000 * 60 * 60 * 24 * 120) tags.push({ t: 'New', c: 'new' });
    const first = r.authors?.[0]?.name;
    return { title: r.title, url: `https://pubmed.ncbi.nlm.nih.gov/${r.uid}/`, meta: [r.source, (r.pubdate || '').slice(0, 8).trim(), first ? first + (r.authors.length > 1 ? ' et al.' : '') : ''].filter(Boolean), tags };
  });
  return { items, total };
}

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
async function searchEPMC(query: string, page: string, kind: 'free' | 'books'): Promise<{ items: RItem[]; total: number; next: string }> {
  const j = await getJson(`${EPMC}?format=json&pageSize=10&resultType=core&cursorMark=${encodeURIComponent(page)}&query=${encodeURIComponent(query)}`);
  const items = (j.resultList?.result ?? []).map((r: any): RItem => {
    const isBook = r.source === 'NBK';
    const url = isBook ? `https://www.ncbi.nlm.nih.gov/books/${r.id}/` : r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : `https://europepmc.org/article/${r.source}/${r.id}`;
    const tags: RItem['tags'] = [];
    if (isBook) tags.push({ t: (r.bookOrReportDetails?.publisher || '').includes('StatPearls') ? 'StatPearls' : 'Book chapter' });
    if (r.isOpenAccess === 'Y' || isBook) tags.push({ t: 'Free', c: 'oa' });
    const types: string[] = r.pubTypeList?.pubType ?? [];
    if (types.some(t => /review/i.test(t))) tags.push({ t: 'Review' });
    const abs = String(r.abstractText || '').replace(/<[^>]+>/g, '');
    return {
      title: String(r.title || '').replace(/<[^>]+>/g, ''), url, tags,
      meta: [isBook ? r.bookOrReportDetails?.publisher : r.journalInfo?.journal?.isoabbreviation || r.journalTitle, r.firstPublicationDate || r.pubYear, r.authorString ? r.authorString.split(',')[0] + (r.authorString.includes(',') ? ' et al.' : '') : ''].filter(Boolean),
      snippet: abs ? abs.slice(0, 180) + (abs.length > 180 ? '…' : '') : undefined,
    };
  });
  return { items, total: Number(j.hitCount ?? 0), next: j.nextCursorMark || '' };
}

async function wikiSummary(terms: string[]) {
  for (const t of terms) {
    try {
      const s = await getJson(`https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(t)}`);
      const title = s?.[1]?.[0]; if (!title) continue;
      const j = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`);
      if (j?.extract && j.type !== 'disambiguation') return j;
    } catch {}
  }
  return null;
}

function funLinks(q: string): { icon: string; title: string; sub: string; url: string }[] {
  const e = encodeURIComponent(q);
  return [
    { icon: '🎥', title: 'Video explainers', sub: 'YouTube', url: `https://www.youtube.com/results?search_query=${e}+explained+nurse+practitioner` },
    { icon: '🎧', title: 'Podcast episodes', sub: 'Apple Podcasts', url: `https://podcasts.apple.com/search?term=${e}` },
    { icon: '🃏', title: 'Flashcards and quizzes', sub: 'Quizlet', url: `https://quizlet.com/search?query=${e}&type=sets` },
    { icon: '🩺', title: 'Clinical skills guides', sub: 'Geeky Medics', url: `https://geekymedics.com/?s=${e}` },
    { icon: '⚡', title: 'Quick-reference notes', sub: 'Life in the Fast Lane', url: `https://litfl.com/?s=${e}` },
    { icon: '🩻', title: 'Imaging cases', sub: 'Radiopaedia', url: `https://radiopaedia.org/search?q=${e}` },
    { icon: '🧪', title: 'Trials recruiting now', sub: 'ClinicalTrials.gov', url: `https://clinicaltrials.gov/search?cond=${e}&aggFilters=status:rec` },
    { icon: '🎓', title: `Scholarly papers since ${NOW_YEAR - 2}`, sub: 'Google Scholar', url: `https://scholar.google.com/scholar?q=${e}&as_ylo=${NOW_YEAR - 2}` },
  ];
}

function initResearch() {
  const panel = $('#research');
  const toggle = $('#panel-toggle');
  if (toggle) toggle.onclick = () => openDrawer(panel, toggle);
  if (!panel) return;
  const list = $('#r-list', panel)!;
  const filters = $('#r-filters', panel)!;
  const input = $<HTMLInputElement>('#r-q', panel)!;
  const extra: string[] = JSON.parse(panel.dataset.extra || '[]');
  const state = { tab: 'articles', ptype: '', years: 3, q: input.value, start: 0, cursor: '*', token: 0 };

  const skeleton = () => { list.innerHTML = '<li class="skeleton"></li>'.repeat(4); };
  const itemHtml = (r: RItem) => `<li class="r-item"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="r-meta">${r.tags.map(t => `<span class="tag ${t.c || ''}">${esc(t.t)}</span>`).join('')}<span>${r.meta.map(esc).join(' · ')}</span></div>${r.snippet ? `<p>${esc(r.snippet)}</p>` : ''}</li>`;
  const moreBtn = (label: string) => `<li><button class="r-more" id="r-more">${label}</button></li>`;
  const fail = (src: string) => { list.innerHTML = `<li class="r-error">Couldn't reach ${src} just now. Check your connection, then press Go to try again.</li>`; };

  async function load(append = false) {
    const token = ++state.token;
    const q = state.q.trim();
    if (!q) { list.innerHTML = '<li class="r-empty">Type a topic to search.</li>'; return; }
    if (!append) skeleton(); else $('#r-more')?.closest('li')?.remove();
    filters.style.display = state.tab === 'articles' ? '' : 'none';
    try {
      if (state.tab === 'articles') {
        const { items, total } = await searchPubMed(q, state.ptype, state.years, state.start);
        if (token !== state.token) return;
        const head = append ? '' : `<li class="r-empty">${total.toLocaleString()} PubMed articles from the last ${state.years === 1 ? 'year' : state.years + ' years'}, most relevant first.</li>`;
        const body = items.map(itemHtml).join('') || (append ? '' : '<li class="r-empty">No recent articles. Try a broader term.</li>');
        list.insertAdjacentHTML('beforeend', '');
        list.innerHTML = (append ? list.innerHTML : head) + body + (state.start + 10 < total ? moreBtn('Load more articles') : '');
      } else if (state.tab === 'free' || state.tab === 'books') {
        const query = state.tab === 'free'
          ? `(${q}) AND OPEN_ACCESS:y AND (PUB_TYPE:"review" OR PUB_TYPE:"guideline" OR PUB_TYPE:"practice guideline") AND FIRST_PDATE:[${NOW_YEAR - 3}-01-01 TO ${NOW_YEAR}-12-31]`
          : `(${q}) AND SRC:NBK`;
        const { items, total, next } = await searchEPMC(query, state.cursor, state.tab);
        if (token !== state.token) return;
        const label = state.tab === 'free' ? `free full-text reviews and guidelines since ${NOW_YEAR - 3}` : 'book chapters from NCBI Bookshelf';
        const head = append ? '' : `<li class="r-empty">${total.toLocaleString()} ${label}.</li>`;
        const body = items.map(itemHtml).join('') || (append ? '' : '<li class="r-empty">Nothing found. Try a broader term.</li>');
        state.cursor = next;
        list.innerHTML = (append ? list.innerHTML : head) + body + (next && items.length === 10 ? moreBtn('Load more') : '');
      } else {
        const links = funLinks(q).map(f => `<li class="r-item"><a href="${esc(f.url)}" target="_blank" rel="noopener">${f.icon} ${esc(f.title)}</a><div class="r-meta"><span>${esc(f.sub)}</span></div></li>`).join('');
        list.innerHTML = '<li class="skeleton"></li>' + links;
        const w = await wikiSummary([q, ...extra]);
        if (token !== state.token) return;
        const wiki = w ? `<li class="r-item r-wiki">${w.thumbnail?.source ? `<img src="${esc(w.thumbnail.source)}" alt="" loading="lazy">` : ''}<a href="${esc(w.content_urls?.desktop?.page)}" target="_blank" rel="noopener">📘 ${esc(w.title)}</a><p>${esc(w.extract)}</p><div class="r-meta"><span>Wikipedia, for background only</span></div></li>` : '';
        list.innerHTML = wiki + links;
      }
      const more = $('#r-more');
      if (more) more.onclick = () => { if (state.tab === 'articles') state.start += 10; load(true); };
    } catch {
      if (token === state.token) fail(state.tab === 'articles' ? 'PubMed' : state.tab === 'fun' ? 'Wikipedia' : 'Europe PMC');
    }
  }

  for (const b of $$('.r-tabs button', panel)) b.onclick = () => {
    $$('.r-tabs button', panel).forEach(x => x.setAttribute('aria-selected', String(x === b)));
    state.tab = b.dataset.tab!; state.start = 0; state.cursor = '*'; load();
  };
  for (const b of $$('button', filters)) b.onclick = () => {
    if ('years' in b.dataset) {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on)); state.years = on ? 1 : 3;
    } else {
      $$('button[data-ptype]', filters).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      state.ptype = b.dataset.ptype!;
    }
    state.start = 0; load();
  };
  $<HTMLFormElement>('#r-form', panel)!.onsubmit = e => { e.preventDefault(); state.q = input.value; state.start = 0; state.cursor = '*'; load(); };

  // Load lazily: right away on wide screens, on first open on small ones.
  if (getComputedStyle(panel).position === 'sticky') load();
  else if (toggle) toggle.addEventListener('click', () => { if (!list.children.length) load(); }, { once: true });
}
