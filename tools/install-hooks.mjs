// Installs the git hooks, and stays quiet where there are none to install.
//
// `pnpm install` runs this through the root `prepare` script. Build platforms
// (Railway, Fly, Docker) unpack a source archive with no `.git` directory, so
// `lefthook install` there fails with "not a git repository", exit 128, which
// fails the install and the build with it. GitHub Actions never sees this,
// because actions/checkout hands us a real repository.
//
// The check is deliberately narrow: a missing `.git` is skipped, but lefthook
// failing inside a real repository still fails loudly. Hooks are a guardrail
// (ADR 0019) and silently having none is the outcome worth avoiding.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

if (!existsSync('.git')) {
  console.log('prepare: no .git directory, skipping git hook install');
  process.exit(0);
}

// Resolve the workspace binary rather than trusting PATH: PATH only carries
// node_modules/.bin when a package manager invokes the script, so a direct
// `node tools/install-hooks.mjs` would otherwise fail confusingly.
const local = join('node_modules', '.bin', process.platform === 'win32' ? 'lefthook.cmd' : 'lefthook');
const bin = existsSync(local) ? local : 'lefthook';

const result = spawnSync(bin, ['install'], { stdio: 'inherit', shell: true });

if (result.error) {
  console.error(`prepare: could not run ${bin}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
