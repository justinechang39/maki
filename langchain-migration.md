# LangChain Migration Plan for Maki CLI

## Overview

This document outlines the migration strategy to integrate LangChain into the maki CLI tool while preserving the polished Ink-based terminal UI and custom functionality. The goal is to replace the complex custom agent orchestration with LangChain's battle-tested framework while maintaining all existing features and user experience.

## Current Architecture Analysis

### What We Built (Custom Implementation)
- **29 custom tools** across 5 domains (file ops, CSV, web, todos, reasoning)
- **Custom agent orchestration** with recursive tool calling and error handling
- **Ink-based terminal UI** with thread management, real-time updates
- **Database persistence** with Prisma and SQLite
- **OpenRouter API integration** with custom error handling and timeouts
- **Real-time tool execution feedback** with custom formatting

### Code Complexity (Lines to Replace)
- `src/core/api.ts`: 76 lines of API integration
- `src/cli/ink.tsx` (processAssistantResponse): 80+ lines of tool orchestration  
- `src/cli/ink.tsx` (executeToolCall): 50+ lines of tool execution
- `src/cli/ink.tsx` (formatToolResult): 160+ lines of custom formatting
- **Total**: ~366 lines of complex orchestration code → ~50 lines with LangChain

## Migration Strategy: Hybrid Approach

### Keep (Custom UI & Features)
- ✅ **Ink components**: ThreadSelector, ChatInterface, ThreadManager
- ✅ **Database layer**: Prisma schema, ThreadDatabase operations
- ✅ **Tool result formatting**: Custom `formatToolResult` function
- ✅ **Real-time UI updates**: Processing indicators, tool execution feedback
- ✅ **Thread management**: Create, delete, continue conversations
- ✅ **Custom tool implementations**: All 29 tools remain as-is

### Replace (Agent Core)
- ❌ **API integration**: `callOpenRouterAPI` → `ChatOpenAI`
- ❌ **Agent orchestration**: `processAssistantResponse` → `AgentExecutor`
- ❌ **Tool execution**: `executeToolCall` → LangChain tool system
- ❌ **Conversation management**: Manual history → LangChain Memory
- ❌ **Error handling**: Custom logic → LangChain built-ins

## Step-by-Step Migration Plan

### Phase 1: Setup & Dependencies
```bash
npm install langchain @langchain/core @langchain/openai
```

**Files to create:**
- `src/core/langchain-agent.ts` - LangChain agent setup
- `src/core/langchain-tools.ts` - Tool adapter layer
- `src/core/langchain-memory.ts` - Memory management

### Phase 2: Tool Adapter Layer

Create `src/core/langchain-tools.ts`:
```typescript
import { DynamicTool } from "langchain/tools";
import { tools, toolImplementations } from '../tools/index.js';

export const createLangChainTools = (
  setMessages: Function,
  formatToolResult: Function
) => {
  return tools.map(tool => new DynamicTool({
    name: tool.function.name,
    description: tool.function.description,
    func: async (input: string) => {
      let args: any;
      try {
        args = typeof input === 'string' ? JSON.parse(input) : input;
      } catch {
        args = input;
      }

      // Show executing state in UI (keep real-time feedback)
      const toolId = `tool-${Date.now()}-${Math.random()}`;
      setMessages((prev: any[]) => [...prev, {
        role: 'assistant',
        content: tool.function.name === 'think' ? args.thoughts : tool.function.name,
        isToolExecution: true,
        toolName: tool.function.name,
        isProcessing: true,
        id: toolId
      }]);

      try {
        // Execute original tool implementation
        const result = await toolImplementations[tool.function.name](args);
        
        // Update UI with formatted result (keep custom formatting)
        setMessages((prev: any[]) => prev.map(msg => 
          msg.id === toolId ? {
            role: 'assistant',
            content: tool.function.name === 'think' ? args.thoughts : formatToolResult(tool.function.name, args, result),
            isProcessing: false,
            isToolResult: tool.function.name !== 'think',
            isThinking: tool.function.name === 'think',
            id: toolId
          } : msg
        ));

        return JSON.stringify(result);
      } catch (error: any) {
        // Update UI with error (keep error formatting)
        setMessages((prev: any[]) => prev.map(msg => 
          msg.id === toolId ? {
            role: 'assistant',
            content: `❌ ${tool.function.name} failed: ${error.message}`,
            isProcessing: false,
            isToolResult: true,
            id: toolId
          } : msg
        ));
        throw error;
      }
    }
  }));
};
```

