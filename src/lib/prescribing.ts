// Prescribing by body system: site-built pages (kept in this repo, never upstream).
// Each page gathers the prescribing rows that already sit on the condition and
// population pages, groups them by body system, shows each source once, and
// splits out drug coverage and safety references.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseCsv } from 'csv-parse/sync';
import type { Page, SheetRow, Entry, Heading } from './content';

const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

interface Group {
  slug: string; title: string; short?: string; icon?: string; type: 'rx-system' | 'rx-population';
  research: string; aliases: string[];
  sources: (p: Page) => boolean;   // which pages' rows to gather
  heading: RegExp;                 // which heading on those pages
  safety?: RegExp;                 // deprescribing algorithms that apply
  safetyAll?: boolean;
  renal?: boolean;                 // add the creatinine clearance calculator
  callout?: string;
}

const PRESCRIBING = /^prescribing$/i;
const inSystem = (s: string) => (p: Page) => p.id.startsWith(`conditions/${s}/`) && !p.isIndex;
const sys = (s: string, research: string, aliases: string[], extra: Partial<Group> = {}): Group =>
  ({ slug: s, title: '', type: 'rx-system', research, aliases, sources: inSystem(s), heading: PRESCRIBING, ...extra });

const GROUPS: Group[] = [
  sys('cardiovascular', 'cardiovascular pharmacotherapy', ['heart medications', 'antihypertensives', 'anticoagulants', 'statins'], { safety: /statin/i, renal: true }),
  sys('respiratory', 'inhaler therapy asthma COPD', ['inhalers', 'asthma medications', 'COPD medications']),
  sys('endocrine-and-metabolic', 'diabetes pharmacotherapy', ['diabetes medications', 'insulin', 'thyroid medications'], { safety: /antihyperglyc/i }),
  sys('renal-and-genitourinary', 'drug dosing in chronic kidney disease', ['kidney dosing', 'renal dosing'], { renal: true }),
  sys('gastrointestinal-and-liver', 'gastrointestinal pharmacotherapy', ['PPI', 'proton pump inhibitors'], { safety: /proton pump/i }),
  sys('musculoskeletal', 'analgesic pharmacotherapy', ['pain medications', 'NSAIDs', 'DMARDs']),
  sys('neurology', 'neurology pharmacotherapy', ['migraine medications', 'dementia medications'], { safety: /cholinesterase|antipsychotic/i }),
  sys('mental-health-and-substance-use', 'psychopharmacology primary care', ['psychiatric medications', 'antidepressants', 'ADHD medications'], { safety: /benzodiazepine|antipsychotic/i }),
  sys('dermatology', 'topical therapy dermatology', ['topical steroids', 'acne medications']),
  sys('infectious-disease', 'antimicrobial stewardship primary care', ['antibiotics', 'antivirals'], { callout: 'prescribing/antimicrobials' }),
  sys('hematology-and-oncology', 'anticoagulant therapy', ['iron', 'anticoagulation'], { renal: true }),
  sys('eyes-ears-nose-and-throat', 'otitis allergic rhinitis drug therapy', ['eye drops', 'ear drops', 'antihistamines'], { short: 'EENT and allergy' }),
  sys('sexual-and-reproductive-health', 'hormonal contraception menopause hormone therapy', ['contraception', 'HRT', 'STI treatment']),
  { slug: 'children', title: 'Children', icon: '👶', type: 'rx-population', research: 'pediatric pharmacotherapy', aliases: ['pediatric dosing', 'kids medications'],
    sources: p => p.id.startsWith('populations/pediatrics/') && !p.isIndex, heading: PRESCRIBING },
  { slug: 'pregnancy-and-lactation', title: 'Pregnancy and lactation', icon: '🤰', type: 'rx-population', research: 'medication safety pregnancy lactation', aliases: ['breastfeeding medications', 'perinatal medications'],
    sources: p => p.id === 'populations/pregnancy-and-perinatal', heading: /^medication in pregnancy/i },
  { slug: 'older-adults', title: 'Older adults and palliative care', short: 'Older adults', icon: '🧓', type: 'rx-population', research: 'deprescribing older adults', aliases: ['geriatric prescribing', 'palliative medications', 'Beers criteria'],
    sources: p => p.id === 'populations/older-adults' || p.id === 'populations/palliative-care', heading: PRESCRIBING, safetyAll: true, renal: true },
  { slug: 'more-populations', title: 'Trans care and other populations', short: 'Trans care and more', icon: '👥', type: 'rx-population', research: 'gender-affirming hormone therapy', aliases: ['gender-affirming hormones'],
    sources: p => p.id === 'populations/trans-care' || p.id === 'populations/adults-with-intellectual-and-developmental-disabilities', heading: PRESCRIBING },
];

// Rows about paying for drugs go in the coverage block, not under conditions.
const COVERAGE = /special authori|exceptional access|\bEAP\b|SADIE|formulary|coverage|pharmacare\b.*\b(program|plan|disorder|dependence)|reference drug program|drug benefit|limited coverage|non-insured|\bNIHB\b|odb-|sa-request|pharmacare-sa/i;

