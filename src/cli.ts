#!/usr/bin/env node

import { Database } from './database'
import { SchemaGenerator } from './generator'
import { MigrationRunner } from './migration-runner'
import { getProjectBaseDirectory, getDatabaseConfig } from './config'
import path from 'path'

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

interface MigrationOptions {
  target?: string
  dryRun?: boolean
}

class CLI {
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

  private async runGenModel(args: CliArgs): Promise<void> {
    try {
      const outputDir = args.outputDir || './generated'
      const tables = args.tables && args.tables.length > 0 ? args.tables : undefined
      
      console.log('🎯 Starting model generation...')
      
      const generator = new SchemaGenerator()
      const options = tables ? { tables } : undefined
      await generator.generate(outputDir, options)
      
    } catch (error) {
      console.error('❌ Error generating models:', error)
      process.exit(1)
    }
  }

  private async runListTables(): Promise<void> {
    const db = new Database()
    
    try {
      console.log('📋 Fetching tables from database...')
      
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
      
      const result = await db.query<{
        table_name: string;
        table_schema: string;
        table_type: string;
      }>(query)
      
      if (result.rows.length === 0) {
        console.log('📋 No tables found in public schema')
        return
      }
      
      console.log(`\n📋 Found ${result.rows.length} tables in public schema:\n`)
      
      // Display as a nice table
      console.log('┌─' + '─'.repeat(50) + '┐')
      console.log('│ Table Name' + ' '.repeat(41) + '│')
      console.log('├─' + '─'.repeat(50) + '┤')
      
      result.rows.forEach(row => {
        const name = row.table_name
        const padding = ' '.repeat(Math.max(0, 50 - name.length))
        console.log(`│ ${name}${padding}│`)
      })
      
      console.log('└─' + '─'.repeat(50) + '┘')
      console.log(`\nTotal: ${result.rows.length} tables`)
      
    } catch (error) {
      console.error('❌ Error listing tables:', error)
      process.exit(1)
    } finally {
      await db.close()
    }
  }

  private getMigrationRunner(args: CliArgs): MigrationRunner {
    const db = new Database()
    const migrationsDir = args.migrationsDir || path.resolve(getProjectBaseDirectory(), 'migrations')
    return new MigrationRunner(db, migrationsDir)
  }

  private async runMigrationInit(args: CliArgs): Promise<void> {
    const runner = this.getMigrationRunner(args)
    
    try {
      await runner.initialize()
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

    const runner = this.getMigrationRunner(args)
    
    try {
      await runner.generateMigration(args.name)
    } catch (error) {
      console.error('❌ Error creating migration:', error)
      process.exit(1)
    }
  }

  private async runMigrationUp(args: CliArgs): Promise<void> {
    const runner = this.getMigrationRunner(args)
    
    try {
      const options: MigrationOptions = {}
      if (args.target) options.target = args.target
      if (args.dryRun) options.dryRun = args.dryRun
      
      await runner.migrateUp(options)
    } catch (error) {
      console.error('❌ Error running migrations:', error)
      process.exit(1)
    }
  }

  private async runMigrationDown(args: CliArgs): Promise<void> {
    const runner = this.getMigrationRunner(args)
    
    try {
      const options: MigrationOptions = {}
      if (args.target) options.target = args.target
      if (args.dryRun) options.dryRun = args.dryRun
      
      await runner.migrateDown(options)
    } catch (error) {
      console.error('❌ Error rolling back migrations:', error)
      process.exit(1)
    }
  }

  private async runMigrationStatus(args: CliArgs): Promise<void> {
    const runner = this.getMigrationRunner(args)
    
    try {
      const status = await runner.getStatus()
      
      if (status.length === 0) {
        console.log('📋 No migrations found')
        return
      }
      
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
        const status = migration.status === 'applied' ? '✅ applied' : '⏳ pending'
        const appliedAt = migration.appliedAt 
          ? migration.appliedAt.toISOString().slice(0, 19).replace('T', ' ')
          : ' '.repeat(19)
        
        console.log(`│ ${version} │ ${name} │ ${status} │ ${appliedAt} │`)
      })
      
      console.log('└─' + '─'.repeat(maxVersionLength) + '─┴─' + '─'.repeat(maxNameLength) + '─┴─' + '─'.repeat(9) + '─┴─' + '─'.repeat(19) + '─┘')
      
      const appliedCount = status.filter(s => s.status === 'applied').length
      const pendingCount = status.filter(s => s.status === 'pending').length
      
      console.log(`\nTotal: ${status.length} migrations (${appliedCount} applied, ${pendingCount} pending)`)
      
    } catch (error) {
      console.error('❌ Error fetching migration status:', error)
      process.exit(1)
    }
  }

  private async runShowConfig(): Promise<void> {
    try {
      console.log('🔧 Database Connection Configuration\n')
      
      const config = getDatabaseConfig()
      
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
      
      // Show which env vars are currently set
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
      
      const setVars = envVars.filter(env => env.value !== undefined)
      
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
      
    } catch (error) {
      console.error('❌ Error showing configuration:', error)
      process.exit(1)
    }
  }

  private async runSql(args: CliArgs): Promise<void> {
    const db = new Database()
    
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
      
      const startTime = Date.now()
      const result = await db.query<Record<string, unknown>>(query)
      const endTime = Date.now()
      const executionTime = endTime - startTime
      
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
        result.rows.forEach((row, index) => {
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
      
      console.log(`⏱️  Execution time: ${executionTime}ms`)
      
    } catch (error) {
      console.error('❌ Error executing SQL:', error)
      process.exit(1)
    } finally {
      await db.close()
    }
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
  cli.run(process.argv).catch(error => {
    console.error('❌ CLI Error:', error)
    process.exit(1)
  })
} 