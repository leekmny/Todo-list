import fs from 'node:fs';
import path from 'node:path';

/**
 * Since package.json uses `"type": "module"`, Electron CommonJS output files
 * need a local `dist/electron/package.json` with `{"type":"commonjs"}` and `.cjs` entrypoints.
 */
const outDir = path.resolve(process.cwd(), 'dist/electron');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8'
);

for (const file of ['main', 'preload']) {
  const jsPath = path.join(outDir, 'electron', `${file}.js`);
  const cjsPath = path.join(outDir, 'electron', `${file}.cjs`);
  if (fs.existsSync(jsPath)) {
    fs.copyFileSync(jsPath, cjsPath);
  }
}

console.log('[OK] Electron CommonJS build prepared');
