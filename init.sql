-- Initialize database for DBuddy library development

-- Create test table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL
);

-- Create test table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  page TEXT NOT NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL
);


TRUNCATE TABLE users CASCADE;
TRUNCATE TABLE comments CASCADE;

-- Insert sample data
INSERT INTO users (name, email) VALUES 
  ('Alice Johnson', 'alice@example.com'),
  ('Bob Smith', 'bob@example.com'),
  ('Charlie Brown', 'charlie@example.com');

INSERT INTO comments (page, author, content) VALUES 
  ('page1', 'author1', 'content1'),
  ('page2', 'author2', 'content2'),
  ('page3', 'author3', 'content3');