#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { config } from 'dotenv'
import path from 'path'
import fs from 'fs'
import { Database } from './database'
import { 
  DbBuddyService, 
  type TableInfo, 
  type MigrationStatus,
  type EnvironmentVariable
} from './services'
import { getProjectBaseDirectory } from './config'

// Helper function to load environment configuration
function loadEnvironmentConfig(): void {
  // Function to find .env file starting from the project base directory
  function findEnvFile(): string | undefined {
    const baseDir = getProjectBaseDirectory()
    
    // First try the base directory
    const envPath = path.join(baseDir, '.env')
    if (fs.existsSync(envPath)) {
      return envPath
    }

    // Fallback: search up the directory tree from base directory
    let currentDir = baseDir
    while (currentDir !== path.dirname(currentDir)) {
      const envPath = path.join(currentDir, '.env')
      if (fs.existsSync(envPath)) {
        return envPath
      }
      currentDir = path.dirname(currentDir)
    }

    return undefined
  }

  // Load environment variables from .env file in the directory where MCP server was called
  const envPath = findEnvFile()
  if (envPath) {
    config({ path: envPath })
    console.log(`Loaded environment configuration from: ${envPath}`)
  } else {
    console.error('No .env file found, using system environment variables')
  }
}

// Tool schemas
const ExecuteSqlSchema = z.object({
  query: z.string().describe('SQL query to execute')
})

const GenerateModelsSchema = z.object({
  outputDir: z.string().optional().describe('Output directory for generated models (default: ./generated)'),
  tables: z.array(z.string()).optional().describe('Specific tables to generate models for')
})

const MigrationInitSchema = z.object({
  migrationsDir: z.string().optional().describe('Migrations directory (default: ./migrations)')
})

const MigrationCreateSchema = z.object({
  name: z.string().describe('Name of the migration'),
  migrationsDir: z.string().optional().describe('Migrations directory (default: ./migrations)')
})

const MigrationUpSchema = z.object({
  target: z.string().optional().describe('Target migration version'),
  dryRun: z.boolean().optional().describe('Show what would be done without executing'),
  migrationsDir: z.string().optional().describe('Migrations directory (default: ./migrations)')
})

const MigrationDownSchema = z.object({
  target: z.string().optional().describe('Target migration version'),
  dryRun: z.boolean().optional().describe('Show what would be done without executing'),
  migrationsDir: z.string().optional().describe('Migrations directory (default: ./migrations)')
})

const MigrationStatusSchema = z.object({
  migrationsDir: z.string().optional().describe('Migrations directory (default: ./migrations)')
})

