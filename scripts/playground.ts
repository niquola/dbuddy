#!/usr/bin/env tsx

import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const PLAYGROUND_DIR = './playground';

function createPlayground() {
  console.log('🎮 Creating DBX TypeScript playground...');

  // Build the current package first
  console.log('🔨 Building current package...');
  try {
    execSync('npm run build', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Package built successfully!');
  } catch (error) {
    console.error('❌ Failed to build package:', error);
    console.log('💡 Make sure to run this from the root directory and that all dependencies are installed');
    process.exit(1);
  }

  // Clean up existing playground
  if (existsSync(PLAYGROUND_DIR)) {
    console.log('🧹 Cleaning up existing playground...');
    rmSync(PLAYGROUND_DIR, { recursive: true, force: true });
  }

  // Create directory structure
  mkdirSync(PLAYGROUND_DIR, { recursive: true });
  mkdirSync(join(PLAYGROUND_DIR, 'src'), { recursive: true });

  // Create package.json
  const packageJson = {
    name: "dbx-playground",
    version: "1.0.0",
    description: "TypeScript playground for dbx",
    main: "dist/index.js",
    scripts: {
      build: "tsc",
      dev: "tsx src/index.ts",
      start: "node dist/index.js"
    },
    devDependencies: {
      "@types/node": "^20.10.0",
      "tsx": "^4.20.3",
      "typescript": "^5.3.0",
      "dbx": "file:.."
    },
    dependencies: {
      "dbx": "file:.."
    }
  };

  writeFileSync(
    join(PLAYGROUND_DIR, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create tsconfig.json
  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      declaration: true,
      declarationMap: true,
      sourceMap: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };

  writeFileSync(
    join(PLAYGROUND_DIR, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );

  // Create src/index.ts
  const indexTs = `import { Database, QueryBuilder } from 'dbx';

async function main() {
  console.log('🎮 Welcome to DBX Playground!');
  
  // Example: Create a database instance (uncomment when you have a connection string)
  // const db = new Database({ 
  //   connectionString: 'postgresql://user:password@localhost:5432/database' 
  // });

  // Example: Create a query builder
  const qb = new QueryBuilder();
  
  console.log('✅ QueryBuilder created:', typeof qb);
  
  // Add your playground code here
  console.log('🚀 Start coding with DBX!');
}

// Run the main function
main().catch(console.error);
`;

  writeFileSync(join(PLAYGROUND_DIR, 'src', 'index.ts'), indexTs);

  // Create README.md
  const readme = `# DBX Playground

A simple TypeScript playground for testing dbx functionality.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Run in development mode:
   \`\`\`bash
   npm run dev
   \`\`\`

3. Build and run:
   \`\`\`bash
   npm run build
   npm start
   \`\`\`

## Files

- \`src/index.ts\` - Main playground file
- \`package.json\` - Project configuration
- \`tsconfig.json\` - TypeScript configuration

## Usage

Edit \`src/index.ts\` to experiment with DBX features. The main function is already set up for you.
`;

  writeFileSync(join(PLAYGROUND_DIR, 'README.md'), readme);

  // Create .gitignore
  const gitignore = `node_modules/
dist/
*.log
.env
.env.local
`;

  writeFileSync(join(PLAYGROUND_DIR, '.gitignore'), gitignore);

  // Install dependencies
  console.log('📦 Installing dependencies...');
  try {
    execSync('npm install', { 
      cwd: PLAYGROUND_DIR, 
      stdio: 'inherit' 
    });
    console.log('✅ Dependencies installed successfully!');
  } catch (error) {
    console.error('❌ Failed to install dependencies:', error);
    console.log('💡 You can manually run: cd playground && npm install');
  }

  console.log(`✅ Playground created successfully!

📁 Structure:
playground/
├── src/
│   └── index.ts      # Main playground file
├── package.json      # Project configuration
├── tsconfig.json     # TypeScript configuration
├── README.md         # Instructions
└── .gitignore        # Git ignore rules

🚀 Next steps:
1. cd playground
2. npm run dev

Happy coding! 🎉`);
}

createPlayground(); 