### Phase 3: Agent Setup

Create `src/core/langchain-agent.ts`:
```typescript
import { ChatOpenAI } from "langchain/chat_models/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "langchain/prompts";
import { OPENROUTER_API_KEY, API_URL, MODEL_ID } from './config.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

export const createMakiAgent = async (langchainTools: any[]) => {
  const llm = new ChatOpenAI({
    openAIApiKey: OPENROUTER_API_KEY,
    configuration: { 
      baseURL: API_URL,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/justinechang/maki',
        'X-Title': 'Maki CLI Tool'
      }
    },
    modelName: MODEL_ID,
    temperature: 0.1,
    timeout: 60000
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", SYSTEM_PROMPT],
    ["placeholder", "{chat_history}"],
    ["human", "{input}"],
    ["placeholder", "{agent_scratchpad}"]
  ]);

  const agent = await createToolCallingAgent({
    llm,
    tools: langchainTools,
    prompt
  });

  return new AgentExecutor({
    agent,
    tools: langchainTools,
    maxIterations: 5,
    returnIntermediateSteps: false,
    handleParsingErrors: true
  });
};
```

### Phase 4: Memory Management

Create `src/core/langchain-memory.ts`:
```typescript
import { ChatMessageHistory } from "langchain/memory";
import { HumanMessage, AIMessage, SystemMessage } from "langchain/schema";
import type { Message } from './types.js';

export class MakiChatHistory extends ChatMessageHistory {
  constructor(messages: Message[] = []) {
    super();
    this.addMessages(messages.map(msg => {
      switch (msg.role) {
        case 'user':
          return new HumanMessage(msg.content || '');
        case 'assistant':
          return new AIMessage(msg.content || '');
        case 'system':
          return new SystemMessage(msg.content || '');
        default:
          return new AIMessage(msg.content || '');
      }
    }));
  }
}

export const createMemoryFromHistory = (conversationHistory: Message[]) => {
  return new MakiChatHistory(conversationHistory);
};
```

### Phase 5: Replace handleSubmit Function

In `src/cli/ink.tsx`, replace the `handleSubmit` callback:

```typescript
// Add imports
import { createMakiAgent } from '../core/langchain-agent.js';
import { createLangChainTools } from '../core/langchain-tools.js';
import { createMemoryFromHistory } from '../core/langchain-memory.js';

// Replace handleSubmit function
const handleSubmit = useCallback(async (userInput: string) => {
  if (!userInput.trim() || isProcessing) return;

  const trimmedInput = userInput.trim();
  
  if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
    exit();
    return;
  }

  // Keep existing UI updates
  const userMessage: Message = {
    role: 'user',
    content: trimmedInput
  };

  setMessages(prev => [...prev, userMessage as DisplayMessage]);
  setIsProcessing(true);

  // Keep database persistence
  if (currentThreadId) {
    await ThreadDatabase.addMessage(currentThreadId, 'USER', trimmedInput);
    
    const isFirstMessage = conversationHistory.length === 1 && conversationHistory[0].role === 'system';
    if (isFirstMessage) {
      generateThreadTitle(trimmedInput, currentThreadId);
    }
  }

  try {
    // NEW: LangChain integration
    const langchainTools = createLangChainTools(setMessages, formatToolResult);
    const agent = await createMakiAgent(langchainTools);
    const memory = createMemoryFromHistory(conversationHistory);

    const response = await agent.invoke({
      input: trimmedInput,
      chat_history: memory.messages
    });

    // Keep existing UI updates
    if (response.output && response.output.trim()) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.output,
        showToolCalls: false
      } as DisplayMessage]);
    }

    // Keep database persistence
    if (currentThreadId && response.output) {
      await ThreadDatabase.addMessage(currentThreadId, 'ASSISTANT', response.output);
    }

    // Update conversation history
    const newHistory = [...conversationHistory, userMessage, {
      role: 'assistant' as const,
      content: response.output
    }];
    setConversationHistory(newHistory);

  } catch (error: any) {
    // Keep existing error handling
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `❗ Error: ${error.message}`,
    } as DisplayMessage]);
  } finally {
    setIsProcessing(false);
  }
}, [isProcessing, conversationHistory, formatToolResult, exit, currentThreadId, generateThreadTitle]);
```

