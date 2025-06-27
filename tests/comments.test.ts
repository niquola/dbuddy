import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Database } from '../src/database'
import { createQueryBuilder, QueryBuilder } from '../src/query-builder'
import { TextFieldQuery, TimestampFieldQuery } from '../src/types'
import { getDatabaseConfig } from '../src/config'

// Comment model
interface Comment {
  id: number
  author: string
  content: string
  created_at: Date
  updated_at: Date
}

// Comments-specific query builder with field accessors
class CommentQueryBuilder extends QueryBuilder<Comment> {
  get author(): TextFieldQuery<CommentQueryBuilder> {
    return this.textField('author') as TextFieldQuery<CommentQueryBuilder>
  }

  get content(): TextFieldQuery<CommentQueryBuilder> {
    return this.textField('content') as TextFieldQuery<CommentQueryBuilder>
  }

  get created_at(): TimestampFieldQuery<CommentQueryBuilder> {
    return this.timestampField('created_at') as TimestampFieldQuery<CommentQueryBuilder>
  }

  get updated_at(): TimestampFieldQuery<CommentQueryBuilder> {
    return this.timestampField('updated_at') as TimestampFieldQuery<CommentQueryBuilder>
  }
}

// Factory function to create a new comment query builder
function getComments(db: Database): CommentQueryBuilder {
  const baseBuilder = createQueryBuilder<Comment>(db, 'comments')
  return Object.setPrototypeOf(baseBuilder, CommentQueryBuilder.prototype)
}

// Global database setup for convenience
let globalDb: Database | null = null

function setGlobalDatabase(db: Database): void {
  globalDb = db
}

function getCommentsQuery(): CommentQueryBuilder {
  if (!globalDb) {
    throw new Error('Global database not set. Use setGlobalDatabase() first or use getComments(db) directly.')
  }
  return getComments(globalDb)
}

// Load configuration from environment variables
const testConfig = getDatabaseConfig()

