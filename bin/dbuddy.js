#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const binDir = __dirname;
// Get the project root (one level up from bin)
const projectRoot = path.dirname(binDir);
// Path to the compiled CLI JavaScript file
const cliPath = path.join(projectRoot, 'dist', 'cli.js');

// Pass all command line arguments to the CLI
const args = process.argv.slice(2);

// Run the compiled JavaScript CLI
const child = spawn('node', [cliPath, ...args], {
  stdio: 'inherit'
  // Don't set cwd to preserve the directory where the command was called from
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to start CLI:', error.message);
  process.exit(1);
}); 