#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

// Run the MCP server
const mcpServerPath = path.join(__dirname, '..', 'dist', 'mcp-server.js')
const child = spawn('node', [mcpServerPath], {
  stdio: 'inherit'
})

child.on('exit', (code) => {
  process.exit(code)
}) 