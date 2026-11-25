// Build-time content loader. Reads the CC BY 4.0 docs/ folder synced from
// joegrafe/np-practice-resource (see scripts/sync-content.mjs) and turns each
// Markdown page plus its CSV list sheet into structured data for this site.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve, posix } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import { parse as parseYaml } from 'yaml';
import { Marked } from 'marked';

export const CONTENT_ROOT = resolve(process.env.NPPR_CONTENT || 'content');
export const DOCS = join(CONTENT_ROOT, 'docs');
const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/');

export interface SourceRow {
  id: string; title: string; publisher: string; url: string; pdf: string; year: string;
  version: string; region: string; kind: string; checked: string; supersedes: string; keywords: string;
}

export interface Entry {
  title: string; url: string; pdf: string; year: number | null; region: string; only: string;
  note: string; kind: string; heading: string; publisher: string; keywords: string;
}

export interface Heading { id: string; text: string; level: number; count: number; region?: string }

export interface Page {
  id: string;            // url path without base, e.g. conditions/cardiovascular/chest-pain
  href: string;          // full href including base
  file: string;          // path relative to docs/
  section: string;       // top-level section slug
  crumbs: { title: string; href: string }[];
  isIndex: boolean;
  order: number;
  title: string;
  description: string;
  type: string;
  system: string;
  tags: string[];
  aliases: string[];
  jurisdiction: string[];
  region: string;
  lastReviewed: string;
  reviewDue: string;
  status: string;
  icon: string;
  logo: string;
  intro: string;
  html: string;
  headings: Heading[];
  entries: Entry[];
  children: Page[];      // for index pages: direct child pages and sub-sections
  parent?: Page;
}

export interface Section {
  slug: string; title: string; order: number; index?: Page; pages: Page[]; icon: string; blurb: string; color: string;
}

// ---------- helpers ----------
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const stripNum = (seg: string) => seg.replace(/^\d+\s+/, '');
const segOrder = (seg: string) => { const m = seg.match(/^(\d+)\s/); return m ? Number(m[1]) : 999; };

const decodeEntities = (s: string) => s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

function readCsv(file: string): Record<string, string>[] {
  if (!existsSync(file)) return [];
  // Upstream sheets mix CRLF and LF line endings; normalise so rows don't merge.
  return parseCsv(readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), { columns: true, skip_empty_lines: true, relax_column_count: true, bom: true });
}

function splitFrontmatter(src: string): { data: any; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  let data: any = {};
  try { data = parseYaml(m[1]) || {}; } catch { data = {}; }
  return { data, body: src.slice(m[0].length) };
}

const arr = (v: any): string[] => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(x => String(x === true ? 'ON' : x));

