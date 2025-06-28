#!/usr/bin/env node

import { Database } from './database'
import { SchemaGenerator } from './generator'
import { MigrationRunner } from './migration-runner'
import { getProjectBaseDirectory } from './config'
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
  [key: string]: unknown
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
tsql-generate - TypeScript SQL library CLI

Usage:
  tsql-generate <command> [subcommand] [options]

Commands:
  gen-model                    Generate TypeScript models from database schema
  list-tables                  List all tables in the database
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
  tsql-generate gen-model
  tsql-generate gen-model --output ./types
  tsql-generate gen-model --tables users,posts,comments
  tsql-generate list-tables
  tsql-generate migration init
  tsql-generate migration create add_users_table
  tsql-generate migration up
  tsql-generate migration down --target 20240101120000
  tsql-generate migration status
  tsql-generate --help
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
      console.log('Usage: tsql-generate migration create <name>')
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
      const options: any = {}
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
      const options: any = {}
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
        
      case 'migration':
        await this.runMigrationCommand(args)
        break
        
      case undefined:
        console.log('❌ No command specified. Use --help for usage information.')
        process.exit(1)
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