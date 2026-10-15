// Bundles the API (including src/contracts) into dist/server.js. Every npm dependency stays external
// and is installed in the runtime image.
import { cp, readFile, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies);

await rm('dist', { recursive: true, force: true });
await build({
  entryPoints: ['src/server.ts', 'src/Infrastructure/Database/cli.ts'],
  outdir: 'dist',
  entryNames: '[name]',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [...external, 'pg-native'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
// SQL migrations are read from disk at startup.
await cp('src/Infrastructure/Database/migrations', 'dist/migrations', { recursive: true });
console.log('Built dist/server.js and dist/cli.js');