// Material icon names used upstream -> a small emoji for this design.
const ICONS: Record<string, string> = {
  heart: '❤️', 'heart-pulse': '💓', lungs: '🫁', brain: '🧠', stethoscope: '🩺', pill: '💊', needle: '💉', baby: '👶',
  'baby-face-outline': '👶', 'human-pregnant': '🤰', 'human-female': '👩', 'human-cane': '🧓', 'account-group-outline': '👥',
  bookshelf: '📚', 'school-outline': '🎓', 'toolbox-outline': '🧰', 'briefcase-outline': '💼', 'clipboard-pulse-outline': '📋',
  'head-lightbulb-outline': '💡', 'eye-outline': '👁️', bone: '🦴', 'water-outline': '💧', virus: '🦠', 'bacteria-outline': '🦠',
  'stomach': '🫃', 'kidney': '🫘', 'flask-outline': '🧪', 'test-tube': '🧪', 'microscope': '🔬', 'robot-outline': '🤖',
  'file-document-outline': '📄', 'map-marker-outline': '📍', 'earth': '🌎', 'leaf': '🌿', 'shield-check-outline': '🛡️',
  'virus-outline': '🦠', 'source-branch': '🔀', 'shield-alert-outline': '⚠️', 'shield-account-outline': '🛡️', 'scale-balance': '⚖️',
  'radiology-box-outline': '🩻', presentation: '🗣️', prescription: '℞', 'pine-tree': '🌲', 'pill-off': '🚫', 'phone-in-talk-outline': '📞',
  'package-variant-closed': '📦', 'newspaper-variant-outline': '📰', 'link-variant-plus': '🔗', library: '🏛️', 'head-heart-outline': '💗',
  'head-cog-outline': '🧩', 'hand-heart-outline': '🤲', 'hand-back-left-outline': '✋', 'gender-transgender': '⚧️', 'gender-male-female': '🚻',
  'gender-female': '♀️', 'flag-checkered': '🏁', 'file-lock-outline': '🔒', 'file-document-multiple-outline': '🗂️', 'file-document-edit-outline': '📝',
  feather: '🪶', 'email-outline': '✉️', 'ear-hearing': '👂', diabetes: '🩸', 'content-cut': '✂️', 'clipboard-list-outline': '📋',
  'clipboard-check-outline': '✅', 'certificate-outline': '📜', 'cellphone-arrow-down': '📲', 'cash-check': '💵', 'card-account-details-outline': '🪪',
  'calendar-check-outline': '📅', 'book-open-variant': '📖', 'blood-bag': '🩸', bandage: '🩹', 'arm-flex-outline': '💪',
  'account-multiple-outline': '👥', 'account-heart-outline': '💞',
};
// Fallback icons for pages by their body-system folder.
const FOLDER_ICONS: Record<string, string> = {
  cardiovascular: '❤️', respiratory: '🫁', 'endocrine-and-metabolic': '🩸', 'renal-and-genitourinary': '🫘', 'gastrointestinal-and-liver': '🫃',
  musculoskeletal: '🦴', neurology: '🧠', 'mental-health-and-substance-use': '💗', dermatology: '🧴', 'infectious-disease': '🦠',
  'hematology-and-oncology': '🩸', 'eyes-ears-nose-and-throat': '👁️', 'sexual-and-reproductive-health': '🌸', pediatrics: '👶',
  'physical-exam-by-system': '🩺', pocus: '🔊', 'evidence-packs': '📦', 'ai-tools': '🤖', templates: '📝', 'electrolyte-imbalances': '🧂',
};
const iconFor = (name: string, fallback: string) => {
  if (!name) return fallback;
  const key = String(name).replace(/^:?material-/, '').replace(/:$/, '');
  return ICONS[key] || fallback;
};

const SECTION_META: Record<string, { icon: string; blurb: string; color: string }> = {
  approaches: { icon: '💡', blurb: 'Hear the complaint: "approach to" articles and pathways.', color: '#f59e0b' },
  assessments: { icon: '🩺', blurb: 'Examine and test: exam by system, decision rules, labs.', color: '#06b6d4' },
  conditions: { icon: '📋', blurb: 'Name the diagnosis: guidelines by body system.', color: '#6366f1' },
  populations: { icon: '👥', blurb: 'Who the patient is changes every step.', color: '#ec4899' },
  procedures: { icon: '💉', blurb: 'How-to guides, videos and aftercare.', color: '#14b8a6' },
  prescribing: { icon: '💊', blurb: 'Drug references, coverage, immunization.', color: '#22c55e' },
  practice: { icon: '💼', blurb: 'Referral, forms, scope and duty to report.', color: '#8b5cf6' },
  tools: { icon: '🧰', blurb: 'AI tools, evidence packs and templates.', color: '#f97316' },
  resources: { icon: '📚', blurb: 'Libraries and directories to check next.', color: '#0ea5e9' },
  about: { icon: 'ℹ️', blurb: 'About the original NPPR project.', color: '#64748b' },
};

// ---------- registry ----------
let registry: Map<string, SourceRow> | null = null;
export function getRegistry() {
  if (!registry) {
    registry = new Map();
    for (const r of readCsv(join(DOCS, 'sources.csv')) as any[]) registry.set(r.id, r);
  }
  return registry;
}

