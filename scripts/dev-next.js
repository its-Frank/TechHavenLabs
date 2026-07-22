#!/usr/bin/env node
// Runs: next dev  (always from the project root regardless of where npm was called from)
process.chdir(__dirname + '/..');
process.argv = ['node', 'next', 'dev'];
require('../node_modules/next/dist/bin/next');