interface Block { top: SheetRow; subs: SheetRow[]; page: Page; also: Page[]; coverage: boolean }

function blocksOf(page: Page, heading: RegExp, rows = page.rows): Block[] {
  const out: Block[] = [];
  for (const r of rows) {
    if (!heading.test(r.heading.trim())) continue;
    if (r.level === 0) out.push({ top: r, subs: [], page, also: [], coverage: COVERAGE.test(r.text + ' ' + r.key) });
    else if (out.length) out[out.length - 1].subs.push(r);
  }
  return out;
}

// Show each source once: later copies add their sub-rows and an "also in" link to the first.
function dedupe(blocks: Block[]): Block[] {
  const first = new Map<string, Block>();
  const out: Block[] = [];
  for (const b of blocks) {
    const k = b.top.key && b.top.kind !== 'md' && b.top.kind !== 'note' ? b.top.key : '';
    const prev = k ? first.get(k) : undefined;
    if (!prev) { if (k) first.set(k, b); out.push(b); continue; }
    const have = new Set(prev.subs.map(s => s.key));
    for (const s of b.subs) if (!s.key || !have.has(s.key)) { prev.subs.push(s); if (s.key) have.add(s.key); }
    if (b.page !== prev.page && !prev.also.includes(b.page)) prev.also.push(b.page);
  }
  return out;
}

const subHtml = (s: SheetRow) =>
  `<li class="sub lvl${s.level}${s.kind === 'note' ? ' note-li' : ''}"${s.attrs}>${s.kind === 'note' ? `<em>${s.html}</em>` : s.html}</li>`;

function chipsHtml(pages: Page[], label: string) {
  if (!pages.length) return '';
  return `<span class="also-in">${label} ${pages.map(p => `<a href="${p.href}">${esc(p.title)}</a>`).join(', ')}</span>`;
}

function blockHtml(b: Block, chips: string) {
  const t = b.top;
  if (t.kind === 'md' || t.kind === 'note') {
    return `<li class="item md-li"${t.attrs}>${t.kind === 'note' ? `<em>${t.html}</em>` : t.html}${chips}</li>${b.subs.map(subHtml).join('')}`;
  }
  if (t.kind === 'box') {
    return `<li class="item box-item"${t.attrs}><details class="box"><summary>${t.html}<span class="chev" aria-hidden="true"></span></summary><div class="box-body">${t.note ? `<p class="note">${t.note}</p>` : ''}${chips}<ul class="sub-items">${b.subs.map(subHtml).join('')}</ul></div></details></li>`;
  }
  return `<li class="item"${t.attrs}>${t.html}${chips}</li>${b.subs.map(subHtml).join('')}`;
}

const countOf = (bs: Block[]) => bs.filter(b => b.top.kind !== 'md' && b.top.kind !== 'note').length;
const entriesOf = (bs: Block[]) => bs.flatMap(b => [b.top, ...b.subs]).map(r => r.entry).filter((e): e is Entry => !!e);
const section = (id: string, title: string, n: number, inner: string) =>
  `<section class="sheet-sec reveal" id="${id}"><h2><span>${esc(title)}</span>${n ? `<span class="count">${n}</span>` : ''}</h2>${inner}</section>`;

function albertaCoverage(): string {
  const f = resolve('data/alberta/essentials.csv');
  if (!existsSync(f)) return '';
  const rows: Record<string, string>[] = parseCsv(readFileSync(f, 'utf8').replace(/\r\n?/g, '\n'), { columns: true, skip_empty_lines: true, bom: true });
  return rows.filter(r => /drug benefit|special authori/i.test(r.title)).map(r =>
    `<li class="item" data-region="AB" data-only="yes" data-text="${esc((r.title + ' ' + r.note + ' alberta').toLowerCase())}"><span class="line-main"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><span class="chip rg" data-rg="AB">AB</span></span><span class="note">${esc(r.note)}</span></li>`).join('');
}

