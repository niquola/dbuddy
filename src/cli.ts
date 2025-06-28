#!/usr/bin/env node

import { Database } from './database'
import { SchemaGenerator } from './generator'

interface CliArgs {
  command?: string
  help?: boolean
  outputDir?: string
  tables?: string[]
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
      } else if (!arg.startsWith('-') && !parsed.command) {
        parsed.command = arg
      }
    }

    return parsed
  }

  private showHelp(): void {
    console.log(`
tsql-generate - TypeScript SQL library CLI

Usage:
  tsql-generate <command> [options]

Commands:
  gen-model      Generate TypeScript models from database schema
  list-tables    List all tables in the database
  help           Show this help message

Options:
  -h, --help           Show help
  -o, --output <dir>   Output directory (default: ./generated)
  -t, --tables <list>  Comma-separated list of specific tables to process

Examples:
  tsql-generate gen-model
  tsql-generate gen-model --output ./types
  tsql-generate gen-model --tables users,posts,comments
  tsql-generate list-tables
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
        
      case undefined:
        console.log('❌ No command specified. Use --help for usage information.')
        process.exit(1)
        break
        
      default:
        console.log(`❌ Unknown command: ${args.command}. Use --help for usage information.`)
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