export function getRegions(): { code: string; name: string; live: boolean }[] {
  return readCsv(join(DOCS, 'regions.csv')).map(r => ({ code: r.code, name: r.name, live: r.live === 'yes' }));
}

// ---------- markdown ----------
function preprocessMarkdown(md: string): string {
  return md
    .replace(/<!--(?![\s\S]*?nppr-list)[\s\S]*?-->/g, '')                 // drop editor comments
    .replace(/:material-[a-z0-9-]+:(\{[^}]*\})?/g, '')                     // icon shortcodes
    .replace(/\{\s*[.:#][^}\n]*\}/g, '')                                    // attr lists
    .replace(/<div class="nppr-filter[^>]*><\/div>/g, '')                  // upstream filter boxes (we have our own)
    .replace(/ markdown(=["']?1["']?)?>/g, '>')
    // admonitions: !!! type "Title"\n    body
    .replace(/^(!!!|\?\?\?\+?) *([a-z]+)(?: +"([^"]*)")?\n((?:(?: {4}|\t).*\n?|\s*\n)*)/gm, (_m, mark, type, title, body) => {
      const inner = body.replace(/^( {4}|\t)/gm, '');
      const t = title ?? type.charAt(0).toUpperCase() + type.slice(1);
      return `\n<div class="callout callout-${type}"><div class="callout-title">${esc(t)}</div>\n\n${inner}\n</div>\n\n`;
    });
}

function makeMarked(fileRel: string, linkMap: Map<string, string>) {
  const m = new Marked({ gfm: true });
  m.use({
    walkTokens(token: any) {
      if (token.type === 'link' && token.href) token.href = rewriteHref(token.href, fileRel, linkMap);
    },
    renderer: {
      heading(this: any, { tokens, depth }: any) {
        const text = this.parser.parseInline(tokens);
        const plain = text.replace(/<[^>]+>/g, '');
        return `<h${depth} id="${slugify(plain)}">${text}</h${depth}>\n`;
      },
      link(this: any, { href, title, tokens }: any) {
        const text = this.parser.parseInline(tokens);
        const ext = /^https?:/.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
      },
    },
  });
  return m;
}

function rewriteHref(href: string, fileRel: string, linkMap: Map<string, string>): string {
  if (/^(https?:|mailto:|tel:|#)/.test(href)) return href;
  let [path, hash] = href.split('#');
  try { path = decodeURIComponent(path); } catch {}
  if (path.startsWith('/assets/')) return BASE + 'nppr-assets/' + path.slice('/assets/'.length);
  const target = posix.normalize(posix.join(posix.dirname(fileRel), path));
  if (target.startsWith('assets/')) return BASE + 'nppr-assets/' + target.slice(7);
  const found = linkMap.get(target) || linkMap.get(target.replace(/\/$/, '') + '/index.md');
  return found ? found + (hash ? '#' + hash : '') : 'https://www.nppr.ca/';
}

// ---------- list sheets ----------
const yearOf = (y: string) => { const m = String(y || '').match(/(19|20)\d{2}/); return m ? Number(m[0]) : null; };
const blank = (v: string | undefined) => (v === '-' ? '' : v ?? '');

function freshness(y: number | null) {
  if (!y) return 'none';
  const age = 2026 - y;
  return age <= 2 ? 'fresh' : age <= 5 ? 'ok' : 'old';
}

const REGION_LABEL: Record<string, string> = { INTL: 'Intl', CA: 'Canada' };

function renderLine(r: any, md: Marked, opts: { dash?: boolean }) {
  const title = r.title || r.url || 'Untitled';
  const link = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(title)}</a>` : `<span>${esc(title)}</span>`;
  const chips: string[] = [];
  if (r.year) chips.push(`<span class="chip yr yr-${freshness(r.year)}" title="Year of current version">${r.year}</span>`);
  if (r.region) chips.push(`<span class="chip rg" data-rg="${esc(r.region)}">${esc(REGION_LABEL[r.region] || r.region)}</span>`);
  if (r.pdf) chips.push(`<a class="chip pdf" href="${esc(r.pdf)}" target="_blank" rel="noopener">PDF</a>`);
  const links = r.links ? `<span class="xlinks">${md.parseInline(r.links)}</span>` : '';
  const note = r.note ? `<span class="note">${md.parseInline(r.note)}</span>` : '';
  return `<span class="line-main">${link}${chips.join('')}</span>${links}${note}`;
}

function rowAttrs(r: any) {
  return ` data-region="${esc(r.region || '')}"${r.only ? ` data-only="${esc(r.only)}"` : ''} data-text="${esc((r.title + ' ' + r.note + ' ' + r.keywords + ' ' + r.publisher).toLowerCase())}"`;
}

interface SheetResult { html: string; headings: Heading[]; entries: Entry[] }

function renderSheet(csvFile: string, md: Marked, opts: { counts?: boolean; dash?: boolean; style?: string }): SheetResult {
  const reg = getRegistry();
  const rows = readCsv(csvFile).map((raw: any) => {
    const src = raw.source ? reg.get(raw.source) : undefined;
    const pick = (k: string) => { const own = raw[k]; if (own === '-') return ''; return own || (src as any)?.[k] || ''; };
    return {
      heading: raw.heading || '', subheading: raw.subheading || '', kind: raw.kind || '',
      level: raw.sub === 'yes' ? 1 : Number(raw.level || 0) || 0,
      title: pick('title'), url: pick('url'), pdf: pick('pdf'), year: yearOf(pick('year')),
      links: blank(raw.links), note: blank(raw.note), keywords: [raw.keywords, src?.keywords].filter(Boolean).join(' '),
      region: pick('region'), only: raw.only || '', publisher: src?.publisher || '', srcKind: src?.kind || '',
    };
  });

  // Inherit region for sub-rows from their parent.
  let lastTopRegion = '';
  for (const r of rows) { if (r.level === 0) lastTopRegion = r.region; else if (!r.region) r.region = lastTopRegion; }

  const headings: Heading[] = [];
  const entries: Entry[] = [];
  const out: string[] = [];
  let curH = '', curSub = '', listOpen = false, boxOpen = false, sectionOpen = false, subOpen = false;
  const closeBox = () => { if (boxOpen) { out.push('</ul></div></details></li>'); boxOpen = false; } };
  const closeList = () => { closeBox(); if (listOpen) { out.push('</ul>'); listOpen = false; } };
  const closeSub = () => { closeList(); if (subOpen) { out.push('</div>'); subOpen = false; } };
  const closeSection = () => { closeSub(); if (sectionOpen) { out.push('</section>'); sectionOpen = false; } };
  const openList = () => { if (!listOpen) { out.push('<ul class="items">'); listOpen = true; } };

  // Pre-count items per heading for badges.
  const counts = new Map<string, number>();
  for (const r of rows) if (r.level === 0 && r.kind !== 'md' && r.kind !== 'note' && (r.url || r.kind === 'box')) counts.set(r.heading, (counts.get(r.heading) || 0) + 1);

  for (const r of rows) {
    if (r.heading !== curH) {
      closeSection();
      curH = r.heading; curSub = '';
      if (curH) {
        const id = slugify(curH);
        const n = counts.get(curH) || 0;
        headings.push({ id, text: curH, level: 2, count: n });
        out.push(`<section class="sheet-sec reveal" id="${id}"><h2><span>${esc(curH)}</span>${n ? `<span class="count">${n}</span>` : ''}</h2>`);
        sectionOpen = true;
      }
    }
    if (r.subheading !== curSub) {
      closeSub();
      curSub = r.subheading;
      if (curSub) {
        const id = slugify((curH ? curH + '-' : '') + curSub);
        headings.push({ id, text: curSub, level: 3, count: 0 });
        out.push(`<div class="sub-sec" id="${id}"><h3>${esc(curSub)}</h3>`);
        subOpen = true;
      }
    }

    if (r.title || r.url) {
      entries.push({ title: r.title, url: r.url, pdf: r.pdf, year: r.year, region: r.region, only: r.only, note: r.note.replace(/[*_`]/g, ''),
        kind: r.srcKind || r.kind, heading: r.subheading || r.heading, publisher: r.publisher, keywords: r.keywords });
    }

    if (r.kind === 'md') {
      if (r.level === 0) { closeList(); out.push(`<div class="md-row"${rowAttrs(r)}>${md.parse(r.title)}</div>`); }
      else { if (!listOpen && !boxOpen) openList(); out.push(`<li class="md-li"${rowAttrs(r)}>${md.parseInline(r.title)}</li>`); }
      continue;
    }
    if (r.kind === 'note' && r.level === 0) {
      closeList();
      out.push(`<p class="sheet-note"${rowAttrs(r)}><em>${md.parseInline(r.title || r.note)}</em>${r.pdf ? ` · <a href="${esc(r.pdf)}" target="_blank" rel="noopener">PDF</a>` : ''}</p>`);
      continue;
    }
    if (r.level === 0) {
      closeBox(); openList();
      if (r.kind === 'box') {
        out.push(`<li class="item box-item"${rowAttrs(r)}><details class="box"><summary>${renderLine({ ...r, note: '' }, md, opts)}<span class="chev" aria-hidden="true"></span></summary><div class="box-body">${r.note ? `<p class="note">${md.parseInline(r.note)}</p>` : ''}<ul class="sub-items">`);
        boxOpen = true;
      } else {
        out.push(`<li class="item"${rowAttrs(r)}>${renderLine(r, md, opts)}</li>`);
      }
    } else {
      if (!boxOpen) openList();
      const cls = `sub lvl${r.level}`;
      if (r.kind === 'note') out.push(`<li class="${cls} note-li"${rowAttrs(r)}><em>${md.parseInline(r.title || r.note)}</em></li>`);
      else out.push(`<li class="${cls}"${rowAttrs(r)}>${renderLine(r, md, opts)}</li>`);
    }
  }
  closeSection();
  return { html: out.join('\n'), headings, entries };
}

