#!/usr/bin/env node

import { Database } from './database'
import { DbBuddyService, type TableInfo, type SqlResult, type MigrationStatus, type ConfigInfo } from './services'

interface CliArgs {
  command?: string
  subcommand?: string
  help?: boolean
  outputDir?: string
  tables?: string[]
  target?: string
  dryRun?: boolean
  migrationsDir?: string
  name?: string
  query?: string
  [key: string]: unknown
}

class CLI {
  private service: DbBuddyService
  private db: Database

  constructor() {
    this.db = new Database()
    this.service = new DbBuddyService(this.db)
  }

  async cleanup(): Promise<void> {
    await this.service.close()
  }

  private parseArgs(args: string[]): CliArgs {
    const parsed: CliArgs = {
      tables: []
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i]
      
      if (arg === '--help' || arg === '-h') {
        parsed.help = true
      } else if (arg === '--output' || arg === '-o') {
        parsed.outputDir = args[++i]
      } else if (arg === '--tables' || arg === '-t') {
        // Parse comma-separated tables or collect until next flag
        i++
        while (i < args.length && !args[i].startsWith('-')) {
          const tableArg = args[i]
          if (tableArg.includes(',')) {
            parsed.tables!.push(...tableArg.split(',').map(t => t.trim()))
          } else {
            parsed.tables!.push(tableArg)
          }
          i++
        }
        i-- // Back up one since the for loop will increment
      } else if (arg === '--target') {
        parsed.target = args[++i]
      } else if (arg === '--dry-run') {
        parsed.dryRun = true
      } else if (arg === '--migrations-dir') {
        parsed.migrationsDir = args[++i]
      } else if (!arg.startsWith('-') && !parsed.command) {
        parsed.command = arg
      } else if (!arg.startsWith('-') && !parsed.query && parsed.command === 'sql') {
        // Handle SQL queries BEFORE subcommands
        parsed.query = arg
      } else if (!arg.startsWith('-') && !parsed.subcommand && parsed.command) {
        parsed.subcommand = arg
      } else if (!arg.startsWith('-') && !parsed.name && parsed.command === 'migration' && parsed.subcommand === 'create') {
        parsed.name = arg
      }
    }

