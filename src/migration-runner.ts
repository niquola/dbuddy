import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { Database } from './database'
import { Migration, MigrationRecord, MigrationStatus, MigrationOptions } from './types'
import { getProjectBaseDirectory } from './config'

export class MigrationRunner {
  private db: Database
  private migrationsDir: string

  constructor(db: Database, migrationsDir: string = './migrations') {
    this.db = db
    
    // Resolve migrations directory relative to project base directory
    const baseDir = getProjectBaseDirectory()
    if (path.isAbsolute(migrationsDir)) {
      this.migrationsDir = migrationsDir
    } else {
      this.migrationsDir = path.resolve(baseDir, migrationsDir)
    }
    

  }

  /**
   * Initialize the migration system by creating the migrations table
   */
  async initialize(): Promise<void> {
    const createTableSql = `
      CREATE TABLE IF NOT EXISTS dbuddy_migrations (
        id SERIAL PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW(),
        checksum VARCHAR(255) NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_dbuddy_migrations_version ON dbuddy_migrations(version);
    `
    
    await this.db.query(createTableSql)
    console.log('✅ Migration system initialized')
  }

  /**
   * Generate a new migration file pair
   */
  async generateMigration(name: string): Promise<{ version: string; upFile: string; downFile: string }> {
    // Ensure migrations directory exists
    if (!fs.existsSync(this.migrationsDir)) {
      try {
        fs.mkdirSync(this.migrationsDir, { recursive: true })
      } catch (error) {
        throw new Error(`Failed to create migrations directory: ${this.migrationsDir}. Error: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // Generate timestamp version
    const now = new Date()
    const version = now.toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\.\d{3}Z$/, '')

    // Create filenames
    const upFile = path.join(this.migrationsDir, `${version}_${name}.up.sql`)
    const downFile = path.join(this.migrationsDir, `${version}_${name}.down.sql`)

    // Create template content
    const upTemplate = `-- Migration: ${name}
-- Created: ${now.toISOString()}
-- Up migration

-- Add your SQL statements here
`

    const downTemplate = `-- Migration: ${name}
-- Created: ${now.toISOString()}
-- Down migration (rollback)

-- Add your rollback SQL statements here
`

    // Write files
    fs.writeFileSync(upFile, upTemplate)
    fs.writeFileSync(downFile, downTemplate)

    console.log(`✅ Generated migration: ${version}_${name}`)
    console.log(`   Up:   ${upFile}`)
    console.log(`   Down: ${downFile}`)

    return { version, upFile, downFile }
  }

  /**
   * Load all migration files from the migrations directory
   */
  private loadMigrationFiles(): Migration[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return []
    }

    const files = fs.readdirSync(this.migrationsDir)
    const migrationMap = new Map<string, Partial<Migration>>()

    // Group files by version
    for (const file of files) {
      if (!file.endsWith('.sql')) continue

      const match = file.match(/^(\d{14})_(.+)\.(up|down)\.sql$/)
      if (!match) continue

      const [, version, name, direction] = match
      const key = `${version}_${name}`

      if (!migrationMap.has(key)) {
        migrationMap.set(key, { version, name })
      }

      const migration = migrationMap.get(key)!
      const filePath = path.join(this.migrationsDir, file)
      const content = fs.readFileSync(filePath, 'utf8')

      if (direction === 'up') {
        migration.upSql = content
      } else {
        migration.downSql = content
      }
    }

    // Convert to complete migrations and validate
    const migrations: Migration[] = []
    for (const [key, migration] of migrationMap) {
      if (!migration.upSql || !migration.downSql) {
        console.warn(`⚠️ Incomplete migration files for ${key}`)
        continue
      }

      migrations.push({
        version: migration.version!,
        name: migration.name!,
        upSql: migration.upSql,
        downSql: migration.downSql
      })
    }

    // Sort by version
    return migrations.sort((a, b) => a.version.localeCompare(b.version))
  }

  /**
   * Get applied migrations from database
   */
  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    try {
      const result = await this.db.query<MigrationRecord>(
        'SELECT * FROM dbuddy_migrations ORDER BY version'
      )
      return result.rows
    } catch (error) {
      // Table might not exist yet
      return []
    }
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(upSql: string, downSql: string): string {
    return crypto.createHash('sha256')
      .update(upSql + downSql)
      .digest('hex')
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<MigrationStatus[]> {
    const fileMigrations = this.loadMigrationFiles()
    const appliedMigrations = await this.getAppliedMigrations()
    const appliedMap = new Map(appliedMigrations.map(m => [m.version, m]))

    return fileMigrations.map(migration => {
      const applied = appliedMap.get(migration.version)
      const result: MigrationStatus = {
        version: migration.version,
        name: migration.name,
        status: applied ? 'applied' : 'pending'
      }
      
      if (applied) {
        result.appliedAt = applied.applied_at
      }
      
      return result
    })
  }

  /**
   * Run migrations up to target version
   */
  async migrateUp(options: MigrationOptions = {}): Promise<void> {
    const { target, dryRun = false } = options
    const fileMigrations = this.loadMigrationFiles()
    const appliedMigrations = await this.getAppliedMigrations()
    const appliedVersions = new Set(appliedMigrations.map(m => m.version))

    // Filter pending migrations
    let pendingMigrations = fileMigrations.filter(m => !appliedVersions.has(m.version))

    // Filter by target if specified
    if (target) {
      pendingMigrations = pendingMigrations.filter(m => m.version <= target)
    }

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations to apply')
      return
    }

    console.log(`🚀 Applying ${pendingMigrations.length} migration(s)${dryRun ? ' (DRY RUN)' : ''}`)

    for (const migration of pendingMigrations) {
      const checksum = this.calculateChecksum(migration.upSql, migration.downSql)
      
      console.log(`   📦 ${migration.version}_${migration.name}`)
      
      if (!dryRun) {
        // Execute migration in transaction
        const client = await this.db.getClient()
        try {
          await client.query('BEGIN')
          
          // Execute migration SQL
          await client.query(migration.upSql)
          
          // Record migration
          await client.query(
            'INSERT INTO dbuddy_migrations (version, name, checksum) VALUES ($1, $2, $3)',
            [migration.version, migration.name, checksum]
          )
          
          await client.query('COMMIT')
          console.log(`   ✅ Applied ${migration.version}_${migration.name}`)
        } catch (error) {
          await client.query('ROLLBACK')
          console.error(`   ❌ Failed to apply ${migration.version}_${migration.name}:`, error)
          throw error
        } finally {
          client.release()
        }
      }
    }

    console.log(`✅ Migration complete!`)
  }

  /**
   * Run migrations down to target version
   */
  async migrateDown(options: MigrationOptions = {}): Promise<void> {
    const { target, dryRun = false } = options
    const fileMigrations = this.loadMigrationFiles()
    const appliedMigrations = await this.getAppliedMigrations()
    
    // Create lookup for file migrations
    const fileMigrationMap = new Map(fileMigrations.map(m => [m.version, m]))

    // Filter migrations to rollback
    const migrationsToRollback = appliedMigrations
      .filter(m => !target || m.version > target)
      .sort((a, b) => b.version.localeCompare(a.version)) // Reverse order for rollback

    if (migrationsToRollback.length === 0) {
      console.log('✅ No migrations to rollback')
      return
    }

    console.log(`🔄 Rolling back ${migrationsToRollback.length} migration(s)${dryRun ? ' (DRY RUN)' : ''}`)

    for (const appliedMigration of migrationsToRollback) {
      const fileMigration = fileMigrationMap.get(appliedMigration.version)
      
      if (!fileMigration) {
        console.warn(`⚠️ Migration file not found for ${appliedMigration.version}_${appliedMigration.name}`)
        continue
      }

      console.log(`   📦 ${appliedMigration.version}_${appliedMigration.name}`)
      
      if (!dryRun) {
        // Execute rollback in transaction
        const client = await this.db.getClient()
        try {
          await client.query('BEGIN')
          
          // Execute rollback SQL
          await client.query(fileMigration.downSql)
          
          // Remove migration record
          await client.query(
            'DELETE FROM dbuddy_migrations WHERE version = $1',
            [appliedMigration.version]
          )
          
          await client.query('COMMIT')
          console.log(`   ✅ Rolled back ${appliedMigration.version}_${appliedMigration.name}`)
        } catch (error) {
          await client.query('ROLLBACK')
          console.error(`   ❌ Failed to rollback ${appliedMigration.version}_${appliedMigration.name}:`, error)
          throw error
        } finally {
          client.release()
        }
      }
    }

    console.log(`✅ Rollback complete!`)
  }
} 