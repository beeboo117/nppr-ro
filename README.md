# Primary Care Practice Resource

RoPro's interactive index of current primary care guidelines for NPs, MDs and DOs, built on the [NP Practice Resource (NPPR.ca)](https://www.nppr.ca). The name is set in `src/lib/brand.ts`.

**Live site:** https://beeboo117.github.io/nppr-ro/

## What's different

- **Dashboard home page:** topic and source counts, how current the sources are, condition pages by body system, recently reviewed pages, and your own recently read and saved topics.
- **Easy navigation:** the section tabs and the full topic menu are always on screen, with breadcrumbs, "Also in this section" cards, previous/next links and animated page transitions.
- **Quick search (Ctrl K or /):** jump to any topic or any of the ~3,200 guidelines from anywhere.
- **Topic pages:** a contents bar, a filter box for the page's links, collapsible guideline boxes, year badges coloured by age, PDF chips, a reading progress bar and a ☆ Save button.
- **Research sidebar:** on every topic page, live results from PubMed (newest articles, reviews, guidelines, trials), Europe PMC (free full text and NCBI Bookshelf / StatPearls chapters), a Wikipedia summary, and links to videos, podcasts, flashcards and more.
- **Province switch** (BC / ON) and light and dark themes.
- **42 extra condition pages** that NPPR.ca doesn't have yet (BPH, kidney stones, IBD, hepatitis B and C, epilepsy, Parkinson disease, shoulder and knee pain, skin cancer, HIV and PrEP, bipolar disorder, PCOS, PAD and more). Each one links the University of Calgary Blackbook diagnostic schemes for its presentations.

## How it works

The site doesn't copy NPPR's content into this repository. Each build runs `npm run sync`, which clones [joegrafe/np-practice-resource](https://github.com/joegrafe/np-practice-resource) read-only and copies its `docs/` folder. Astro then builds a static site from those Markdown pages and CSV list sheets. A GitHub Action rebuilds and deploys to GitHub Pages on every push and every night, so new NPPR content shows up automatically.

```bash
npm ci
npm run sync      # fetch the latest NPPR content into ./content
npm run dev       # http://localhost:4321/nppr-ro/
npm run build     # static site in ./dist
```

## Extra topic pages

`data/topics/` holds topic pages written for this site, laid out like NPPR's `docs/` folder (for example `data/topics/3 Conditions/Neurology/Epilepsy and Seizures.md` with its `.csv` list sheet beside it). They use NPPR's page format and list-sheet columns, and can cite NPPR's source registry by `source` id. The build merges them into the synced content and marks them "Added here". If NPPR later publishes a page at the same address, the upstream page is used and ours is skipped with a build warning.

Most links on these pages come from NPPR's own checked registry and approach lists (CMAJ Five Things, Canadian Family Physician, AAFP, Pathways BC, Alberta's Pathway Hub, CEP, Ontario Health, PedsCases, TREKK and the UCalgary Blackbook). Links added from elsewhere (mainly CUA guidelines and HealthLink BC patient pages) were found and checked by search on 2026-11-28; each page's header comment says which.

## Credit and licence

Content: [NPPR.ca](https://www.nppr.ca), by Joe Grafe and contributors, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Only the `docs/` folder is used, as that licence covers it. Linked guidelines, PDFs and logos belong to their publishers. This site is not affiliated with or endorsed by NPPR.ca and is not clinical advice.
