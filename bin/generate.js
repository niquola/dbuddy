#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const binDir = __dirname;
// Get the project root (one level up from bin)
const projectRoot = path.dirname(binDir);
// Path to the compiled generator JavaScript file
const generatorPath = path.join(projectRoot, 'dist', 'generator.js');

// Pass all command line arguments to the generator
const args = process.argv.slice(2);

// Run the compiled JavaScript generator
const child = spawn('node', [generatorPath, ...args], {
  stdio: 'inherit',
  cwd: projectRoot
});

child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to start generator:', error.message);
  process.exit(1);
}); 