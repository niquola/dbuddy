import { config } from 'dotenv'
import { DatabaseConfig } from './types'
import path from 'path'
import fs from 'fs'

// Function to find the base project directory where npx was called
export function getProjectBaseDirectory(): string {
  const firstPath = process.env.WORKSPACE_FOLDER_PATHS?.split(',')[0]?.trim()
  return firstPath || process.env.WORKSPACE || process.cwd()
}

// Function to find .env file starting from the project base directory
function findEnvFile(): string | undefined {
  const baseDir = getProjectBaseDirectory()
  
  // First try the base directory
  const envPath = path.join(baseDir, '.env')
  if (fs.existsSync(envPath)) {
    return envPath
  }

  // Fallback: search up the directory tree from base directory
  let currentDir = baseDir
  while (currentDir !== path.dirname(currentDir)) {
    const envPath = path.join(currentDir, '.env')
    if (fs.existsSync(envPath)) {
      return envPath
    }
    currentDir = path.dirname(currentDir)
  }

  return undefined
}

// Load environment variables from .env file in the directory where npx was called
const envPath = findEnvFile()
if (envPath) {
  config({ path: envPath })
}

export function getDatabaseConfig(): DatabaseConfig {
  return {
    host: process.env.PGHOST || process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.PGPORT || process.env.DATABASE_PORT || '5432', 10),
    database: process.env.PGDATABASE || process.env.DATABASE_NAME || 'postgres',
    user: process.env.PGUSER || process.env.DATABASE_USER || 'postgres',
    password: process.env.PGPASSWORD || process.env.DATABASE_PASSWORD || ''
  }
}

export function getDatabaseUrl(): string {
  const dbConfig = getDatabaseConfig()
  return process.env.DATABASE_URL || 
    `postgresql://${dbConfig.user}:${dbConfig.password}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
}

// Function to resolve output directory relative to project base
export function resolveOutputDirectory(outputDir: string): string {
  if (path.isAbsolute(outputDir)) {
    return outputDir
  }
  
  const baseDir = getProjectBaseDirectory()
  return path.resolve(baseDir, outputDir)
} 