// ---------- page loading ----------
let cache: { pages: Page[]; sections: Section[]; byId: Map<string, Page> } | null = null;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'assets' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

function idFor(rel: string): string {
  const parts = rel.split('/');
  const file = parts.pop()!;
  const segs = parts.map(s => slugify(stripNum(s)));
  if (file !== 'index.md') segs.push(slugify(file.replace(/\.md$/, '')));
  return segs.join('/');
}

export function loadSite() {
  if (cache) return cache;
  const files = walk(DOCS).map(f => relative(DOCS, f).split('\\').join('/'));
  const linkMap = new Map<string, string>();
  for (const rel of files) { const id = idFor(rel); linkMap.set(rel, BASE + (id ? id + '/' : '')); }

  const pages: Page[] = [];
  for (const rel of files) {
    if (rel === 'index.md') continue; // our own dashboard replaces the home page
    const src = readFileSync(join(DOCS, rel), 'utf8');
    const { data, body } = splitFrontmatter(src);
    if (data.status === 'draft') continue;
    const id = idFor(rel);
    const md = makeMarked(rel, linkMap);
    let headings: Heading[] = [];
    let entries: Entry[] = [];
    const isIndex = rel.endsWith('index.md');

    // Replace list-sheet markers with rendered sheets.
    let text = preprocessMarkdown(body);
    const sheets: string[] = [];
    text = text.replace(/<!--\s*nppr-list:\s*(.+?\.csv)([^>]*?)-->/g, (_m, csv, optStr) => {
      const res = renderSheet(join(DOCS, dirname(rel), csv.trim()), md, { counts: /counts/.test(optStr), dash: /notes=dash/.test(optStr), style: (optStr.match(/style=(\w+)/) || [])[1] });
      headings.push(...res.headings); entries.push(...res.entries);
      sheets.push(res.html);
      return `\n\n<!--SHEET${sheets.length - 1}-->\n\n`;
    });
    // On index pages we build our own card grid, so drop the hand-written lists.
    if (isIndex) text = text.replace(/^## In This Section[\s\S]*$/m, '');
    let html = md.parse(text) as string;
    html = html.replace(/<!--SHEET(\d+)-->/g, (_m, i) => sheets[Number(i)]);
    // Headings from plain markdown (h2) when no sheet supplied any.
    if (!headings.length) {
      for (const m of html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)) headings.push({ id: m[1], text: m[2].replace(/<[^>]+>/g, ''), level: 2, count: 0 });
    }
    // First paragraph as intro.
    const introMatch = html.match(/<p>([\s\S]*?)<\/p>/);
    let intro = String(data.description || '');
    if (!intro && introMatch) { intro = decodeEntities(introMatch[1].replace(/<[^>]+>/g, '')); html = html.replace(introMatch[0], ''); }

    const segs = rel.split('/');
    const section = slugify(stripNum(segs[0].replace(/\.md$/, '')));
    pages.push({
      id, href: BASE + id + '/', file: rel, section, crumbs: [], isIndex,
      order: segOrder(segs[segs.length - (isIndex ? 2 : 1)] || ''),
      title: String(data.title || stripNum(segs[segs.length - 1].replace(/\.md$/, ''))),
      description: String(data.description || ''),
      type: String(data.type || ''), system: String(data.system || ''),
      tags: arr(data.tags), aliases: arr(data.aliases), jurisdiction: arr(data.jurisdiction),
      region: data.region === true ? 'ON' : String(data.region || ''),
      lastReviewed: String(data['last-reviewed'] || ''), reviewDue: String(data['review-due'] || ''),
      status: String(data.status || ''), icon: iconFor(data['card-icon'], ''), logo: data.logo ? rewriteHref(String(data.logo), rel, linkMap) : '',
      intro, html, headings, entries, children: [],
    });
  }

  const byId = new Map(pages.map(p => [p.id, p]));
  // Parent / children / breadcrumbs from the folder tree.
  for (const p of pages) {
    const parts = p.id.split('/');
    let parentId = parts.slice(0, -1).join('/');
    while (parentId && !byId.has(parentId)) parentId = parentId.split('/').slice(0, -1).join('/');
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent && parent !== p) { p.parent = parent; parent.children.push(p); }
  }
  for (const p of pages) {
    const chain: Page[] = []; let c = p.parent;
    while (c) { chain.unshift(c); c = c.parent; }
    p.crumbs = chain.map(c => ({ title: c.title, href: c.href }));
    p.children.sort((a, b) => (Number(b.isIndex) - Number(a.isIndex)) || a.order - b.order || a.title.localeCompare(b.title));
  }

  const topDirs = readdirSync(DOCS).filter(n => statSync(join(DOCS, n)).isDirectory() && n !== 'assets');
  const sections: Section[] = topDirs.map(dir => {
    const slug = slugify(stripNum(dir));
    const meta = SECTION_META[slug] || { icon: '📁', blurb: '', color: '#64748b' };
    const index = byId.get(slug);
    return { slug, title: index?.title || stripNum(dir), order: segOrder(dir) === 999 ? 100 : segOrder(dir), index,
      pages: pages.filter(p => p.section === slug && !p.isIndex), ...meta };
  }).sort((a, b) => a.order - b.order);

  for (const p of pages) {
    if (p.icon) continue;
    const segs = p.id.split('/');
    const own = p.isIndex ? segs[segs.length - 1] : segs[segs.length - 2];
    p.icon = FOLDER_ICONS[own] || FOLDER_ICONS[segs[1]] || SECTION_META[p.section]?.icon || '📄';
  }

  applyRegionOverlays(pages);
  cache = { pages, sections, byId };
  return cache;
}