    return parsed
  }

  private showHelp(): void {
    console.log(`
dbuddy - TypeScript SQL library CLI

Usage:
  dbuddy <command> [subcommand] [options]

Commands:
  init                         Initialize project with .env, docker-compose.yml, and .cursor/mcp.json
  gen-model                    Generate TypeScript models from database schema
  list-tables                  List all tables in the database
  show-config                  Show database connection configuration
  sql <query>                  Execute SQL query
  migration <subcommand>       Migration management commands
  help                         Show this help message

Migration Subcommands:
  migration init               Initialize migration system
  migration create <name>      Create new migration files
  migration up [target]        Apply pending migrations up to target
  migration down [target]      Rollback migrations down to target  
  migration status             Show migration status

Options:
  -h, --help                   Show help
  -o, --output <dir>           Output directory (default: ./generated)
  -t, --tables <list>          Comma-separated list of specific tables to process
  --target <version>           Target migration version
  --dry-run                    Show what would be done without executing
  --migrations-dir <dir>       Migrations directory (default: ./migrations)

Examples:
  dbuddy init
  dbuddy gen-model
  dbuddy gen-model --output ./types
  dbuddy gen-model --tables users,posts,comments
  dbuddy list-tables
  dbuddy show-config
  dbuddy sql "SELECT * FROM users LIMIT 10"
  dbuddy migration init
  dbuddy migration create add_users_table
  dbuddy migration up
  dbuddy migration down --target 20240101120000
  dbuddy migration status
  dbuddy --help
`)
  }

  private async runInit(): Promise<void> {
    try {
      await this.service.initializeProject()
    } catch (error) {
      console.error('❌ Error initializing project:', error)
      process.exit(1)
    }
  }

  private async runGenModel(args: CliArgs): Promise<void> {
    try {
      const tables = args.tables && args.tables.length > 0 ? args.tables : undefined
      
      console.log('🎯 Starting model generation...')
      
      const result = await this.service.generateModels(args.outputDir, tables)
      
      console.log(`✅ Models generated successfully in ${result.outputDir}`)
      if (result.tables) {
        console.log(`📋 Tables processed: ${result.tables.join(', ')}`)
      }
      
    } catch (error) {
      console.error('❌ Error generating models:', error)
      process.exit(1)
    }
  }

  private async runListTables(): Promise<void> {
    try {
      console.log('📋 Fetching tables from database...')
      
      const tables = await this.service.listTables()
      
      if (tables.length === 0) {
        console.log('📋 No tables found in public schema')
        return
      }
      
      this.printTablesTable(tables)
      
    } catch (error) {
      console.error('❌ Error listing tables:', error)
      process.exit(1)
    }
  }

  private printTablesTable(tables: TableInfo[]): void {
    console.log(`\n📋 Found ${tables.length} tables in public schema:\n`)
    
    // Display as a nice table
    console.log('┌─' + '─'.repeat(50) + '┐')
    console.log('│ Table Name' + ' '.repeat(41) + '│')
    console.log('├─' + '─'.repeat(50) + '┤')
    
    tables.forEach(table => {
      const name = table.table_name
      const padding = ' '.repeat(Math.max(0, 50 - name.length))
      console.log(`│ ${name}${padding}│`)
    })
    
    console.log('└─' + '─'.repeat(50) + '┘')
    console.log(`\nTotal: ${tables.length} tables`)
  }

  private async runMigrationInit(args: CliArgs): Promise<void> {
    try {
      await this.service.initializeMigrations(args.migrationsDir)
      console.log('✅ Migration system initialized successfully')
    } catch (error) {
      console.error('❌ Error initializing migration system:', error)
      process.exit(1)
    }
  }

  private async runMigrationCreate(args: CliArgs): Promise<void> {
    if (!args.name) {
      console.error('❌ Migration name is required')
      console.log('Usage: dbuddy migration create <name>')
      process.exit(1)
    }

    try {
      await this.service.createMigration(args.name!, args.migrationsDir)
      console.log(`✅ Migration '${args.name}' created successfully`)
    } catch (error) {
      console.error('❌ Error creating migration:', error)
      process.exit(1)
    }
  }

  private async runMigrationUp(args: CliArgs): Promise<void> {
    try {
      const options: { target?: string; dryRun?: boolean; migrationsDir?: string } = {}
      if (args.target) options.target = args.target
      if (args.dryRun) options.dryRun = args.dryRun
      if (args.migrationsDir) options.migrationsDir = args.migrationsDir
      
      await this.service.migrateUp(options)
      
      const message = args.dryRun 
        ? '🔍 Migration up dry run completed' 
        : '✅ Migrations applied successfully'
      console.log(message)
    } catch (error) {
      console.error('❌ Error running migrations:', error)
      process.exit(1)
    }
  }

  private async runMigrationDown(args: CliArgs): Promise<void> {
    try {
      const options: { target?: string; dryRun?: boolean; migrationsDir?: string } = {}
      if (args.target) options.target = args.target
      if (args.dryRun) options.dryRun = args.dryRun
      if (args.migrationsDir) options.migrationsDir = args.migrationsDir
      
      await this.service.migrateDown(options)
      
      const message = args.dryRun 
        ? '🔍 Migration down dry run completed' 
        : '✅ Migrations rolled back successfully'
      console.log(message)
    } catch (error) {
      console.error('❌ Error rolling back migrations:', error)
      process.exit(1)
    }
  }

  private async runMigrationStatus(args: CliArgs): Promise<void> {
    try {
      const status = await this.service.getMigrationStatus(args.migrationsDir)
      
      if (status.length === 0) {
        console.log('📋 No migrations found')
        return
      }
      
      this.printMigrationStatusTable(status)
      
    } catch (error) {
      console.error('❌ Error fetching migration status:', error)
      process.exit(1)
    }
  }

  private printMigrationStatusTable(status: MigrationStatus[]): void {
    console.log(`\n📋 Migration Status:\n`)
    
    // Display as a nice table
    const maxVersionLength = Math.max(7, ...status.map(s => s.version.length))
    const maxNameLength = Math.max(4, ...status.map(s => s.name.length))
    
    console.log('┌─' + '─'.repeat(maxVersionLength) + '─┬─' + '─'.repeat(maxNameLength) + '─┬─' + '─'.repeat(9) + '─┬─' + '─'.repeat(19) + '─┐')
    console.log(`│ Version${' '.repeat(maxVersionLength - 7)} │ Name${' '.repeat(maxNameLength - 4)} │ Status${' '.repeat(3)} │ Applied At${' '.repeat(9)} │`)
    console.log('├─' + '─'.repeat(maxVersionLength) + '─┼─' + '─'.repeat(maxNameLength) + '─┼─' + '─'.repeat(9) + '─┼─' + '─'.repeat(19) + '─┤')
    
    status.forEach(migration => {
      const version = migration.version.padEnd(maxVersionLength)
      const name = migration.name.padEnd(maxNameLength)
      const migrationStatus = migration.status === 'applied' ? '✅ applied' : '⏳ pending'
      const appliedAt = migration.appliedAt 
        ? migration.appliedAt.toISOString().slice(0, 19).replace('T', ' ')
        : ' '.repeat(19)
      
      console.log(`│ ${version} │ ${name} │ ${migrationStatus} │ ${appliedAt} │`)
    })
    
    console.log('└─' + '─'.repeat(maxVersionLength) + '─┴─' + '─'.repeat(maxNameLength) + '─┴─' + '─'.repeat(9) + '─┴─' + '─'.repeat(19) + '─┘')
    
    const appliedCount = status.filter(s => s.status === 'applied').length
    const pendingCount = status.filter(s => s.status === 'pending').length
    
    console.log(`\nTotal: ${status.length} migrations (${appliedCount} applied, ${pendingCount} pending)`)
  }

  private async runShowConfig(): Promise<void> {
    try {
      console.log('🔧 Database Connection Configuration\n')
      
      const configInfo = this.service.getConfig()
      this.printConfigTable(configInfo)
      
    } catch (error) {
      console.error('❌ Error showing configuration:', error)
      process.exit(1)
    }
  }

  private printConfigTable(configInfo: ConfigInfo): void {
    const { config, envVars } = configInfo
    
    // Display configuration in a nice table format
    console.log('┌─' + '─'.repeat(50) + '┐')
    console.log('│ Configuration' + ' '.repeat(36) + '│')
    console.log('├─' + '─'.repeat(15) + '┬─' + '─'.repeat(34) + '┤')
    console.log(`│ Host           │ ${config.host.padEnd(32)} │`)
    console.log(`│ Port           │ ${config.port.toString().padEnd(32)} │`)
    console.log(`│ Database       │ ${config.database.padEnd(32)} │`)
    console.log(`│ User           │ ${config.user.padEnd(32)} │`)
    console.log(`│ Password       │ ${config.password ? '●'.repeat(Math.min(config.password.length, 8)) : '(not set)'.padEnd(32)} │`)
    console.log('└─' + '─'.repeat(15) + '┴─' + '─'.repeat(34) + '┘')
    
    // Show environment variables being used
    console.log('\n📋 Environment Variables:')
    console.log('  • PGHOST or DATABASE_HOST')
    console.log('  • PGPORT or DATABASE_PORT')  
    console.log('  • PGDATABASE or DATABASE_NAME')
    console.log('  • PGUSER or DATABASE_USER')
    console.log('  • PGPASSWORD or DATABASE_PASSWORD')
    console.log('  • DATABASE_URL (alternative to individual variables)')
    
    // Show which environment variables are set
    const setVars = envVars.filter(env => env.isSet)
    
    if (setVars.length > 0) {
      console.log('\n✅ Currently Set Environment Variables:')
      setVars.forEach(env => {
        const value = env.name.includes('PASSWORD') || env.name.includes('URL') 
          ? (env.value ? '●'.repeat(Math.min(env.value.length, 8)) : '') 
          : env.value
        console.log(`  • ${env.name}=${value}`)
      })
    } else {
      console.log('\n⚠️  No environment variables set - using defaults')
    }
  }

  private async runSql(args: CliArgs): Promise<void> {
    try {
      if (!args.query) {
        console.error('❌ No SQL query provided')
        console.log('Usage: dbuddy sql "SELECT * FROM table"')
        process.exit(1)
      }
      
      const query = args.query
      
      console.log('🎯 Executing SQL query...')
      console.log(`📝 Query: ${query.trim()}`)
      console.log()
      
      const result = await this.service.executeSQL(query)
      this.printSqlResult(result)
      
    } catch (error) {
      console.error('❌ Error executing SQL:', error)
      process.exit(1)
    }
  }

  private printSqlResult(result: SqlResult): void {
    // Handle different types of results
    if (result.rows && result.rows.length > 0) {
      // SELECT query with results
      console.log(`📊 Query returned ${result.rows.length} rows:\n`)
      
      // Get column names from first row
      const columns = Object.keys(result.rows[0])
      const maxWidths = columns.map(col => 
        Math.max(col.length, ...result.rows.map(row => 
          String(row[col] ?? '').length
        ))
      )
      
      // Create table header
      const headerSeparator = '┌─' + maxWidths.map(w => '─'.repeat(w + 2)).join('─┬─') + '─┐'
      const rowSeparator = '├─' + maxWidths.map(w => '─'.repeat(w + 2)).join('─┼─') + '─┤'
      const footerSeparator = '└─' + maxWidths.map(w => '─'.repeat(w + 2)).join('─┴─') + '─┘'
      
      console.log(headerSeparator)
      
      // Header row
      const header = '│ ' + columns.map((col, i) => col.padEnd(maxWidths[i])).join(' │ ') + ' │'
      console.log(header)
      console.log(rowSeparator)
      
      // Data rows
      result.rows.forEach((row: Record<string, unknown>, index: number) => {
        const rowStr = '│ ' + columns.map((col, i) => 
          String(row[col] ?? '').padEnd(maxWidths[i])
        ).join(' │ ') + ' │'
        console.log(rowStr)
        
        // Add separator every 20 rows for readability
        if (index > 0 && index % 20 === 19 && index < result.rows.length - 1) {
          console.log(rowSeparator)
        }
      })
      
      console.log(footerSeparator)
      
    } else if (result.rowCount !== undefined) {
      // INSERT/UPDATE/DELETE query
      console.log(`✅ Query executed successfully`)
      console.log(`📊 Rows affected: ${result.rowCount}`)
    } else {
      // Other queries (CREATE TABLE, etc.)
      console.log(`✅ Query executed successfully`)
    }
    
    console.log(`⏱️  Execution time: ${result.executionTime}ms`)
  }

  async run(argv: string[]): Promise<void> {
    const args = this.parseArgs(argv.slice(2))
    
    // Handle help first
    if (args.help || args.command === 'help') {
      this.showHelp()
      return
    }
    
    // Handle commands
    switch (args.command) {
      case 'init':
        await this.runInit()
        break
        
      case 'gen-model':
        await this.runGenModel(args)
        break
        
      case 'list-tables':
        await this.runListTables()
        break
        
      case 'show-config':
        await this.runShowConfig()
        break
        
      case 'sql':
        await this.runSql(args)
        break
        
      case 'migration':
        await this.runMigrationCommand(args)
        break
        
      case undefined:
        this.showHelp()
        break
        
      default:
        console.log(`❌ Unknown command: ${args.command}. Use --help for usage information.`)
        process.exit(1)
    }
  }

  private async runMigrationCommand(args: CliArgs): Promise<void> {
    switch (args.subcommand) {
      case 'init':
        await this.runMigrationInit(args)
        break
        
      case 'create':
        await this.runMigrationCreate(args)
        break
        
      case 'up':
        await this.runMigrationUp(args)
        break
        
      case 'down':
        await this.runMigrationDown(args)
        break
        
      case 'status':
        await this.runMigrationStatus(args)
        break
        
      case undefined:
        console.log('❌ No migration subcommand specified.')
        console.log('Available subcommands: init, create, up, down, status')
        console.log('Use --help for more information.')
        process.exit(1)
        break
        
      default:
        console.log(`❌ Unknown migration subcommand: ${args.subcommand}`)
        console.log('Available subcommands: init, create, up, down, status')
        console.log('Use --help for more information.')
        process.exit(1)
    }
  }
}

// Export for testing
export { CLI }

// If run directly
if (require.main === module) {
  const cli = new CLI()
  cli.run(process.argv)
    .catch(error => {
      console.error('❌ CLI Error:', error)
      process.exit(1)
    })
    .finally(async () => {
      try {
        await cli.cleanup()
      } catch (error) {
        console.error('❌ Cleanup Error:', error)
      }
    })
} 