// Define tools
const tools: Tool[] = [
  {
    name: 'list_tables',
    description: 'List all tables in the database',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  },
  {
    name: 'execute_sql',
    description: 'Execute a SQL query against the database',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL query to execute'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'generate_models',
    description: 'Generate TypeScript models from database schema',
    inputSchema: {
      type: 'object',
      properties: {
        outputDir: {
          type: 'string',
          description: 'Output directory for generated models (default: ./generated)'
        },
        tables: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific tables to generate models for'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'migration_init',
    description: 'Initialize the migration system',
    inputSchema: {
      type: 'object',
      properties: {
        migrationsDir: {
          type: 'string',
          description: 'Migrations directory (default: ./migrations)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'migration_create',
    description: 'Create a new migration',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Name of the migration'
        },
        migrationsDir: {
          type: 'string',
          description: 'Migrations directory (default: ./migrations)'
        }
      },
      required: ['name'],
      additionalProperties: false
    }
  },
  {
    name: 'migration_up',
    description: 'Apply pending migrations',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target migration version'
        },
        dryRun: {
          type: 'boolean',
          description: 'Show what would be done without executing'
        },
        migrationsDir: {
          type: 'string',
          description: 'Migrations directory (default: ./migrations)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'migration_down',
    description: 'Rollback migrations',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target migration version'
        },
        dryRun: {
          type: 'boolean',
          description: 'Show what would be done without executing'
        },
        migrationsDir: {
          type: 'string',
          description: 'Migrations directory (default: ./migrations)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'migration_status',
    description: 'Show migration status',
    inputSchema: {
      type: 'object',
      properties: {
        migrationsDir: {
          type: 'string',
          description: 'Migrations directory (default: ./migrations)'
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'show_config',
    description: 'Show database connection configuration',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }
]

class MCPServer {
  private server: Server
  private service: DbBuddyService
  private db: Database

  constructor() {
    this.db = new Database()
    this.service = new DbBuddyService(this.db)
    this.server = new Server(
      {
        name: 'dbuddy',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  async cleanup(): Promise<void> {
    await this.service.close()
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools,
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'list_tables':
            return await this.handleListTables()

          case 'execute_sql':
            return await this.handleExecuteSql(ExecuteSqlSchema.parse(args))

          case 'generate_models':
            return await this.handleGenerateModels(GenerateModelsSchema.parse(args))

          case 'migration_init':
            return await this.handleMigrationInit(MigrationInitSchema.parse(args))

          case 'migration_create':
            return await this.handleMigrationCreate(MigrationCreateSchema.parse(args))

          case 'migration_up':
            return await this.handleMigrationUp(MigrationUpSchema.parse(args))

          case 'migration_down':
            return await this.handleMigrationDown(MigrationDownSchema.parse(args))

          case 'migration_status':
            return await this.handleMigrationStatus(MigrationStatusSchema.parse(args))

          case 'show_config':
            return await this.handleShowConfig()

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`
            }
          ],
          isError: true
        }
      }
    })
  }

  private async handleListTables() {
    const tables = await this.service.listTables()
    
    return {
      content: [
        {
          type: 'text',
          text: `Found ${tables.length} tables:\n\n${tables.map((t: TableInfo) => `• ${t.table_name}`).join('\n')}`
        }
      ]
    }
  }

  private async handleExecuteSql(args: z.infer<typeof ExecuteSqlSchema>) {
    const result = await this.service.executeSQL(args.query)

    if (result.rows.length > 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Query executed successfully in ${result.executionTime}ms\nReturned ${result.rows.length} rows:\n\n${JSON.stringify(result.rows, null, 2)}`
          }
        ]
      }
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `Query executed successfully in ${result.executionTime}ms\nRows affected: ${result.rowCount || 0}`
          }
        ]
      }
    }
  }

  private async handleGenerateModels(args: z.infer<typeof GenerateModelsSchema>) {
    const outputDir = args.outputDir || './generated'
    
    await this.service.generateModels(outputDir, args.tables)

    return {
      content: [
        {
          type: 'text',
          text: `TypeScript models generated successfully in ${outputDir}${args.tables ? ` for tables: ${args.tables.join(', ')}` : ''}`
        }
      ]
    }
  }

  private async handleMigrationInit(args: z.infer<typeof MigrationInitSchema>) {
    await this.service.initializeMigrations(args.migrationsDir)

    return {
      content: [
        {
          type: 'text',
          text: 'Migration system initialized successfully'
        }
      ]
    }
  }

  private async handleMigrationCreate(args: z.infer<typeof MigrationCreateSchema>) {
    await this.service.createMigration(args.name, args.migrationsDir)

    return {
      content: [
        {
          type: 'text',
          text: `Migration '${args.name}' created successfully`
        }
      ]
    }
  }

  private async handleMigrationUp(args: z.infer<typeof MigrationUpSchema>) {
    const options: { target?: string; dryRun?: boolean; migrationsDir?: string } = {}
    if (args.target) options.target = args.target
    if (args.dryRun) options.dryRun = args.dryRun
    if (args.migrationsDir) options.migrationsDir = args.migrationsDir
    
    await this.service.migrateUp(options)

    const message = args.dryRun 
      ? 'Migration up dry run completed' 
      : 'Migrations applied successfully'

    return {
      content: [
        {
          type: 'text',
          text: message
        }
      ]
    }
  }

  private async handleMigrationDown(args: z.infer<typeof MigrationDownSchema>) {
    const options: { target?: string; dryRun?: boolean; migrationsDir?: string } = {}
    if (args.target) options.target = args.target
    if (args.dryRun) options.dryRun = args.dryRun
    if (args.migrationsDir) options.migrationsDir = args.migrationsDir
    
    await this.service.migrateDown(options)

    const message = args.dryRun 
      ? 'Migration down dry run completed' 
      : 'Migrations rolled back successfully'

    return {
      content: [
        {
          type: 'text',
          text: message
        }
      ]
    }
  }

  private async handleMigrationStatus(args: z.infer<typeof MigrationStatusSchema>) {
    const status = await this.service.getMigrationStatus(args.migrationsDir)

    if (status.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: 'No migrations found'
          }
        ]
      }
    }

    const appliedCount = status.filter((s: MigrationStatus) => s.status === 'applied').length
    const pendingCount = status.filter((s: MigrationStatus) => s.status === 'pending').length

    const statusText = status.map((migration: MigrationStatus) => {
      const statusIcon = migration.status === 'applied' ? '✅' : '⏳'
      const appliedAt = migration.appliedAt 
        ? migration.appliedAt.toISOString().slice(0, 19).replace('T', ' ')
        : 'Not applied'
      
      return `${statusIcon} ${migration.version} - ${migration.name} (${appliedAt})`
    }).join('\n')

    return {
      content: [
        {
          type: 'text',
          text: `Migration Status:\n\n${statusText}\n\nTotal: ${status.length} migrations (${appliedCount} applied, ${pendingCount} pending)`
        }
      ]
    }
  }

  private async handleShowConfig() {
    const configInfo = this.service.getConfig()
    const { config, envVars } = configInfo
    const projectDir = getProjectBaseDirectory()

    const configText = `Project Configuration:
Project Directory: ${projectDir}

Database Configuration:
Host: ${config.host}
Port: ${config.port}
Database: ${config.database}
User: ${config.user}
Password: ${config.password ? '●'.repeat(Math.min(config.password.length, 8)) : '(not set)'}

Environment Variables:
${envVars.map((env: EnvironmentVariable) => {
  const value = env.name.includes('PASSWORD') || env.name.includes('URL')
    ? (env.value ? '●'.repeat(Math.min(env.value.length, 8)) : '(not set)')
    : (env.value || '(not set)')
  return `• ${env.name}=${value} [${env.isSet ? 'set' : 'not set'}]`
}).join('\n')}

All process.env Variables:
${Object.entries(process.env).map(([key, value]) => {
  const maskedValue = key.includes('PASSWORD') || key.includes('URL') || key.includes('SECRET') || key.includes('KEY')
    ? (value ? '●'.repeat(Math.min(value.length, 8)) : '(not set)')
    : (value || '(not set)')
  return `• ${key}=${maskedValue}`
}).join('\n')}`

    return {
      content: [
        {
          type: 'text',
          text: configText
        }
      ]
    }
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
  }
}

async function main() {
  // Load environment configuration first (same as CLI)
  loadEnvironmentConfig()
  
  const server = new MCPServer()
  await server.start()
}

// Export for testing
export { MCPServer }

// If run directly (CommonJS compatible check)
if (require.main === module) {
  main().catch(error => {
    console.error('❌ MCP Server Error:', error)
    process.exit(1)
  })
} 