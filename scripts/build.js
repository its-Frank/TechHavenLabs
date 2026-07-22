#!/usr/bin/env node
// Helper: run next build with the correct cwd
process.chdir(__dirname + '/..');
process.argv = ['node', 'next', 'build'];
require('../node_modules/next/dist/bin/next');
