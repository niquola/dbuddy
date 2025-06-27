import { config } from 'dotenv'
import { DatabaseConfig } from './types'

// Load environment variables from .env file
config()

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