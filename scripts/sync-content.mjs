// Copies the docs/ folder (CC BY 4.0) from Joe Grafe's NP Practice Resource into ./content.
// Read-only: this never writes to the upstream repository.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const UPSTREAM = process.env.NPPR_UPSTREAM || 'https://github.com/joegrafe/np-practice-resource';
const tmp = mkdtempSync(join(tmpdir(), 'nppr-'));
try {
  execSync(`git clone --depth 1 ${UPSTREAM} "${tmp}/repo"`, { stdio: 'inherit', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' } });
  const sha = execSync(`git -C "${tmp}/repo" rev-parse HEAD`).toString().trim();
  if (existsSync('content')) rmSync('content', { recursive: true });
  cpSync(join(tmp, 'repo', 'docs'), join('content', 'docs'), { recursive: true });
  cpSync(join(tmp, 'repo', 'LICENSE'), join('content', 'LICENSE'));
  // Upstream images (logos, team photos) are served from public/nppr-assets.
  if (existsSync(join('public', 'nppr-assets'))) rmSync(join('public', 'nppr-assets'), { recursive: true });
  cpSync(join(tmp, 'repo', 'docs', 'assets'), join('public', 'nppr-assets'), { recursive: true });
  writeFileSync(join('content', 'upstream.json'), JSON.stringify({ repo: UPSTREAM, sha, syncedAt: new Date().toISOString() }, null, 2));
  console.log(`Synced content from ${UPSTREAM} @ ${sha.slice(0, 7)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
