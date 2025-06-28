# NPM Publishing Setup Guide

This project now includes three different workflows for publishing to NPM. Choose the one that best fits your needs:

## 🔧 Required Setup (All Workflows)

### 1. Create NPM Access Token

```bash
npm login
npm token create
```

Copy the generated token - you'll need it for GitHub Secrets.

### 2. Add NPM Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Name: `NPM_TOKEN`
5. Value: Paste your npm access token
6. Click **"Add secret"**

## 📋 Available Workflows

### Option 1: Automatic Publishing on Version Change (Recommended)
**File**: `.github/workflows/publish.yml`

- ✅ Publishes automatically when `package.json` version changes
- ✅ Only publishes if tests pass
- ✅ Safe - won't publish duplicate versions
- ✅ Full CI/CD pipeline included

**How to use:**
```bash
# Update version and push
npm version patch  # or minor, major
git push origin main --tags
```

### Option 2: Manual Release with Tags
**File**: `.github/workflows/release.yml`

- ✅ More control - only publishes when you create a release tag
- ✅ Creates GitHub releases automatically
- ✅ Good for staged releases

**How to use:**
```bash
# Create and push a tag
git tag v1.0.1
git push origin v1.0.1
```

### Option 3: Semantic Release (Advanced)
**File**: `.github/workflows/semantic-release.yml`

- ✅ Fully automated versioning based on commit messages
- ✅ Generates changelog automatically
- ✅ Follows semantic versioning strictly
- ❌ Requires conventional commit messages

**Commit message format:**
```bash
feat: add new feature        # → minor version bump
fix: fix bug                 # → patch version bump
feat!: breaking change       # → major version bump
docs: update documentation   # → no version bump
```

**Required dependencies for semantic-release:**
```bash
npm install --save-dev semantic-release @semantic-release/changelog @semantic-release/git
```

## 🚀 Current Package.json Scripts

The following scripts have been added to your `package.json`:

```json
{
  "scripts": {
    "prepublishOnly": "npm run lint && npm run typecheck && npm run test:run && npm run build",
    "release": "npm version patch && npm publish",
    "release:minor": "npm version minor && npm publish",
    "release:major": "npm version major && npm publish"
  }
}
```

## 🎯 Recommendation

**Start with Option 1 (Automatic Publishing)** - it provides the best balance of automation and control:

1. Enable the `publish.yml` workflow
2. Disable the current `test.yml` workflow (functionality is included in publish workflow)
3. Use manual version bumping with `npm version patch/minor/major`

## 🛠 Testing Your Setup

1. Make a small change to your code
2. Run: `npm version patch`
3. Run: `git push origin main --tags`
4. Check the **Actions** tab in your GitHub repository
5. Verify the new version appears on npmjs.com

## ⚠️ Important Notes

- The `prepublishOnly` script ensures quality checks run before every publish
- All workflows include full test suites with PostgreSQL
- Workflows will fail if tests don't pass - this is intentional
- Choose ONE workflow - don't run multiple publishing workflows simultaneously

## 🔧 Troubleshooting

**Common Issues:**

1. **"Authentication failed"** → Check your `NPM_TOKEN` secret is set correctly
2. **"Version already exists"** → Bump the version in package.json first
3. **"Tests failing"** → Fix the tests - workflows won't publish if tests fail
4. **"Build fails"** → Check that `npm run build` works locally

**Need help?** Check the Actions tab in your repository for detailed error messages. 