// ---------- region overlays (kept in this repo, never in the upstream content) ----------
const OVERLAY_SECTIONS = new Set(['conditions', 'populations', 'assessments', 'prescribing', 'practice', 'procedures']);

function applyRegionOverlays(pages: Page[]) {
  const dataDir = resolve('data/alberta');
  if (!existsSync(dataDir)) return;
  const reg = getRegistry();
  const md = new Marked({ gfm: true });
  // Alberta pathways, with their links and years, come from the upstream Alberta Primary Care Pathways sheet.
  const sheet = readCsv(join(DOCS, '1 Approaches', 'Alberta Primary Care Pathways.csv'));
  const byTitle = new Map<string, any>();
  for (const raw of sheet as any[]) {
    const src = raw.source ? reg.get(raw.source) : undefined;
    const pick = (k: string) => (raw[k] === '-' ? '' : raw[k] || (src as any)?.[k] || '');
    const title = raw.title || src?.title || '';
    byTitle.set(title.trim().toLowerCase(), { title, url: pick('url'), pdf: pick('pdf'), year: yearOf(pick('year')), region: 'AB', note: raw.note || '', links: '' });
  }
  const byPage = new Map<string, any[]>();
  for (const m of readCsv(join(dataDir, 'pathways.csv'))) {
    const row = byTitle.get(m.pathway.trim().toLowerCase());
    if (!row) { console.warn(`[alberta] pathway not found in upstream sheet: "${m.pathway}"`); continue; }
    const list = byPage.get(m.page) || []; list.push(row); byPage.set(m.page, list);
  }
  const topicRows = new Map<string, any[]>();
  for (const t of readCsv(join(dataDir, 'topics.csv'))) {
    const list = topicRows.get(t.page) || [];
    list.push({ title: t.title, url: t.url, pdf: '', year: yearOf(t.year), region: 'AB', links: '', note: t.note + (t.checked ? '' : ' (this site blocks link checks; link taken from the AMA guidelines page)') });
    topicRows.set(t.page, list);
  }
  const ess = readCsv(join(dataDir, 'essentials.csv'));
  const groups = [...new Set(ess.map(e => e.group))];
  const essHtml = groups.map(g => `<div class="sub-sec"><h3>${esc(g)}</h3><ul class="items">${ess.filter(e => e.group === g).map(e =>
    `<li class="item" data-region="AB">${renderLine({ title: e.title, url: e.url, note: e.note, region: '', year: null, pdf: '', links: '' }, md, {})}</li>`).join('')}</ul></div>`).join('');

  for (const p of pages) {
    if (p.isIndex || !OVERLAY_SECTIONS.has(p.section)) continue;
    const pw = byPage.get(p.id) || [];
    const tr = topicRows.get(p.id) || [];
    const hasSheet = p.html.includes('class="sheet-sec');
    if (!hasSheet && !pw.length && !tr.length) continue;
    const pwHtml = pw.length ? `<div class="sub-sec"><h3>Alberta pathways for this topic</h3><ul class="items">${pw.map(r => `<li class="item" data-region="AB">${renderLine(r, md, {})}</li>`).join('')}</ul></div>` : '';
    const trHtml = tr.length ? `<div class="sub-sec"><h3>Alberta guidelines and resources</h3><ul class="items">${tr.map(r => `<li class="item" data-region="AB">${renderLine(r, md, {})}</li>`).join('')}</ul></div>` : '';
    const n = pw.length + tr.length;
    const box = `<section class="sheet-sec region-box" id="alberta" data-only="yes" data-region="AB">
<h2><span>🏔️ Alberta</span>${n ? `<span class="count">${n}</span>` : ''}</h2>
${pwHtml}${trHtml}
<details class="ess"${n ? '' : ' open'}><summary>Alberta essentials: advice, referral and prescribing</summary>${essHtml}</details>
</section>`;
    const i = p.html.indexOf('<section class="sheet-sec');
    p.html = i >= 0 ? p.html.slice(0, i) + box + p.html.slice(i) : box + p.html;
    p.headings.unshift({ id: 'alberta', text: '🏔️ Alberta', level: 2, count: n, region: 'AB' });
  }
}

export function upstreamInfo(): { repo: string; sha: string; syncedAt: string } {
  const f = join(CONTENT_ROOT, 'upstream.json');
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { repo: 'https://github.com/joegrafe/np-practice-resource', sha: '', syncedAt: '' };
}

export const sectionMeta = SECTION_META;
