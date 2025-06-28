import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from '../src/database'
import { getDatabaseConfig } from '../src/config'

// Load configuration from environment variables
const testConfig = getDatabaseConfig()

describe('Database', () => {
  let db: Database

  beforeAll(() => {
    db = new Database(testConfig)
  })

  afterAll(async () => {
    await db.close()
  })

  it('should create database instance', () => {
    expect(db).toBeInstanceOf(Database)
  })

  it('should execute simple query', async () => {
    const result = await db.query<{ test: number }>('SELECT 1 as test')
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].test).toBe(1)
  })

  it('should execute parameterized query', async () => {
    const result = await db.query<{ value: string }>('SELECT $1 as value', ['hello'])
    expect(result.rows[0].value).toBe('hello')
  })
}) 