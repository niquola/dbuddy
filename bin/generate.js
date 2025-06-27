#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const binDir = __dirname;
// Get the project root (one level up from bin)
const projectRoot = path.dirname(binDir);
// Path to the generator TypeScript file
const generatorPath = path.join(projectRoot, 'src', 'generator.ts');

// Pass all command line arguments to the generator
const args = process.argv.slice(2);

// Spawn tsx to run the TypeScript generator
const child = spawn('npx', ['tsx', generatorPath, ...args], {
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