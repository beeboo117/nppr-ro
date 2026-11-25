import { loadSite } from '../lib/content';

export function GET() {
  const { pages, sections } = loadSite();
  const secTitle = new Map(sections.map(s => [s.slug, s.title]));
  const P = pages.map(p => ({
    t: p.title, u: p.href, i: p.icon, s: secTitle.get(p.section) || '', x: p.isIndex ? 1 : 0,
    a: p.aliases.join(', '), e: [...new Set(p.entries.flatMap(e => `${e.title} ${e.keywords}`.toLowerCase().split(/[^a-z0-9-]+/)).filter(w => w.length > 3))].join(' '), d: (p.description || p.intro).slice(0, 160),
  }));
  const seen = new Set<string>();
  const E: any[] = [];
  for (const p of pages) for (const e of p.entries) {
    const key = (e.url || e.pdf) + '|' + p.id;
    if (!e.title || !(e.url || e.pdf) || seen.has(key)) continue;
    seen.add(key);
    E.push({ t: e.title, u: e.url || e.pdf, f: e.pdf || undefined, y: e.year || undefined, r: e.region || undefined, k: e.keywords || undefined, pg: p.title, ph: p.href });
  }
  return new Response(JSON.stringify({ pages: P, entries: E }), { headers: { 'Content-Type': 'application/json' } });
}