### Phase 6: Cleanup

**Files to remove/replace:**
- Remove `processAssistantResponse` function
- Remove `executeToolCall` function  
- Remove `callOpenRouterAPI` from `src/core/api.ts`
- Keep `formatToolResult` (still needed for UI)

## Testing Strategy

### 1. Functionality Testing
```bash
# Test all tool categories
- File operations (readFile, writeFile, glob, etc.)
- CSV operations (parseCSV, updateCSVCell, etc.) 
- Web operations (fetchWebContent, downloadFile, etc.)
- Todo operations (todo_read, todo_write, etc.)
- Think tool (reasoning functionality)
```

### 2. UI/UX Testing
- ✅ Real-time tool execution feedback
- ✅ Thread management (create, continue, delete)
- ✅ Error handling and display
- ✅ Processing indicators
- ✅ Custom tool result formatting

### 3. Performance Testing
- Memory usage with long conversations
- Response times vs current implementation
- Database persistence integrity

## Sub-Agent Utilization

To minimize costs and time during migration, use **multiple concurrent sub-agents**:

### Sub-Agent 1: Tool Adapter Migration
**Task**: Create the LangChain tool adapter layer
**Files**: `src/core/langchain-tools.ts`
**Focus**: Converting 29 custom tools to LangChain DynamicTool format

### Sub-Agent 2: Agent Core Migration  
**Task**: Create LangChain agent setup and memory management
**Files**: `src/core/langchain-agent.ts`, `src/core/langchain-memory.ts`
**Focus**: Agent executor, memory, prompt configuration

### Sub-Agent 3: UI Integration Migration
**Task**: Replace handleSubmit function and update imports
**Files**: `src/cli/ink.tsx` (specific functions only)
**Focus**: Minimal changes to preserve UI/UX

### Sub-Agent 4: Testing & Cleanup
**Task**: Remove deprecated code and test integration
**Files**: Cleanup unused functions, test all tool categories
**Focus**: Ensure feature parity and performance

## Benefits After Migration

### Code Reduction
- **~366 lines of complex orchestration** → **~50 lines with LangChain**
- **Eliminated manual recursion handling** → Automatic by LangChain
- **Eliminated custom error boundaries** → Built-in error handling
- **Eliminated conversation limiting logic** → Automatic memory management

### Reliability Improvements
- **Battle-tested tool orchestration** (used by 100k+ developers)
- **Automatic retry logic** for failed tool calls
- **Better error recovery** and graceful degradation
- **Memory management** with automatic summarization

### Future Extensibility
- **Pre-built tool integrations** (database, APIs, file systems)
- **Multi-agent workflows** with LangGraph
- **Streaming responses** for real-time feedback
- **Custom memory types** (summary, vector, entity)

## Potential Gotchas

### 1. Tool Result Formatting
**Issue**: LangChain tools return strings, but our UI expects specific formats
**Solution**: Maintain custom `formatToolResult` and wrap it in tool adapter

### 2. Real-time UI Updates
**Issue**: LangChain abstracts tool execution, harder to show real-time progress
**Solution**: Intercept tool calls in adapter to update UI immediately

### 3. Database Persistence
**Issue**: LangChain memory doesn't automatically persist to our database
**Solution**: Manual persistence in handleSubmit, convert LangChain history to our format

### 4. Thread Management
**Issue**: LangChain memory is separate from our thread concept
**Solution**: Create memory from loaded thread history, maintain thread-level persistence

## Success Criteria

- ✅ All 29 tools work identically to current implementation
- ✅ UI/UX remains exactly the same (real-time updates, formatting, etc.)
- ✅ Thread management functionality preserved
- ✅ Database persistence works correctly
- ✅ Performance is equal or better than current implementation
- ✅ Error handling is as robust as current implementation
- ✅ Code complexity reduced by ~80%


This migration will transform the codebase from a custom agent framework to a production-grade LangChain implementation while preserving all the polish and functionality that makes maki unique.