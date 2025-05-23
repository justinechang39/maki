# OpenRouter Agent - Project Structure

## Overview
This is an OpenRouter agent CLI tool for file operations, CSV manipulation, todo management, and web content fetching.

## Commands
- `npm run dev` - Start Ink-based UI interface (main)
- `npm run console` - Start console interface (backup)
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built version (Ink interface)

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
├── cli/            # CLI interfaces
│   ├── console.ts  # Console-based CLI
│   └── ink.tsx     # Ink-based UI
└── index.ts        # Main entry point
```

## Adding New Tools

1. Create tool definitions in the appropriate `src/tools/*-tools.ts` file
2. Implement the tool functions in the same file  
3. Export tools and implementations from `src/tools/index.ts`
4. The tools will automatically be available in both CLI interfaces

## Configuration

Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

## Workspace

The agent operates within a `file_assistant_workspace` directory relative to the project root.