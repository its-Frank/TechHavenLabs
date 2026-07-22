#!/usr/bin/env node
// npm start — launch Electron in production mode (loads out/index.html)
const { execFile } = require('child_process');
const path     = require('path');
const ROOT     = path.join(__dirname, '..');
const ELECTRON = require(path.join(ROOT, 'node_modules', 'electron'));

const child = execFile(ELECTRON, [ROOT], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: 'production' },
});
child.stdout?.pipe(process.stdout);
child.stderr?.pipe(process.stderr);
child.on('exit', code => process.exit(code ?? 0));
