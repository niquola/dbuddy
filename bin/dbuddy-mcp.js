#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

// Run the MCP server
const mcpServerPath = path.join(__dirname, '..', 'dist', 'mcp-server.js')

// Determine working directory - use first path from WORKSPACE_FOLDER_PATHS or default to process.cwd()
const firstPath = process.env.WORKSPACE_FOLDER_PATHS?.split(',')[0]?.trim()
const workingDir = firstPath || process.cwd()

const child = spawn('node', [mcpServerPath], {
  stdio: 'inherit',
  cwd: workingDir,
  env: {
    ...process.env,
    WORKSPACE: firstPath
  }
})

child.on('exit', (code) => {
  process.exit(code)
})