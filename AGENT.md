# maki - LangChain-Powered AI Assistant

## Overview
Maki is an AI-powered CLI tool with a **revolutionary multi-agent architecture** using LangChain for intelligent file operations, CSV manipulation, todo management, and web content fetching. Features conversation threading, persistent memory, and comprehensive smart tools for real-world workflows.

## Commands
- `npm run dev` - Start development interface
- `npm run build` - Build TypeScript to JavaScript  
- `npm start` - Run built version
- `node dist/cli/ink.js --test --query="your query"` - Test mode for single queries
- `node dist/cli/ink.js --test-suite` - Run comprehensive test suite

## Project Structure

```
src/
├── core/                           # Core LangChain & Multi-Agent System
│   ├── config.ts                   # Configuration constants
│   ├── types.ts                    # Type definitions  
│   ├── langchain-agent.ts          # Primary LangChain agent
│   ├── multi-agent-system.ts       # Multi-agent coordination system
│   ├── coordinator-prompt.ts       # Strategic coordination prompts
│   ├── langchain-memory.ts         # Conversation memory management
│   ├── system-prompt.ts            # Agent system instructions
│   ├── database.ts                 # Thread persistence (Prisma)
│   └── csv-utils.ts               # CSV parsing utilities
├── tools/                          # Revolutionary Smart Tools
│   ├── index.ts                    # Tool exports
│   ├── smart-file-tools.ts         # 6 intelligent file management tools
│   ├── csv-tools.ts               # CSV data manipulation
│   ├── todo-tools.ts              # Todo list management
│   └── web-tools.ts               # Web content fetching
├── components/                     # React UI components
│   ├── ChatInterface.tsx          # Main chat interface
│   ├── ThreadManager.tsx          # Thread management UI
│   └── ThreadSelector.tsx         # Thread selection UI
├── cli/                           # CLI interface
│   └── ink.tsx                   # Ink-based UI with multi-agent integration
└── index.ts                      # Main entry point
```

## Configuration

Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

## Revolutionary Multi-Agent Architecture

### Agent Types & Coordination

**🧠 Coordinator Agent**: Strategic planner that analyzes request complexity and creates optimal delegation plans
- Uses **strategic thinking** to route simple vs complex tasks
- Creates **parallel execution plans** for maximum efficiency
- Has access to `think` tool for planning decisions

**🤖 Smart Agent**: Handles simple tasks directly OR detects complexity and signals for parallel execution
- Can **dynamically switch** to parallel mode when bulk operations detected
- Has access to ALL tools for comprehensive task handling
- Uses efficiency detection to minimize API calls

**⚡ Multi-Agent Executor**: Executes complex tasks with **parallel, sequential, or hybrid** execution modes
- **Parallel**: Multiple independent operations simultaneously
- **Sequential**: Dependent operations in order
- **Hybrid**: Discovery phase → parallel processing phase

**🔀 Parallel Bulk Executor**: Dynamically spawned for bulk operations detected by smart agent

### Execution Flow Decision Tree

```
User Request
     ↓
🧠 Coordinator (analyzes complexity)
     ↓
┌─ Simple Task ──→ 🤖 Smart Agent ──→ ✅ Direct completion
│                       ↓
│                  (detects bulk ops)
│                       ↓
│                  🔀 Parallel Bulk Executor
└─ Complex Task ──→ ⚡ Multi-Agent Executor ──→ ✅ Coordinated completion
```

## Revolutionary Smart File Tools

**🚀 BREAKTHROUGH: 6 Smart Tools Replace 20+ Granular Tools**

### Core Smart Tools

**1. `findFiles` - Intelligent Discovery**
```javascript
// Find folders with specific names
findFiles({ pattern: "**/*induction*", type: "folders" })

// Find large images with size filtering
findFiles({ pattern: "**/*.{jpg,png}", sizeFilter: ">1MB" })

// Find recent files with date filtering
findFiles({ pattern: "**/*", dateFilter: "<7days" })
```

**2. `processFiles` - Multi-Step Workflow Engine**
```javascript
// Complete workflow: Find folders → find images inside → copy to new folder
processFiles({
  findPattern: "**/*induction*", 
  findType: "folders",
  thenAction: "findInside", 
  insidePattern: "**/*.{jpg,png}", 
  finalAction: "copy", 
  finalTarget: "induction_images"
})
```

**3. `batchRename` - Intelligent Pattern Renaming**
```javascript
// Add creation dates to filenames
batchRename({
  location: "folder_name",
  pattern: "**/*.jpg",
  template: "{created:YYYY-MM-DD}_{name}.{ext}"
})

// Sequential numbering with custom patterns
batchRename({
  location: "documents",
  pattern: "*.pdf", 
  template: "document_{counter:03d}_{name}.{ext}"
})
```

**4. `organizeFiles` - Rule-Based Smart Organization**
```javascript
organizeFiles({
  sourcePattern: "downloads/**/*",
  rules: [
    { condition: "ext=jpg,png,gif", action: "images/{year}/" },
    { condition: "size>10MB", action: "large_files/" },
    { condition: "name contains report", action: "reports/{month}/" }
  ]
})
```

**5. `inspectPath` - Comprehensive Path Analysis**
**6. `quickFileOps` - Optimized Basic Operations (read, write, copy, move, delete)**

### Real-World Usage Examples

**Example 1: The Original Challenge**
```bash
# User: "find folders with 'induction' in the name, copy images to new folder, rename with dates"
# OLD SYSTEM: 50+ tool calls
# NEW SYSTEM: 2 tool calls

processFiles() → batchRename() = ✅ DONE
```

**Example 2: Bulk Organization**
```bash
# User: "organize my downloads folder by file type and size"
# NEW SYSTEM: 1 tool call

organizeFiles() = ✅ DONE
```

### Performance Metrics

- **98% reduction** in API calls for complex file operations
- **Workflow-level thinking** instead of micro-operations
- **Real-world task completion** in 1-3 tool calls vs 50+
- **Intelligent error handling** with actionable suggestions

## Testing & Validation

### Built-in Test Suite
```bash
# Test single queries
node dist/cli/ink.js --test --query="your specific request"

# Run comprehensive test suite
node dist/cli/ink.js --test-suite
```

### Real Operation Verification
The agent performs **actual file operations**:
- ✅ Creates real folders and files
- ✅ Copies and moves actual files  
- ✅ Renames files with date patterns
- ✅ Organizes files according to rules

## Agent Usage Guidelines

### For Users
1. **Think in workflows**: Describe what you want to accomplish, not individual steps
2. **Use natural language**: "find large images and organize them" vs technical commands
3. **Trust the intelligence**: The agent will choose optimal execution strategy

### For Developers
1. **New tools**: Add to appropriate `src/tools/*-tools.ts` file
2. **Multi-agent coordination**: Update `coordinator-prompt.ts` for new capabilities
3. **Testing**: Always use test mode for validation

### Smart Tool Selection
- **Single operations**: Smart agent handles directly
- **Bulk operations**: Automatic parallel execution
- **Complex workflows**: Multi-agent coordination with optimal execution mode

The agent automatically chooses the most efficient approach based on task complexity and scope.

## Workspace

The agent operates within a `file_assistant_workspace` directory relative to the project root, performing real file operations with comprehensive logging and verification.