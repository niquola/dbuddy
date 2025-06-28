import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Database } from '../src/database'
import { MigrationRunner } from '../src/migration-runner'
import fs from 'fs'
import path from 'path'

// Test migrations directory
const TEST_MIGRATIONS_DIR = './test-migrations'

describe('Migration System', () => {
  let db: Database
  let runner: MigrationRunner

  beforeEach(async () => {
    // Create test migrations directory
    if (fs.existsSync(TEST_MIGRATIONS_DIR)) {
      fs.rmSync(TEST_MIGRATIONS_DIR, { recursive: true })
    }
    fs.mkdirSync(TEST_MIGRATIONS_DIR, { recursive: true })

    // Initialize database and migration runner
    db = new Database()
    runner = new MigrationRunner(db, TEST_MIGRATIONS_DIR)

    // Clean up any existing test data
    try {
      await db.query('DROP TABLE IF EXISTS test_users CASCADE')
      await db.query('DROP TABLE IF EXISTS test_posts CASCADE')
      await db.query('DROP TABLE IF EXISTS dbuddy_migrations CASCADE')
    } catch (error) {
      // Ignore errors during cleanup
    }

    // Initialize migration system
    await runner.initialize()
  })

  afterEach(async () => {
    // Clean up
    try {
      await db.query('DROP TABLE IF EXISTS test_users CASCADE')
      await db.query('DROP TABLE IF EXISTS test_posts CASCADE')
      await db.query('DROP TABLE IF EXISTS dbuddy_migrations CASCADE')
    } catch (error) {
      // Ignore errors during cleanup
    }

    await db.close()

    // Remove test migrations directory
    if (fs.existsSync(TEST_MIGRATIONS_DIR)) {
      fs.rmSync(TEST_MIGRATIONS_DIR, { recursive: true })
    }
  })

  it('should initialize migration system', async () => {
    // Check that migrations table exists
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'dbuddy_migrations'
    `)
    
    expect(result.rows).toHaveLength(1)
  })

  it('should generate migration files', async () => {
    const { version, upFile, downFile } = await runner.generateMigration('test_migration')

    expect(version).toMatch(/^\d{14}$/)
    expect(fs.existsSync(upFile)).toBe(true)
    expect(fs.existsSync(downFile)).toBe(true)

    const upContent = fs.readFileSync(upFile, 'utf8')
    const downContent = fs.readFileSync(downFile, 'utf8')

    expect(upContent).toContain('-- Migration: test_migration')
    expect(downContent).toContain('-- Migration: test_migration')
  })

  it('should show empty status initially', async () => {
    const status = await runner.getStatus()
    expect(status).toHaveLength(0)
  })

  it('should show pending migrations', async () => {
    // Create a test migration
    const { version } = await runner.generateMigration('test_migration')
    
    // Add SQL to the migration files
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_test_migration.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_test_migration.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY);')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    const status = await runner.getStatus()
    
    expect(status).toHaveLength(1)
    expect(status[0].version).toBe(version)
    expect(status[0].name).toBe('test_migration')
    expect(status[0].status).toBe('pending')
    expect(status[0].appliedAt).toBeUndefined()
  })

  it('should apply migrations', async () => {
    // Create a test migration
    const { version } = await runner.generateMigration('add_test_users')
    
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100));')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    // Apply migration
    await runner.migrateUp()

    // Check status
    const status = await runner.getStatus()
    expect(status[0].status).toBe('applied')
    expect(status[0].appliedAt).toBeDefined()

    // Check that table was created
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(result.rows).toHaveLength(1)
  })

  it('should rollback migrations', async () => {
    // Create and apply a migration
    const { version } = await runner.generateMigration('add_test_users')
    
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100));')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    await runner.migrateUp()

    // Verify table exists
    let result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(result.rows).toHaveLength(1)

    // Rollback migration
    await runner.migrateDown()

    // Check status
    const status = await runner.getStatus()
    expect(status[0].status).toBe('pending')

    // Check that table was dropped
    result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(result.rows).toHaveLength(0)
  })

  it('should handle multiple migrations in order', async () => {
    // Create migrations with explicit ordering using known timestamps
    const v1 = '20240101120000'
    const v2 = '20240101130000'
    
    // Create migration files manually with correct timestamps
    const upFile1 = path.join(TEST_MIGRATIONS_DIR, `${v1}_add_users.up.sql`)
    const downFile1 = path.join(TEST_MIGRATIONS_DIR, `${v1}_add_users.down.sql`)
    const upFile2 = path.join(TEST_MIGRATIONS_DIR, `${v2}_add_posts.up.sql`)
    const downFile2 = path.join(TEST_MIGRATIONS_DIR, `${v2}_add_posts.down.sql`)
    
    fs.writeFileSync(upFile1, '-- Migration: add_users\nCREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100));')
    fs.writeFileSync(downFile1, '-- Migration: add_users\nDROP TABLE IF EXISTS test_users;')
    fs.writeFileSync(upFile2, '-- Migration: add_posts\nCREATE TABLE test_posts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES test_users(id), title VARCHAR(255));')
    fs.writeFileSync(downFile2, '-- Migration: add_posts\nDROP TABLE IF EXISTS test_posts;')

    // Verify order by checking status first
    const statusBefore = await runner.getStatus()
    expect(statusBefore).toHaveLength(2)
    expect(statusBefore[0].version).toBe(v1)
    expect(statusBefore[1].version).toBe(v2)

    // Apply all migrations
    await runner.migrateUp()

    // Check that both tables exist
    let result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('test_users', 'test_posts')
      ORDER BY table_name
    `)
    expect(result.rows).toHaveLength(2)

    // Check migration status
    const status = await runner.getStatus()
    expect(status).toHaveLength(2)
    expect(status[0].status).toBe('applied')
    expect(status[1].status).toBe('applied')

    // Rollback to first migration
    await runner.migrateDown({ target: v1 })

    // Check that only users table exists
    result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('test_users', 'test_posts')
      ORDER BY table_name
    `)
    expect(result.rows).toHaveLength(1)
    expect((result.rows[0] as any).table_name).toBe('test_users')
  })

  it('should handle dry-run mode', async () => {
    // Create a test migration
    const { version } = await runner.generateMigration('add_test_users')
    
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_add_test_users.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100));')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    // Apply with dry-run
    await runner.migrateUp({ dryRun: true })

    // Check that migration is still pending
    const status = await runner.getStatus()
    expect(status[0].status).toBe('pending')

    // Check that table was NOT created
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(result.rows).toHaveLength(0)
  })

  it('should handle transaction rollback on error', async () => {
    // Create a migration with invalid SQL
    const { version } = await runner.generateMigration('invalid_migration')
    
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_invalid_migration.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_invalid_migration.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY); INVALID SQL STATEMENT;')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    // Attempt to apply migration (should fail)
    await expect(runner.migrateUp()).rejects.toThrow()

    // Check that migration was not recorded as applied
    const status = await runner.getStatus()
    expect(status[0].status).toBe('pending')

    // Check that table was not created (transaction rolled back)
    const result = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(result.rows).toHaveLength(0)
  })

  it('should auto-initialize migrations when running migrateUp', async () => {
    // Drop the migrations table if it exists
    await db.query('DROP TABLE IF EXISTS dbuddy_migrations CASCADE')

    // Create a test migration
    const { version } = await runner.generateMigration('test_auto_init')
    
    const upFile = path.join(TEST_MIGRATIONS_DIR, `${version}_test_auto_init.up.sql`)
    const downFile = path.join(TEST_MIGRATIONS_DIR, `${version}_test_auto_init.down.sql`)
    
    fs.writeFileSync(upFile, 'CREATE TABLE test_users (id SERIAL PRIMARY KEY, name VARCHAR(100));')
    fs.writeFileSync(downFile, 'DROP TABLE IF EXISTS test_users;')

    // Try to apply migration without initializing first
    await runner.migrateUp()

    // Verify that both the migrations table and the test table were created
    const migrationsTableResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'dbuddy_migrations'
    `)
    expect(migrationsTableResult.rows).toHaveLength(1)

    const testTableResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'test_users'
    `)
    expect(testTableResult.rows).toHaveLength(1)

    // Verify that the migration was recorded
    const status = await runner.getStatus()
    expect(status[0].status).toBe('applied')
    expect(status[0].appliedAt).toBeDefined()
  })
}) 