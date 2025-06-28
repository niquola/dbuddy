import path from 'path'
import { Database } from './database'
import { SchemaGenerator } from './generator'
import { MigrationRunner } from './migration-runner'
import { getDatabaseConfig, getProjectBaseDirectory } from './config'
import { type MigrationOptions } from './types'

// Types for service results
export interface TableInfo {
  table_name: string
  table_schema: string
  table_type: string
}

export interface SqlResult {
  rows: Record<string, unknown>[]
  rowCount?: number
  executionTime: number
}

export interface MigrationStatus {
  version: string
  name: string
  status: 'applied' | 'pending'
  appliedAt?: Date
}

export interface DatabaseConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface EnvironmentVariable {
  name: string
  value?: string
  isSet: boolean
}

export interface ConfigInfo {
  config: DatabaseConfig
  envVars: EnvironmentVariable[]
}

export class DbBuddyService {
  private baseDir: string
  private db: Database
  
  constructor(db: Database, baseDir?: string) {
    this.db = db
    this.baseDir = baseDir || getProjectBaseDirectory()
  }

  // Helper function to resolve migrations directory
  private resolveMigrationsDir(migrationsDir?: string): string {
    let dir: string
    if (migrationsDir) {
      if (path.isAbsolute(migrationsDir)) {
        dir = migrationsDir
      } else {
        dir = path.resolve(this.baseDir, migrationsDir)
      }
    } else {
      dir = path.resolve(this.baseDir, 'migrations')
    }
    return dir
  }

  // Helper function to get environment variables
  private getEnvironmentVariables(): EnvironmentVariable[] {
    const envVars = [
      { name: 'PGHOST', value: process.env.PGHOST },
      { name: 'PGPORT', value: process.env.PGPORT },
      { name: 'PGDATABASE', value: process.env.PGDATABASE },
      { name: 'PGUSER', value: process.env.PGUSER },
      { name: 'PGPASSWORD', value: process.env.PGPASSWORD },
      { name: 'DATABASE_HOST', value: process.env.DATABASE_HOST },
      { name: 'DATABASE_PORT', value: process.env.DATABASE_PORT },
      { name: 'DATABASE_NAME', value: process.env.DATABASE_NAME },
      { name: 'DATABASE_USER', value: process.env.DATABASE_USER },
      { name: 'DATABASE_PASSWORD', value: process.env.DATABASE_PASSWORD },
      { name: 'DATABASE_URL', value: process.env.DATABASE_URL }
    ]

    return envVars.map(env => ({
      name: env.name,
      ...(env.value !== undefined && { value: env.value }),
      isSet: env.value !== undefined
    }))
  }

  // Database operations
  async listTables(): Promise<TableInfo[]> {
    const query = `
      SELECT 
        table_name,
        table_schema,
        table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
    
    const result = await this.db.query<TableInfo>(query)
    return result.rows
  }

  async executeSQL(query: string): Promise<SqlResult> {
    const startTime = Date.now()
    const result = await this.db.query<Record<string, unknown>>(query)
    const endTime = Date.now()
    const executionTime = endTime - startTime

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      executionTime
    }
  }

  // Model generation
  async generateModels(outputDir?: string, tables?: string[]): Promise<void> {
    const generator = new SchemaGenerator()
    const dir = outputDir || './generated'
    const options = tables ? { tables } : undefined
    
    await generator.generate(dir, options)
  }

  // Migration operations
  async initializeMigrations(migrationsDir?: string): Promise<void> {
    const dir = this.resolveMigrationsDir(migrationsDir)
    const runner = new MigrationRunner(this.db, dir)
    
    await runner.initialize()
  }

  async createMigration(name: string, migrationsDir?: string): Promise<void> {
    const dir = this.resolveMigrationsDir(migrationsDir)
    const runner = new MigrationRunner(this.db, dir)
    
    await runner.generateMigration(name)
  }

  async migrateUp(options: {
    target?: string
    dryRun?: boolean
    migrationsDir?: string
  } = {}): Promise<void> {
    const dir = this.resolveMigrationsDir(options.migrationsDir)
    const runner = new MigrationRunner(this.db, dir)
    
    const migrationOptions: MigrationOptions = {}
    if (options.target) migrationOptions.target = options.target
    if (options.dryRun) migrationOptions.dryRun = options.dryRun
    
    await runner.migrateUp(migrationOptions)
  }

  async migrateDown(options: {
    target?: string
    dryRun?: boolean
    migrationsDir?: string
  } = {}): Promise<void> {
    const dir = this.resolveMigrationsDir(options.migrationsDir)
    const runner = new MigrationRunner(this.db, dir)
    
    const migrationOptions: MigrationOptions = {}
    if (options.target) migrationOptions.target = options.target
    if (options.dryRun) migrationOptions.dryRun = options.dryRun
    
    await runner.migrateDown(migrationOptions)
  }

  async getMigrationStatus(migrationsDir?: string): Promise<MigrationStatus[]> {
    const dir = this.resolveMigrationsDir(migrationsDir)
    const runner = new MigrationRunner(this.db, dir)
    
    return await runner.getStatus()
  }

  // Configuration
  getConfig(): ConfigInfo {
    const config = getDatabaseConfig()
    const envVars = this.getEnvironmentVariables()
    
    return {
      config,
      envVars
    }
  }

  // Cleanup method
  async close(): Promise<void> {
    await this.db.close()
  }
} 