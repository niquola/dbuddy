import path from 'path'
import fs from 'fs'
import { createServer } from 'net'
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

  // Init command functionality
  async initializeProject(): Promise<void> {
    console.log('🚀 Initializing dbuddy project setup...')
    
    const availablePort = await this.findAvailablePort()
    const projectName = path.basename(this.baseDir)
    
    console.log(`✅ Found available port: ${availablePort}`)
    console.log(`✅ Project name: ${projectName}`)
    
    await this.createEnvFile(availablePort, projectName)
    console.log('✅ Created .env file with PostgreSQL credentials')
    
    await this.createOrUpdateMcpConfig()
    console.log('✅ Created/updated .cursor/mcp.json configuration')
    
    await this.createDockerCompose(availablePort, projectName)
    console.log('✅ Created docker-compose.yml with PostgreSQL setup')
    
    console.log(`\n🎉 Project initialized successfully!`)
    console.log(`📝 Next steps:`)
    console.log(`   1. Run: docker-compose up -d`)
    console.log(`   2. Run: dbuddy migration init`)
    console.log(`   3. Start building your application!`)
  }

  private async findAvailablePort(startPort: number = 10001): Promise<number> {
    for (let port = startPort; port <= 65535; port++) {
      if (await this.isPortAvailable(port)) {
        return port
      }
    }
    throw new Error('No available ports found')
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer()
      server.listen(port, () => {
        server.once('close', () => {
          resolve(true)
        })
        server.close()
      })
      server.on('error', () => {
        resolve(false)
      })
    })
  }

  private async createEnvFile(port: number, projectName: string): Promise<void> {
    const envPath = path.join(this.baseDir, '.env')

    if (fs.existsSync(envPath)) {
      console.log('📋 .env file already exists, skipping creation')
      return
    }

    const envContent = `
PGHOST=localhost
PGPORT=${port}
PGDATABASE=${projectName}_dev
PGUSER=postgres
PGPASSWORD=postgres
`

    await fs.promises.writeFile(envPath, envContent)
  }

  private async createOrUpdateMcpConfig(): Promise<void> {
    const cursorDir = path.join(this.baseDir, '.cursor')
    const mcpConfigPath = path.join(cursorDir, 'mcp.json')

    // Ensure .cursor directory exists
    if (!fs.existsSync(cursorDir)) {
      await fs.promises.mkdir(cursorDir, { recursive: true })
    }

    const dbuddyConfig = {
      "command": "node",
      "args": [ "./node_modules/.bin/dbuddy-mcp" ]
    }

    if (fs.existsSync(mcpConfigPath)) {
      // Update existing file
      try {
        const existingContent = await fs.promises.readFile(mcpConfigPath, 'utf8')
        const config = JSON.parse(existingContent)
        
        if (!config.mcpServers) {
          config.mcpServers = {}
        }
        
        config.mcpServers.dbuddy = dbuddyConfig
        
        await fs.promises.writeFile(mcpConfigPath, JSON.stringify(config, null, 2))
      } catch (error) {
        console.warn('⚠️  Could not parse existing mcp.json, creating new one')
        await this.createNewMcpConfig(mcpConfigPath, dbuddyConfig)
      }
    } else {
      // Create new file
      await this.createNewMcpConfig(mcpConfigPath, dbuddyConfig)
    }
  }

  private async createNewMcpConfig(filePath: string, dbuddyConfig: any): Promise<void> {
    const config = {
      mcpServers: {
        dbuddy: dbuddyConfig
      }
    }
    
    await fs.promises.writeFile(filePath, JSON.stringify(config, null, 2))
  }

  private async createDockerCompose(port: number, projectName: string): Promise<void> {
    const dockerComposePath = path.join(this.baseDir, 'docker-compose.yml')
    
    if (fs.existsSync(dockerComposePath)) {
      console.log('📋 docker-compose.yml already exists, skipping creation')
      return
    }

    const dockerComposeContent = `version: '3.8'

services:
  postgres:
    image: postgres:16
    container_name: ${projectName}-postgres
    environment:
      POSTGRES_USER: \${PGUSER}
      POSTGRES_PASSWORD: \${PGPASSWORD}
      POSTGRES_DB: \${PGDATABASE}
    ports:
      - "${port}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
`

    await fs.promises.writeFile(dockerComposePath, dockerComposeContent)
  }
} 