# Maki CLI

⚠️ **DISCLAIMER**: This is an AI-powered tool that can perform file operations and system commands. The author is NOT responsible for any data loss, system damage, or other issues that may arise from using this software. Use at your own risk and always backup important data before running AI agents with file system access.

A command-line AI agent built with OpenRouter that can perform file operations, CSV manipulation, todo management, and web content fetching through a conversational interface.

## Features

- **File Operations**: Read, write, create, delete, copy, and move files and directories
- **CSV Data Tools**: Parse, filter, sort, merge, analyze, and export CSV data
- **Todo Management**: Create, view, update, and manage todo lists with priorities
- **Web Content Fetching**: Download and extract content from web pages
- **Conversational Interface**: Natural language interaction with the AI agent
- **Thread Management**: Save and manage conversation history
- **Global Installation**: Install once and use from any directory

## Quick Start

### 1. Get your OpenRouter API key
Sign up at [openrouter.ai](https://openrouter.ai) and get your API key.

### 2. Set your API key
```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

### 3. Run the agent
```bash
npx maki
```

That's it! No installation required.

## Installation Options

### Using npx (Recommended)
Run without installing (always gets latest version):
```bash
npx maki
```

### Global Install
Install once and use anywhere:
```bash
npm install -g maki
maki
```

### Development/Local Install

For development or local testing:

1. Clone the repository
2. Set your OpenRouter API key:
   ```bash
   export OPENROUTER_API_KEY="your-api-key-here"
   ```
3. Install globally from source:
   ```bash
   npm run install-global
   ```
4. Use from any directory:
   ```bash
   cd ~/Documents
   maki
   ```

**Note**: Once published to npm, users can use `npx maki` or `npm install -g maki`.

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Set your OpenRouter API key:
   ```bash
   export OPENROUTER_API_KEY="your-api-key-here"
   ```
4. Run database setup: `npx prisma migrate dev`

## Usage

### Global Usage (After Global Install)
```bash
cd /any/directory
maki
```

The agent will operate on files in your current working directory and store its database in `~/.config/maki/`.

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## Commands

- `npm run dev` - Start development interface
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run built version
- `npm run install-global` - Build and install globally
- `npm run migrate` - Run database migrations

## Configuration

### Global Installation
- Database: `~/.config/maki/database.sqlite`
- Working directory: Current directory where you run `maki`

### Development Mode
- Database: `./prisma/database.sqlite`
- Working directory: `./file_assistant_workspace`

## Available Tools

### File Tools
- `listFiles` - List files and directories
- `readFile` - Read file contents
- `writeFile` - Create or update files
- `appendToFile` - Append content to files
- `deleteFile` - Delete files
- `createFolder` - Create directories
- `deleteFolder` - Delete directories
- `renameFolder` - Rename directories
- `renameFile` - Rename files
- `copyFile` - Copy files
- `copyFolder` - Copy directories

### CSV Tools
- `loadCSV` - Load and display CSV data
- `filterCSV` - Filter CSV rows by criteria
- `sortCSV` - Sort CSV data by columns
- `analyzeCSV` - Analyze CSV structure and data
- `mergeCSV` - Merge multiple CSV files
- `exportCSV` - Export data to CSV format
- `groupByCSV` - Group CSV data by column values
- `transformCSV` - Transform CSV column data

### Todo Tools
- `getTodos` - View current todo list
- `addTodo` - Add new todo items
- `updateTodo` - Update existing todos
- `deleteTodo` - Delete todos
- `clearTodos` - Clear all todos

### Web Tools
- `fetchWebContent` - Download and extract web page content

## Publishing to npm

To publish this package so users can use `npx maki`:

1. **Create npm account**: Sign up at [npmjs.com](https://npmjs.com)

2. **Login to npm**:
   ```bash
   npm login
   ```

3. **Update version** (if needed):
   ```bash
   npm version patch  # or minor/major
   ```

4. **Build and publish**:
   ```bash
   npm run build
   npm publish
   ```

5. **Users can then run**:
   ```bash
   npx maki
   ```

### Pre-publish Checklist

- [ ] Update version in package.json
- [ ] Ensure package name is unique on npm
- [ ] Test locally with `npm run install-global`
- [ ] Update README with actual npm package name
- [ ] Remove hardcoded API keys from code

## License

ISC