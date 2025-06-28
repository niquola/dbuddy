import { Database } from './database'
import { 
  BaseQueryBuilder, 
  TextFieldQuery,
  TimestampFieldQuery,
  NumberFieldQuery,
  BooleanFieldQuery,
  JsonFieldQuery,
  DateTruncUnit,
  DatePart,
  QueryState, 
  WhereCondition, 
  QueryResult 
} from './types'

export class QueryBuilder<T> implements BaseQueryBuilder<T, QueryBuilder<T>> {
  private db: Database
  private state: QueryState

  constructor(db: Database, state: QueryState) {
    this.db = db
    this.state = state
  }

  // Create a new QueryBuilder instance with updated state
  private clone(updates: Partial<QueryState>): this {
    const Constructor = this.constructor as new (db: Database, state: QueryState) => this
    return new Constructor(this.db, {
      ...this.state,
      ...updates
    })
  }

  // Create text field query
  textField(fieldName: keyof T | string): TextFieldQuery<this> {
    const field = typeof fieldName === 'string' ? fieldName : String(fieldName)
    return {
      // Standard comparison operators
      eq: (value: string) => this.addCondition(field, '=', value),
      ne: (value: string) => this.addCondition(field, '!=', value),
      in: (values: string[]) => this.addCondition(field, 'IN', values),
      gt: (value: string) => this.addCondition(field, '>', value),
      gte: (value: string) => this.addCondition(field, '>=', value),
      lt: (value: string) => this.addCondition(field, '<', value),
      lte: (value: string) => this.addCondition(field, '<=', value),
      
      // Text-specific operators
      like: (pattern: string) => this.addCondition(field, 'LIKE', pattern),
      ilike: (pattern: string) => this.addCondition(field, 'ILIKE', pattern),
      notLike: (pattern: string) => this.addCondition(field, 'NOT LIKE', pattern),
      notIlike: (pattern: string) => this.addCondition(field, 'NOT ILIKE', pattern),
      similarTo: (pattern: string) => this.addCondition(field, 'SIMILAR TO', pattern),
      notSimilarTo: (pattern: string) => this.addCondition(field, 'NOT SIMILAR TO', pattern),
      regex: (pattern: string) => this.addCondition(field, '~', pattern),
      iregex: (pattern: string) => this.addCondition(field, '~*', pattern),
      notRegex: (pattern: string) => this.addCondition(field, '!~', pattern),
      notIregex: (pattern: string) => this.addCondition(field, '!~*', pattern),
      
      // Convenience methods
      startsWith: (prefix: string) => this.addCondition(field, 'LIKE', `${prefix}%`),
      endsWith: (suffix: string) => this.addCondition(field, 'LIKE', `%${suffix}`),
      contains: (substring: string) => this.addCondition(field, 'LIKE', `%${substring}%`),
      icontains: (substring: string) => this.addCondition(field, 'ILIKE', `%${substring}%`),
      isEmpty: () => this.addCondition(field, '=', ''),
      isNotEmpty: () => this.addCondition(field, '!=', ''),
      
      // Null checks
      isNull: () => this.addCondition(field, 'IS NULL', null),
      isNotNull: () => this.addCondition(field, 'IS NOT NULL', null),
    }
  }

