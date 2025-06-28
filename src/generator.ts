import { Database } from './database'
import { DatabaseConfig } from './types'
import { resolveOutputDirectory } from './config'
import * as fs from 'fs/promises'
import * as path from 'path'

interface TableInfo {
  tableName: string
  columns: ColumnInfo[]
}

interface ColumnInfo {
  columnName: string
  dataType: string
  isNullable: boolean
  columnDefault: string | null
  maxLength: number | null
  numericPrecision: number | null
  numericScale: number | null
}

interface FieldInfo {
  propertyName: string
  columnName: string
  fieldType: 'text' | 'timestamp' | 'number' | 'boolean' | 'json'
  tsType: string
}

export class SchemaGenerator {
  private db: Database

  constructor(config?: DatabaseConfig) {
    this.db = config ? new Database(config) : new Database()
  }

  /**
   * Get all tables from the public schema, optionally filtered by table names
   */
  private async getTables(filterTables?: string[]): Promise<string[]> {
    let query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `
    
    const params: string[] = []
    
    if (filterTables && filterTables.length > 0) {
      const placeholders = filterTables.map((_, index) => `$${index + 1}`).join(', ')
      query += ` AND table_name IN (${placeholders})`
      params.push(...filterTables)
    }
    
    query += ` ORDER BY table_name;`
    
    const result = await this.db.query<{ table_name: string }>(query, params)
    return result.rows.map(row => row.table_name)
  }

  /**
   * Get column information for a specific table
   */
  private async getTableColumns(tableName: string): Promise<ColumnInfo[]> {
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length as max_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = $1
      ORDER BY ordinal_position;
    `
    
    const result = await this.db.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      max_length: number | null;
      numeric_precision: number | null;
      numeric_scale: number | null;
    }>(query, [tableName])
    return result.rows.map(row => ({
      columnName: row.column_name,
      dataType: row.data_type,
      isNullable: row.is_nullable === 'YES',
      columnDefault: row.column_default,
      maxLength: row.max_length,
      numericPrecision: row.numeric_precision,
      numericScale: row.numeric_scale
    }))
  }

  /**
   * Map PostgreSQL data types to TypeScript types
   */
  private mapPostgresToTypeScript(column: ColumnInfo): string {
    const { dataType, isNullable } = column
    
    let tsType: string

    switch (dataType.toLowerCase()) {
      case 'bigint':
      case 'bigserial':
      case 'integer':
      case 'serial':
      case 'smallint':
      case 'smallserial':
      case 'numeric':
      case 'decimal':
      case 'real':
      case 'double precision':
        tsType = 'number'
        break
      
      case 'boolean':
        tsType = 'boolean'
        break
      
      case 'date':
      case 'timestamp':
      case 'timestamp without time zone':
      case 'timestamp with time zone':
      case 'timestamptz':
        tsType = 'Date'
        break
      
      case 'json':
      case 'jsonb':
        tsType = 'Record<string, unknown>'
        break
      
      case 'uuid':
      case 'char':
      case 'character':
      case 'character varying':
      case 'varchar':
      case 'text':
      case 'citext':
      default:
        tsType = 'string'
        break
    }

    return isNullable ? `${tsType} | null` : tsType
  }

  /**
   * Map PostgreSQL data types to field query types
   */
  private mapPostgresToFieldType(dataType: string): 'text' | 'timestamp' | 'number' | 'boolean' | 'json' {
    switch (dataType.toLowerCase()) {
      case 'date':
      case 'timestamp':
      case 'timestamp without time zone':
      case 'timestamp with time zone':
      case 'timestamptz':
        return 'timestamp'
      
      case 'json':
      case 'jsonb':
        return 'json'
      
      case 'bigint':
      case 'bigserial':
      case 'integer':
      case 'serial':
      case 'smallint':
      case 'smallserial':
      case 'numeric':
      case 'decimal':
      case 'real':
      case 'double precision':
        return 'number'
      
      case 'boolean':
        return 'boolean'
      
      case 'uuid':
      case 'char':
      case 'character':
      case 'character varying':
      case 'varchar':
      case 'text':
      case 'citext':
      default:
        return 'text'
    }
  }

  /**
   * Generate field information for query builder
   */
  private generateFieldInfo(tableInfo: TableInfo): FieldInfo[] {
    return tableInfo.columns.map(column => ({
      propertyName: this.toCamelCase(column.columnName),
      columnName: column.columnName,
      fieldType: this.mapPostgresToFieldType(column.dataType),
      tsType: this.mapPostgresToTypeScript(column)
    }))
  }

  /**
   * Generate TypeScript interface for a table
   */
  private generateInterface(tableInfo: TableInfo): string {
    const interfaceName = this.toPascalCase(tableInfo.tableName)
    
    const properties = tableInfo.columns.map(column => {
      const propName = this.toCamelCase(column.columnName)
      const propType = this.mapPostgresToTypeScript(column)
      return `  ${propName}: ${propType}`
    }).join('\n')

    return `export interface ${interfaceName} {
${properties}
}`
  }

  /**
   * Generate custom query builder class with typed field accessors
   */
  private generateCustomQueryBuilder(tableName: string, fields: FieldInfo[]): string {
    const interfaceName = this.toPascalCase(tableName)
    const builderClassName = `${interfaceName}QueryBuilder`
    
    // Generate field accessor methods
    const fieldAccessors = fields.map(field => {
      const returnType = this.getFieldQueryType(field.fieldType, builderClassName)
      return `  get ${field.propertyName}(): ${returnType} {
    return this.${field.fieldType}Field('${field.columnName}')
  }`
    }).join('\n\n')

    return `export class ${builderClassName} extends QueryBuilder<${interfaceName}> {
${fieldAccessors}
}`
  }

  /**
   * Get the appropriate field query type for a field
   */
  private getFieldQueryType(fieldType: string, builderClassName: string): string {
    switch (fieldType) {
      case 'text':
        return `TextFieldQuery<${builderClassName}>`
      case 'timestamp':
        return `TimestampFieldQuery<${builderClassName}>`
      case 'number':
        return `NumberFieldQuery<${builderClassName}>`
      case 'boolean':
        return `BooleanFieldQuery<${builderClassName}>`
      case 'json':
        return `JsonFieldQuery<${builderClassName}>`
      default:
        return `TextFieldQuery<${builderClassName}>`
    }
  }

  /**
   * Generate query builder factory function
   */
  private generateQueryBuilderFactory(tableName: string): string {
    const interfaceName = this.toPascalCase(tableName)
    const builderClassName = `${interfaceName}QueryBuilder`
    const factoryName = `${this.toCamelCase(tableName)}Query`
    
    return `export function ${factoryName}(db: Database): ${builderClassName} {
  const initialState: QueryState = {
    table: '${tableName}',
    conditions: []
  }
  return new ${builderClassName}(db, initialState)
}`
  }

  /**
   * Generate the complete type file content for a table
   */
  private generateTypeFile(tableInfo: TableInfo): string {
    const fields = this.generateFieldInfo(tableInfo)
    const interfaceCode = this.generateInterface(tableInfo)
    const queryBuilderCode = this.generateCustomQueryBuilder(tableInfo.tableName, fields)
    const factoryCode = this.generateQueryBuilderFactory(tableInfo.tableName)
    
    // Determine which field query types are needed
    const fieldTypes = [...new Set(fields.map(f => f.fieldType))]
    const imports = this.generateFieldQueryImports(fieldTypes)
    
    return `import { Database, QueryBuilder, QueryState, ${imports} } from 'dbuddy'

${interfaceCode}

${queryBuilderCode}

${factoryCode}
`
  }

  /**
   * Generate imports for field query types
   */
  private generateFieldQueryImports(fieldTypes: string[]): string {
    const importMap: Record<string, string> = {
      text: 'TextFieldQuery',
      timestamp: 'TimestampFieldQuery', 
      number: 'NumberFieldQuery',
      boolean: 'BooleanFieldQuery',
      json: 'JsonFieldQuery'
    }
    
    return fieldTypes
      .map(type => importMap[type])
      .filter(Boolean)
      .join(',\n  ')
  }

  /**
   * Generate an index file that exports all generated types
   */
  private generateIndexFile(tableNames: string[]): string {
    const exports = tableNames.map(tableName => {
      const interfaceName = this.toPascalCase(tableName)
      const builderClassName = `${interfaceName}QueryBuilder`
      const factoryName = `${this.toCamelCase(tableName)}Query`
      return `export { ${interfaceName}, ${builderClassName}, ${factoryName} } from './${tableName}'`
    }).join('\n')

    return `// Auto-generated type definitions and query builders
// Generated on: ${new Date().toISOString()}

${exports}
`
  }

  /**
   * Convert snake_case to camelCase
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }

  /**
   * Convert snake_case to PascalCase
   */
  private toPascalCase(str: string): string {
    const camelCase = this.toCamelCase(str)
    return camelCase.charAt(0).toUpperCase() + camelCase.slice(1)
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath)
    } catch {
      await fs.mkdir(dirPath, { recursive: true })
    }
  }

  /**
   * Main generation method
   */
  async generate(outputDir: string, options?: { tables?: string[] }): Promise<void> {
    try {
      // Resolve output directory relative to where npx was called
      const resolvedOutputDir = resolveOutputDirectory(outputDir)
      
      const filterTables = options?.tables
      
      if (filterTables && filterTables.length > 0) {
        console.log(`🔍 Scanning database schema for specified tables: ${filterTables.join(', ')}...`)
      } else {
        console.log('🔍 Scanning database schema for all tables...')
      }
      
      // Get tables from public schema (all or filtered)
      const tableNames = await this.getTables(filterTables)
      
      if (tableNames.length === 0) {
        if (filterTables && filterTables.length > 0) {
          console.log(`⚠️  No matching tables found for: ${filterTables.join(', ')}`)
        } else {
          console.log('⚠️  No tables found in public schema')
        }
        return
      }

      // Check if any specified tables were not found
      if (filterTables && filterTables.length > 0) {
        const notFound = filterTables.filter(table => !tableNames.includes(table))
        if (notFound.length > 0) {
          console.log(`⚠️  Tables not found: ${notFound.join(', ')}`)
        }
      }

      console.log(`📋 Processing ${tableNames.length} tables: ${tableNames.join(', ')}`)

      // Ensure output directory exists
      await this.ensureDirectory(resolvedOutputDir)

      // Generate type files for each table
      const tableInfos: TableInfo[] = []
      
      for (const tableName of tableNames) {
        console.log(`📝 Processing table: ${tableName}`)
        
        const columns = await this.getTableColumns(tableName)
        const tableInfo: TableInfo = { tableName, columns }
        tableInfos.push(tableInfo)
        
        const typeFileContent = this.generateTypeFile(tableInfo)
        const outputPath = path.join(resolvedOutputDir, `${tableName}.ts`)
        
        await fs.writeFile(outputPath, typeFileContent, 'utf8')
        console.log(`✅ Generated: ${outputPath}`)
      }

      // Generate index file that exports all generated types
      const indexFileContent = this.generateIndexFile(tableNames)
      const indexPath = path.join(resolvedOutputDir, 'index.ts')
      await fs.writeFile(indexPath, indexFileContent, 'utf8')
      console.log(`✅ Generated: ${indexPath}`)

      console.log(`🎉 Successfully generated types for ${tableNames.length} tables in ${resolvedOutputDir}`)

    } catch (error) {
      console.error('❌ Error generating schema:', error)
      throw error
    } finally {
      await this.db.close()
    }
  }
}

/**
 * CLI function to generate schema types
 */
export async function generateSchema(outputDir: string = './generated', tables?: string[]): Promise<void> {
  const generator = new SchemaGenerator()
  const options = tables ? { tables } : undefined
  await generator.generate(outputDir, options)
}

// Note: CLI execution moved to src/cli.ts 