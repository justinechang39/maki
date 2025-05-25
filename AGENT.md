# maki - Project Structure

## Overview
This is a maki CLI tool for file operations, CSV manipulation, todo management, and web content fetching.

## Commands
- `npm run dev` - Start development interface
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built version

## Project Structure

```
src/
├── core/           # Core functionality
│   ├── config.ts   # Configuration constants
│   ├── types.ts    # Type definitions  
│   ├── utils.ts    # Helper functions
│   ├── api.ts      # OpenRouter API client
│   └── csv-utils.ts # CSV parsing utilities
├── tools/          # Tool definitions and implementations
│   ├── index.ts    # Tool exports
│   ├── file-tools.ts    # File system operations
│   ├── csv-tools.ts     # CSV data manipulation
│   ├── todo-tools.ts    # Todo list management
│   └── web-tools.ts     # Web content fetching
├── cli/            # CLI interface
│   └── ink.tsx     # Ink-based UI
└── index.ts        # Main entry point
```

## Adding New Tools

1. Create tool definitions in the appropriate `src/tools/*-tools.ts` file
2. Implement the tool functions in the same file  
3. Export tools and implementations from `src/tools/index.ts`
4. The tools will automatically be available in the CLI interface

## Configuration

Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

## AI Agent Guidelines

### File Finding Best Practices

**Use the unified `glob` tool for all file discovery:**
- Powerful glob patterns: `*`, `**`, `?`, `[]`, `{}`
- Default limit: 100 results to prevent context overflow
- Returns simple file paths by default (strings)

**For finding images:**
```javascript
// Good - finds PNG files recursively
glob("**/*.png", { cwd: "folder/path" })

// Good - finds multiple image types
glob("**/*.{png,jpg,jpeg,gif}")

// Good - with reasonable limits
glob("**/*.jpg", { maxResults: 50 })
```

**Output options (use wisely to avoid context overflow):**
- Default: Returns simple file paths (strings) - most efficient
- `sizeOnly: true` - Returns path and file size only (good for filtering by size)
- `objectMode: true` - Returns objects with metadata (use sparingly)
- `stats: true` - Includes full file metadata (most verbose, use only when needed)

**For finding large images:**
1. Use `glob` with `sizeOnly`: `glob("**/*.{png,jpg,jpeg}", { sizeOnly: true, maxResults: 50 })`
2. Filter results by size in your code logic

**For copying multiple images:**
1. Use `glob` to discover image files: `glob("**/*.{png,jpg,jpeg}", { maxResults: 50 })`
2. Use `createFolder` to create destination folder
3. Use `copyFile` in a loop for each image found

**Common image extensions:** png, jpg, jpeg, gif, webp, svg, bmp, tiff

## Workspace

The agent operates within a `file_assistant_workspace` directory relative to the project root.