export function buildPrescribingBySystem(pages: Page[], base: string, folderIcons: Record<string, string>): Page[] {
  const byId = new Map(pages.map(p => [p.id, p]));
  const rxIndex = byId.get('prescribing');
  if (!rxIndex) return [];
  const depr = byId.get('prescribing/deprescribing');
  const refs = byId.get('prescribing/drug-references');
  const link = (id: string, text: string) => { const p = byId.get(id); return p ? `<a href="${p.href}">${esc(text)}</a>` : esc(text); };
  const abCoverage = albertaCoverage();

  const make = (id: string, extra: Partial<Page>): Page => ({
    id, href: `${base}${id}/`, file: '', section: 'prescribing', crumbs: [], isIndex: false, order: 0, title: '', description: '',
    type: '', system: '', tags: [], aliases: [], jurisdiction: [], region: '', lastReviewed: '', reviewDue: '', status: '',
    icon: '💊', logo: '', intro: '', html: '', headings: [], entries: [], children: [], rows: [], generated: true, ...extra,
  });

  const hub = make('prescribing/by-system', {
    isIndex: true, order: 0, title: 'By body system', icon: '🧭',
    intro: 'Prescribing references grouped by body system and population, gathered from the Prescribing section of every condition and population page.',
  });

  const out: Page[] = [hub];
  GROUPS.forEach((g, i) => {
    const sysIndex = g.type === 'rx-system' ? byId.get(`conditions/${g.slug}`) : undefined;
    const title = g.title || sysIndex?.title || g.slug;
    const srcPages = pages.filter(g.sources).sort((a, b) => a.title.localeCompare(b.title));
    const all = dedupe(srcPages.flatMap(p => blocksOf(p, g.heading)));
    if (!all.length) return;
    const id = `prescribing/by-system/${g.slug}`;
    const short = g.short || title;
    const pageHref = `${base}${id}/`;

    // 1. By condition
    const conds = srcPages.map(p => ({ p, bs: all.filter(b => b.page === p && !b.coverage) })).filter(c => c.bs.length);
    const condHtml = conds.map(c => `<div class="sub-sec rx-cond" id="c-${slug(c.p.title)}"><h3><a href="${c.p.href}">${esc(c.p.title)}</a></h3><ul class="items">${c.bs.map(b => blockHtml(b, chipsHtml(b.also, 'Also in'))).join('')}</ul></div>`).join('');
    const condBlocks = conds.flatMap(c => c.bs);

    // 2. Coverage
    const cov = all.filter(b => b.coverage);
    const covHtml = `<p class="sheet-note"><em>Coverage rows follow the province picked at the top of the page.</em></p><ul class="items">${abCoverage}${cov.map(b => blockHtml(b, chipsHtml([b.page, ...b.also], 'Used for'))).join('')}<li class="item md-li">All plans, formularies and special authority forms: ${link('prescribing/drug-coverage', 'Drug Coverage')}</li></ul>`;

    // 3. Safety
    const safe: Block[] = [];
    if (depr && (g.safety || g.safetyAll)) {
      for (const b of blocksOf(depr, /^algorithms by drug class$/i)) if (b.top.kind !== 'md' && (g.safetyAll || g.safety!.test(b.top.text))) safe.push(b);
      if (g.safetyAll) safe.push(...blocksOf(depr, /^medication review tools$/i));
    }
    if (refs && g.renal) safe.push(...blocksOf(refs, /^dosing calculators$/i).filter(b => /creatinine/i.test(b.top.text)));
    const safeHtml = `<ul class="items">${safe.map(b => blockHtml(b, '')).join('')}<li class="item md-li">More: ${link('prescribing/deprescribing', 'Deprescribing')} algorithms, ${link('prescribing/drug-references', 'Drug References')} for monographs, interactions and safety alerts, and ${link('populations/pregnancy-and-perinatal', 'Pregnancy and Perinatal')} for use in pregnancy.</li></ul>`;

    const headings: Heading[] = [];
    let html = '';
    if (g.callout) {
      const target = byId.get(g.callout);
      if (target) html += `<div class="callout"><p class="callout-title">Antibiotic choice and stewardship</p><p>Start with ${link(g.callout, target.title)}: Canadian and provincial antibiotic guides, penicillin allergy assessment and stewardship tools. Below are the condition-specific references.</p></div>`;
    }
    if (condBlocks.length) { const byLabel = g.type === 'rx-system' ? 'By condition' : 'By topic';
      html += section('by-condition', byLabel, countOf(condBlocks), condHtml); headings.push({ id: 'by-condition', text: byLabel, level: 2, count: countOf(condBlocks) }); }
    html += section('coverage', 'Drug coverage', countOf(cov), covHtml); headings.push({ id: 'coverage', text: 'Drug coverage', level: 2, count: countOf(cov) });
    html += section('safety', 'Safety and deprescribing', countOf(safe), safeHtml); headings.push({ id: 'safety', text: 'Safety and deprescribing', level: 2, count: countOf(safe) });

    const what = g.type === 'rx-system' ? `${title.toLowerCase()} conditions` : title.toLowerCase();
    out.push(make(id, {
      order: i + 1, title: `${short} prescribing`, short, type: g.type,
      icon: g.icon || folderIcons[g.slug] || sysIndex?.icon || '💊',
      intro: `Prescribing references for ${what}, gathered from ${srcPages.filter(p => all.some(b => b.page === p)).length} pages. Each source appears once; "Also in" shows the other pages that cite it.`,
      aliases: g.aliases, researchTerm: g.research, html, headings,
      entries: entriesOf([...condBlocks, ...cov, ...safe]),
    }));

    // "More prescribing for …" on each source page's own prescribing section.
    for (const p of srcPages) {
      const hd = all.find(b => b.page === p)?.top.heading;
      if (!hd) continue;
      const re = new RegExp(`(<section class="sheet-sec reveal" id="${slug(hd)}"><h2>[\\s\\S]*?</h2>)`);
      p.html = p.html.replace(re, `$1<p class="rx-more"><a href="${pageHref}">More prescribing for ${esc((g.type === 'rx-system' ? short : title).toLowerCase().replace(/^eent/, 'EENT'))} →</a></p>`);
    }
  });

  rxIndex.featured = hub;
  return out;
}
