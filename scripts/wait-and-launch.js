#!/usr/bin/env node
/**
 * Polls localhost until Next.js is ready, then launches Electron.
 */
const http       = require('http');
const { execFile } = require('child_process');
const path       = require('path');
const ROOT       = path.join(__dirname, '..');
const ELECTRON   = require(path.join(ROOT, 'node_modules', 'electron'));

function tryPorts(resolve) {
  const ports = [3000, 3001, 3002, 3003];
  let i = 0;
  const attempt = () => {
    const port = ports[i++ % ports.length];
    http.get(`http://localhost:${port}`, res => {
      if (res.statusCode < 500) resolve(port);
      else setTimeout(attempt, 600);
    }).on('error', () => setTimeout(attempt, 600));
  };
  attempt();
}

console.log('[wait-and-launch] Waiting for Next.js dev server...');

new Promise(resolve => tryPorts(resolve)).then(port => {
  console.log(`[wait-and-launch] Ready on :${port} — launching Electron`);
  const child = execFile(ELECTRON, [ROOT], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development', NEXT_DEV_PORT: String(port) },
  });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.on('exit', code => process.exit(code ?? 0));
});

