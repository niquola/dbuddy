import { Pool, PoolClient } from 'pg'
import { DatabaseConfig, QueryResult } from './types'
import { getDatabaseConfig } from './config'

export class Database {
  private pool: Pool

  constructor(config?: DatabaseConfig) {
    // Use provided config or load from environment variables
    const dbConfig = config || getDatabaseConfig()
    this.pool = new Pool(dbConfig)
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const client = await this.pool.connect()
    try {
      const result = await client.query(text, params)
      return {
        rows: result.rows,
        rowCount: result.rowCount || 0
      }
    } finally {
      client.release()
    }
  }

  async getClient(): Promise<PoolClient> {
    return this.pool.connect()
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
} 