  // Create timestamp field query
  timestampField(fieldName: keyof T | string): TimestampFieldQuery<this> {
    const field = typeof fieldName === 'string' ? fieldName : String(fieldName)
    return {
      // Standard comparison operators
      eq: (value: Date | string) => this.addCondition(field, '=', value),
      ne: (value: Date | string) => this.addCondition(field, '!=', value),
      in: (values: (Date | string)[]) => this.addCondition(field, 'IN', values),
      gt: (value: Date | string) => this.addCondition(field, '>', value),
      gte: (value: Date | string) => this.addCondition(field, '>=', value),
      lt: (value: Date | string) => this.addCondition(field, '<', value),
      lte: (value: Date | string) => this.addCondition(field, '<=', value),
      
      // Timestamp-specific operators
      between: (start: Date | string, end: Date | string) => 
        this.addCondition(field, 'BETWEEN', [start, end]),
      notBetween: (start: Date | string, end: Date | string) => 
        this.addCondition(field, 'NOT BETWEEN', [start, end]),
      
      // Date truncation functions
      dateTruncEq: (unit: DateTruncUnit, value: Date | string) => 
        this.addCondition(`DATE_TRUNC('${unit}', ${field})`, '=', value),
      dateTruncGt: (unit: DateTruncUnit, value: Date | string) => 
        this.addCondition(`DATE_TRUNC('${unit}', ${field})`, '>', value),
      dateTruncGte: (unit: DateTruncUnit, value: Date | string) => 
        this.addCondition(`DATE_TRUNC('${unit}', ${field})`, '>=', value),
      dateTruncLt: (unit: DateTruncUnit, value: Date | string) => 
        this.addCondition(`DATE_TRUNC('${unit}', ${field})`, '<', value),
      dateTruncLte: (unit: DateTruncUnit, value: Date | string) => 
        this.addCondition(`DATE_TRUNC('${unit}', ${field})`, '<=', value),
      
      // Extract functions
      extractEq: (part: DatePart, value: number) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, '=', value),
      extractGt: (part: DatePart, value: number) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, '>', value),
      extractGte: (part: DatePart, value: number) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, '>=', value),
      extractLt: (part: DatePart, value: number) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, '<', value),
      extractLte: (part: DatePart, value: number) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, '<=', value),
      extractIn: (part: DatePart, values: number[]) => 
        this.addCondition(`EXTRACT(${part} FROM ${field})`, 'IN', values),
      
      // Convenience methods for common date operations
      isToday: () => this.addCondition(`DATE(${field})`, '=', 'CURRENT_DATE'),
      isYesterday: () => this.addCondition(`DATE(${field})`, '=', 'CURRENT_DATE - INTERVAL \'1 day\''),
      isTomorrow: () => this.addCondition(`DATE(${field})`, '=', 'CURRENT_DATE + INTERVAL \'1 day\''),
      isThisWeek: () => this.addCondition(`DATE_TRUNC('week', ${field})`, '=', `DATE_TRUNC('week', CURRENT_DATE)`),
      isThisMonth: () => this.addCondition(`DATE_TRUNC('month', ${field})`, '=', `DATE_TRUNC('month', CURRENT_DATE)`),
      isThisYear: () => this.addCondition(`DATE_TRUNC('year', ${field})`, '=', `DATE_TRUNC('year', CURRENT_DATE)`),
      isAfterDays: (days: number) => this.addCondition(field, '>', `CURRENT_DATE + INTERVAL '${days} days'`),
      isBeforeDays: (days: number) => this.addCondition(field, '<', `CURRENT_DATE - INTERVAL '${days} days'`),
      
      // Timezone operations
      atTimeZone: (timezone: string, operator: '=' | '>' | '>=' | '<' | '<=', value: Date | string) => 
        this.addCondition(`${field} AT TIME ZONE '${timezone}'`, operator, value),
      
      // Null checks
      isNull: () => this.addCondition(field, 'IS NULL', null),
      isNotNull: () => this.addCondition(field, 'IS NOT NULL', null),
    }
  }

  // Create number field query
  numberField(fieldName: keyof T | string): NumberFieldQuery<this> {
    const field = typeof fieldName === 'string' ? fieldName : String(fieldName)
    return {
      // Standard comparison operators
      eq: (value: number) => this.addCondition(field, '=', value),
      ne: (value: number) => this.addCondition(field, '!=', value),
      in: (values: number[]) => this.addCondition(field, 'IN', values),
      gt: (value: number) => this.addCondition(field, '>', value),
      gte: (value: number) => this.addCondition(field, '>=', value),
      lt: (value: number) => this.addCondition(field, '<', value),
      lte: (value: number) => this.addCondition(field, '<=', value),
      
      // Range operators
      between: (min: number, max: number) => this.addCondition(field, 'BETWEEN', [min, max]),
      notBetween: (min: number, max: number) => this.addCondition(field, 'NOT BETWEEN', [min, max]),
      
      // Null checks
      isNull: () => this.addCondition(field, 'IS NULL', null),
      isNotNull: () => this.addCondition(field, 'IS NOT NULL', null),
    }
  }

  // Create boolean field query
  booleanField(fieldName: keyof T | string): BooleanFieldQuery<this> {
    const field = typeof fieldName === 'string' ? fieldName : String(fieldName)
    return {
      // Boolean-specific operators
      eq: (value: boolean) => this.addCondition(field, '=', value),
      ne: (value: boolean) => this.addCondition(field, '!=', value),
      isTrue: () => this.addCondition(field, '=', true),
      isFalse: () => this.addCondition(field, '=', false),
      
      // Null checks
      isNull: () => this.addCondition(field, 'IS NULL', null),
      isNotNull: () => this.addCondition(field, 'IS NOT NULL', null),
    }
  }

  // Create JSON field query
  jsonField(fieldName: keyof T | string): JsonFieldQuery<this> {
    const field = typeof fieldName === 'string' ? fieldName : String(fieldName)
    return {
      // JSON-specific operators
      eq: (value: unknown) => this.addCondition(field, '=', JSON.stringify(value)),
      ne: (value: unknown) => this.addCondition(field, '!=', JSON.stringify(value)),
      
      // JSON path operations
      pathExists: (path: string) => this.addCondition(`${field}#>'{${path}}'`, 'IS NOT NULL', null),
      pathNotExists: (path: string) => this.addCondition(`${field}#>'{${path}}'`, 'IS NULL', null),
      pathEq: (path: string, value: unknown) => this.addCondition(`${field}#>>'{${path}}'`, '=', JSON.stringify(value)),
      pathNe: (path: string, value: unknown) => this.addCondition(`${field}#>>'{${path}}'`, '!=', JSON.stringify(value)),
      
      // JSON containment
      contains: (value: unknown) => this.addCondition(field, '@>', JSON.stringify(value)),
      containedBy: (value: unknown) => this.addCondition(field, '<@', JSON.stringify(value)),
      hasKey: (key: string) => this.addCondition(field, '?', key),
      hasAnyKeys: (keys: string[]) => this.addCondition(field, '?|', keys),
      hasAllKeys: (keys: string[]) => this.addCondition(field, '?&', keys),
      
      // Null checks
      isNull: () => this.addCondition(field, 'IS NULL', null),
      isNotNull: () => this.addCondition(field, 'IS NOT NULL', null),
    }
  }

  private addCondition(field: string, operator: string, value: unknown): this {
    const newCondition: WhereCondition = { field, operator, value }
    return this.clone({
      conditions: [...this.state.conditions, newCondition]
    })
  }

  // Query modifiers
  orderBy(field: keyof T, direction: 'ASC' | 'DESC' = 'ASC'): this {
    return this.clone({
      orderBy: { field: String(field), direction }
    })
  }

  limit(count: number): this {
    return this.clone({ limit: count })
  }

  offset(count: number): this {
    return this.clone({ offset: count })
  }

  // Build SQL query
  build(): { sql: string; params: unknown[] } {
    let sql = `SELECT * FROM ${this.state.table}`
    const params: unknown[] = []
    let paramIndex = 1

    // WHERE conditions
    if (this.state.conditions.length > 0) {
      const whereClause = this.state.conditions.map(condition => {
        if (condition.operator === 'IN') {
          const valueArray = condition.value as unknown[]
          const placeholders = valueArray.map(() => `$${paramIndex++}`).join(', ')
          params.push(...valueArray)
          return `${condition.field} IN (${placeholders})`
        } else if (condition.operator === 'BETWEEN' || condition.operator === 'NOT BETWEEN') {
          const valueArray = condition.value as [unknown, unknown]
          params.push(valueArray[0], valueArray[1])
          return `${condition.field} ${condition.operator} $${paramIndex++} AND $${paramIndex++}`
        } else if (condition.operator === 'IS NULL' || condition.operator === 'IS NOT NULL') {
          return `${condition.field} ${condition.operator}`
        } else {
          params.push(condition.value)
          return `${condition.field} ${condition.operator} $${paramIndex++}`
        }
      }).join(' AND ')
      
      sql += ` WHERE ${whereClause}`
    }

    // ORDER BY
    if (this.state.orderBy) {
      sql += ` ORDER BY ${this.state.orderBy.field} ${this.state.orderBy.direction}`
    }

    // LIMIT
    if (this.state.limit) {
      sql += ` LIMIT $${paramIndex++}`
      params.push(this.state.limit)
    }

    // OFFSET
    if (this.state.offset) {
      sql += ` OFFSET $${paramIndex++}`
      params.push(this.state.offset)
    }

    return { sql, params }
  }

  // Execute query
  async execute(): Promise<QueryResult<T>> {
    const { sql, params } = this.build()
    return this.db.query<T>(sql, params)
  }
}

// Factory function to create a new query builder for any table
export function createQueryBuilder<T>(db: Database, tableName: string): QueryBuilder<T> {
  const initialState: QueryState = {
    table: tableName,
    conditions: []
  }
  
  return new QueryBuilder<T>(db, initialState)
} 