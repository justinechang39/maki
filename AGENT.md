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

**For finding files in subdirectories:**
- Use `findFiles` for powerful recursive search with patterns and specific file types
- Use `listFiles` only for immediate directory listing (non-recursive)

**For finding images:**
```javascript
// Good - finds PNG files recursively
findFiles({ searchType: "files", path: "folder/path", fileType: "png" })

// Good - finds all files matching a pattern
findFiles({ searchType: "files", pattern: ".*\\.(png|jpg|jpeg|gif)$" })

// Bad - won't find images in subdirectories
listFiles({ path: "folder/path", extension: "png" })
```

**For copying multiple images:**
1. Use `findFiles` with `fileType` to discover image files (run once per format: png, jpg, etc.)
2. Use `createFolder` to create destination folder
3. Use `copyFile` in a loop for each image found

**Common image extensions:** png, jpg, jpeg, gif, webp, svg, bmp, tiff

## Workspace

The agent operates within a `file_assistant_workspace` directory relative to the project root.