describe('Comments Query Builder', () => {
  let db: Database

  beforeAll(async () => {
    db = new Database(testConfig)
    setGlobalDatabase(db)
    
    // Create comments table for testing
    await db.query(`
      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        author VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Insert test data
    await db.query(`
      INSERT INTO comments (author, content, created_at, updated_at) VALUES 
      ('ivan', 'First comment by Ivan', '2024-01-01 10:00:00', '2024-01-01 10:00:00'),
      ('john', 'Comment by John', '2024-01-02 11:00:00', '2024-01-02 11:00:00'),
      ('ivan', 'Second comment by Ivan', '2024-01-03 12:00:00', '2024-01-03 12:00:00'),
      ('alice', 'Comment by Alice', '2024-01-04 13:00:00', '2024-01-04 13:00:00')
      ON CONFLICT DO NOTHING
    `)
  })

  afterAll(async () => {
    // Clean up test data
    await db.query('DROP TABLE IF EXISTS comments')
    await db.close()
  })

  describe('Basic Query Building', () => {
    it('should build simple equality query', () => {
      const query = getComments(db).author.eq('ivan')
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author = $1')
      expect(params).toEqual(['ivan'])
    })

    it('should build query with LIKE operator', () => {
      const query = getComments(db).author.like('%ivan%')
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author LIKE $1')
      expect(params).toEqual(['%ivan%'])
    })

    it('should build query with order by and limit', () => {
      const query = getComments(db)
        .author.eq('ivan')
        .orderBy('created_at', 'DESC')
        .limit(10)
      
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author = $1 ORDER BY created_at DESC LIMIT $2')
      expect(params).toEqual(['ivan', 10])
    })

    it('should build complex query with multiple conditions', () => {
      const query = getComments(db)
        .author.eq('ivan')
        .content.like('%comment%')
        .orderBy('created_at')
        .limit(5)
        .offset(2)
      
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author = $1 AND content LIKE $2 ORDER BY created_at ASC LIMIT $3 OFFSET $4')
      expect(params).toEqual(['ivan', '%comment%', 5, 2])
    })

    it('should build query with IN operator', () => {
      const query = getComments(db).author.in(['ivan', 'john'])
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author IN ($1, $2)')
      expect(params).toEqual(['ivan', 'john'])
    })
  })

  describe('Text Field Query Methods', () => {
    it('should support text-specific operators', () => {
      const query1 = getComments(db).content.contains('comment')
      const { sql: sql1, params: params1 } = query1.build()
      
      expect(sql1).toBe('SELECT * FROM comments WHERE content LIKE $1')
      expect(params1).toEqual(['%comment%'])

      const query2 = getComments(db).author.startsWith('iv')
      const { sql: sql2, params: params2 } = query2.build()
      
      expect(sql2).toBe('SELECT * FROM comments WHERE author LIKE $1')
      expect(params2).toEqual(['iv%'])

      const query3 = getComments(db).content.ilike('%COMMENT%')
      const { sql: sql3, params: params3 } = query3.build()
      
      expect(sql3).toBe('SELECT * FROM comments WHERE content ILIKE $1')
      expect(params3).toEqual(['%COMMENT%'])
    })

    it('should support not equal operator', () => {
      const query = getComments(db).author.ne('ivan')
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author != $1')
      expect(params).toEqual(['ivan'])
    })
  })

  describe('Timestamp Field Query Methods', () => {
    it('should support timestamp comparison operators', () => {
      const date = new Date('2024-01-02')
      const query = getComments(db).created_at.gt(date)
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE created_at > $1')
      expect(params).toEqual([date])
    })

    it('should support less than or equal operator', () => {
      const date = new Date('2024-01-03')
      const query = getComments(db).created_at.lte(date)
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE created_at <= $1')
      expect(params).toEqual([date])
    })

    it('should support timestamp IN operator', () => {
      const dates = [new Date('2024-01-01'), new Date('2024-01-02')]
      const query = getComments(db).created_at.in(dates)
      const { sql, params } = query.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE created_at IN ($1, $2)')
      expect(params).toEqual(dates)
    })
  })

  describe('Query Execution', () => {
    it('should execute simple query and return results', async () => {
      const result = await getComments(db).author.eq('ivan').execute()
      
      expect(result.rows).toHaveLength(2)
      expect(result.rows[0]).toHaveProperty('author', 'ivan')
      expect(result.rows[0]).toHaveProperty('content')
      expect(result.rows[0]).toHaveProperty('created_at')
    })

    it('should execute query with limit', async () => {
      const result = await getComments(db)
        .author.eq('ivan')
        .orderBy('created_at')
        .limit(1)
        .execute()
      
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].author).toBe('ivan')
    })

    it('should handle empty results', async () => {
      const result = await getComments(db).author.eq('nonexistent').execute()
      
      expect(result.rows).toHaveLength(0)
      expect(result.rowCount).toBe(0)
    })
  })

  describe('Global Database Usage', () => {
    it('should work with global database instance', async () => {
      const result = await getCommentsQuery().author.eq('john').execute()
      
      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].author).toBe('john')
    })
  })

  describe('Functional Composition', () => {
    it('should support method chaining without mutation', () => {
      const baseQuery = getComments(db).author.eq('ivan')
      const query1 = baseQuery.orderBy('created_at').limit(1)
      const query2 = baseQuery.orderBy('updated_at', 'DESC').limit(5)
      
      const { sql: sql1, params: params1 } = query1.build()
      const { sql: sql2, params: params2 } = query2.build()
      
      // Queries should be different (immutable)
      expect(sql1).toBe('SELECT * FROM comments WHERE author = $1 ORDER BY created_at ASC LIMIT $2')
      expect(sql2).toBe('SELECT * FROM comments WHERE author = $1 ORDER BY updated_at DESC LIMIT $2')
      expect(params1).toEqual(['ivan', 1])
      expect(params2).toEqual(['ivan', 5])
    })

    it('should demonstrate the requested interface example', async () => {
      // This is the exact interface requested by the user
      const result = await getComments(db)
        .author.eq('ivan')
        .orderBy('created_at')
        .limit(10)
        .execute()
      
      expect(result.rows).toHaveLength(2) // We have 2 ivan comments
      expect(result.rows[0].author).toBe('ivan')
      expect(result.rows.every((comment: Comment) => comment.author === 'ivan')).toBe(true)
    })
  })

  describe('Generic Query Builder Usage', () => {
    it('should work with generic createQueryBuilder for any table', () => {
      // Example of using the generic builder directly
      const genericQuery = createQueryBuilder<Comment>(db, 'comments')
        .textField('author').eq('ivan')
        .orderBy('created_at')
        .limit(5)
      
      const { sql, params } = genericQuery.build()
      
      expect(sql).toBe('SELECT * FROM comments WHERE author = $1 ORDER BY created_at ASC LIMIT $2')
      expect(params).toEqual(['ivan', 5])
    })
  })
}) 