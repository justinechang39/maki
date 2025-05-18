#!/usr/bin/env node
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url'; // To get __dirname in ESM

// For colored output (optional, install with: npm install chalk@4.1.2)
// If you prefer not to use chalk, remove these lines and the chalk.xyz calls
import chalk from 'chalk';
const userPrefix = chalk.blue('👤');
const assistantPrefix = chalk.green('🤖');
const toolPrefix = chalk.yellow('🛠️');
const errorPrefix = chalk.red('❗');
const systemPrefix = chalk.gray('⚙️');

// --- Configuration ---
// IMPORTANT: Set your OpenRouter API key as an environment variable
const OPENROUTER_API_KEY = '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';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Consider using a more modern model that supports tool use well.
// Examples: 'openai/gpt-3.5-turbo', 'openai/gpt-4o-mini', 'anthropic/claude-3-haiku-20240307'
// 'openai/codex-mini' is deprecated and may not work reliably or at all.
const MODEL_ID = 'openai/codex-mini'; // Updated to a more current model

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All file operations will be relative to this directory
const WORKSPACE_DIRECTORY_NAME = 'file_assistant_workspace';
const WORKSPACE_DIRECTORY = path.resolve(__dirname, WORKSPACE_DIRECTORY_NAME);

const MAX_CONVERSATION_LENGTH = 100; // Max messages before considering a reset

// --- Types ---
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Message {
  role: Role;
  content: string | null; // Content can be null for assistant messages with only tool_calls
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function'; // Standard type for tool calls
  function: {
    name: string;
    arguments: string; // Arguments are a JSON string
  };
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any; // JSON schema for parameters
  };
}

// --- Tool Definitions ---
const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Use this tool to document your thinking process, plan steps, or reason about complex problems. The content is only visible to you (logged internally). Use this before undertaking complex multi-step tasks. When you use this tool, you are encouraged to use it multiple times if it helps clarify your plan for a complex task.',
      parameters: {
        type: 'object',
        properties: {
          thoughts: {
            type: 'string',
            description: 'Your detailed thinking process, reasoning, or step-by-step plan.'
          }
        },
        required: ['thoughts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: `List files and/or folders in a directory within the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `The directory path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}'). Defaults to the workspace root if not specified.`
          },
          extension: {
            type: 'string',
            description: 'Optional file extension to filter by (e.g., "txt", "js"). Do not include the dot.'
          },
          includeFiles: {
            type: 'boolean',
            description: 'Whether to include files. Defaults to true.'
          },
          includeFolders: {
            type: 'boolean',
            description: 'Whether to include folders. Defaults to true.'
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: `Read the text content of a file from the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `The file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').`
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: `Write text content to a file in the workspace ('${WORKSPACE_DIRECTORY_NAME}'), creating or overwriting it.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          content: { type: 'string', description: 'The text content to write.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateFile',
      description: `Update an existing file in the workspace ('${WORKSPACE_DIRECTORY_NAME}') by appending or prepending content.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          content: { type: 'string', description: 'The content to add.' },
          operation: {
            type: 'string',
            description: 'Operation: "append" or "prepend".',
            enum: ['append', 'prepend']
          }
        },
        required: ['path', 'content', 'operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFile',
      description: `Delete a file from the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createFolder',
      description: `Create a new folder in the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The folder path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFolder',
      description: `Delete a folder (and its contents if specified) from the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The folder path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          recursive: { type: 'boolean', description: 'Set to true to delete non-empty folders. Defaults to false.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFolder',
      description: `Rename a folder in the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: `Current folder path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          newPath: { type: 'string', description: `New folder path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFile',
      description: `Rename a file in the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: `Current file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          newPath: { type: 'string', description: `New file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'readTodo',
      description: `Read the current todo list from 'todo.md' in the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'writeTodo',
      description: `Create or replace 'todo.md' in the workspace ('${WORKSPACE_DIRECTORY_NAME}') with new content.`,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: "The new content for 'todo.md'." }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateTodoItem',
      description: `Update a todo item in 'todo.md' in the workspace ('${WORKSPACE_DIRECTORY_NAME}').`,
      parameters: {
        type: 'object',
        properties: {
          itemIndex: { type: 'number', description: 'Line number (1-based) of the todo item.' },
          newStatus: {
            type: 'string',
            description: 'New status.',
            enum: ['pending', 'in_progress', 'completed', 'cancelled']
          },
          newText: { type: 'string', description: 'Optional new text for the todo item.' }
        },
        required: ['itemIndex', 'newStatus']
      }
    }
  }
];

// --- Helper Functions ---

/**
 * Resolves a user-provided path against the workspace directory and ensures it's safe.
 * @param userPath Path relative to the workspace directory.
 * @returns Absolute, normalized path within the workspace.
 * @throws Error if path is outside the workspace or invalid.
 */
function getSafeWorkspacePath(userPath: string = '.'): string {
  const resolvedPath = path.resolve(WORKSPACE_DIRECTORY, userPath);
  if (!resolvedPath.startsWith(WORKSPACE_DIRECTORY)) {
    throw new Error(`Path traversal attempt detected. Path must be within '${WORKSPACE_DIRECTORY_NAME}'.`);
  }
  return resolvedPath;
}

/**
 * Validates conversation history, primarily for dangling tool calls.
 * If an assistant message requested tool calls but not all have corresponding tool responses,
 * this function attempts to clean up the history by removing the problematic assistant
 * message and the user message that might have triggered it.
 */
function validateConversationHistory(messages: Message[]): Message[] {
  const toolCallIds = new Set<string>();
  const toolResponseIds = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      message.tool_calls.forEach(call => toolCallIds.add(call.id));
    }
    if (message.role === 'tool' && message.tool_call_id) {
      toolResponseIds.add(message.tool_call_id);
    }
  }

  const unansweredCalls = new Set<string>();
  for (const id of toolCallIds) {
    if (!toolResponseIds.has(id)) {
      unansweredCalls.add(id);
    }
  }

  if (unansweredCalls.size === 0) {
    return messages;
  }

  console.log(systemPrefix + chalk.yellowBright(' Detected unanswered tool calls. Attempting to clean conversation history.'));

  const cleanedMessages: Message[] = [];
  // Iterate backwards to find the first problematic sequence
  // and truncate from there. A simpler approach than selective removal.
  let lastValidIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.tool_calls) {
      const hasUnanswered = message.tool_calls.some(call => unansweredCalls.has(call.id));
      if (hasUnanswered) {
        // Truncate from this message. If this assistant message was preceded by a user message,
        // that user message (at i-1) effectively becomes the last message.
        lastValidIndex = i; // Remove this assistant message and everything after
        break;
      }
    }
  }
  // If the problematic assistant message was triggered by a user message,
  // and we want to remove that user message too, we'd adjust `lastValidIndex`.
  // For instance, if messages[lastValidIndex-1] is 'user', set lastValidIndex = i-1.
  // Current simpler logic: just remove the problematic assistant call and subsequent messages.
  // If lastValidIndex points to the problematic assistant message, slice up to it.
  if (lastValidIndex < messages.length) {
      // If the message at lastValidIndex is the problematic assistant message,
      // and it was preceded by a user message (messages[lastValidIndex-1]),
      // we might want to remove that user message as well.
      // For now, let's just remove the assistant message and anything after.
      // If the user message that triggered it should also be removed:
      if (lastValidIndex > 0 && messages[lastValidIndex -1].role === 'user') {
          return messages.slice(0, lastValidIndex -1);
      }
      return messages.slice(0, lastValidIndex);
  }


  return messages; // Should not be reached if unansweredCalls.size > 0 and logic above is correct
}


// --- Tool Implementations ---
const toolImplementations: Record<string, (args: any) => Promise<any>> = {
  think: async (args: { thoughts: string }) => {
    console.log(toolPrefix + chalk.magentaBright(` Agent thinking: ${args.thoughts.substring(0, 150)}${args.thoughts.length > 150 ? '...' : ''}`));
    return { success: true, message: 'Thinking process documented.', thoughts_received: args.thoughts };
  },
  listFiles: async (args: { path?: string; extension?: string; includeFiles?: boolean; includeFolders?: boolean }) => {
    try {
      const dirPath = getSafeWorkspacePath(args.path || '.');
      const includeFiles = args.includeFiles !== false; // Default true
      const includeFolders = args.includeFolders !== false; // Default true (changed from false for more utility)

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let files: string[] = [];
      if (includeFiles) {
        files = entries.filter(e => e.isFile()).map(e => e.name);
        if (args.extension) {
          const ext = args.extension.startsWith('.') ? args.extension : `.${args.extension}`;
          files = files.filter(f => f.endsWith(ext));
        }
      }
      let folders: string[] = [];
      if (includeFolders) {
        folders = entries.filter(e => e.isDirectory()).map(e => e.name);
      }
      return {
        directory: path.relative(WORKSPACE_DIRECTORY, dirPath) || '.',
        files,
        folders,
        fileCount: files.length,
        folderCount: folders.length,
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  readFile: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, path: args.path, content };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  writeFile: async (args: { path: string; content: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.mkdir(path.dirname(safePath), { recursive: true }); // Ensure parent directory exists
      await fs.writeFile(safePath, args.content, 'utf-8');
      return { success: true, message: `File '${args.path}' written successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  updateFile: async (args: { path: string; content: string; operation: 'append' | 'prepend' }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      let existingContent = '';
      try {
        existingContent = await fs.readFile(safePath, 'utf-8');
      } catch (readError: any) {
        if (readError.code !== 'ENOENT') throw readError; // Rethrow if not 'file not found'
        // If file doesn't exist, treat as new write for append/prepend
      }

      const newContent = args.operation === 'append'
        ? existingContent + args.content
        : args.content + existingContent;

      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, newContent, 'utf-8');
      return { success: true, message: `File '${args.path}' updated successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  deleteFile: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.unlink(safePath);
      return { success: true, message: `File '${args.path}' deleted successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  createFolder: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.mkdir(safePath, { recursive: true });
      return { success: true, message: `Folder '${args.path}' created successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  deleteFolder: async (args: { path: string; recursive?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.rm(safePath, { recursive: !!args.recursive, force: !!args.recursive }); // force is implied by recursive for non-empty
      return { success: true, message: `Folder '${args.path}' deleted successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  renameFolder: async (args: { oldPath: string; newPath: string }) => {
    try {
      const safeOldPath = getSafeWorkspacePath(args.oldPath);
      const safeNewPath = getSafeWorkspacePath(args.newPath);
      await fs.mkdir(path.dirname(safeNewPath), { recursive: true });
      await fs.rename(safeOldPath, safeNewPath);
      return { success: true, message: `Folder renamed from '${args.oldPath}' to '${args.newPath}'.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  renameFile: async (args: { oldPath: string; newPath: string }) => {
    try {
      const safeOldPath = getSafeWorkspacePath(args.oldPath);
      const safeNewPath = getSafeWorkspacePath(args.newPath);
      await fs.mkdir(path.dirname(safeNewPath), { recursive: true });
      await fs.rename(safeOldPath, safeNewPath);
      return { success: true, message: `File renamed from '${args.oldPath}' to '${args.newPath}'.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  readTodo: async () => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      try {
        await fs.access(todoPath);
        const content = await fs.readFile(todoPath, 'utf-8');
        return { success: true, content, exists: true };
      } catch {
        return { success: true, content: '', exists: false, message: "No 'todo.md' found. Use writeTodo to create one." };
      }
    } catch (error: any) {
      return { error: error.message };
    }
  },
  writeTodo: async (args: { content: string }) => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      await fs.writeFile(todoPath, args.content, 'utf-8');
      return { success: true, message: "'todo.md' created/updated." };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  updateTodoItem: async (args: { itemIndex: number; newStatus: string; newText?: string }) => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      let content;
      try {
        content = await fs.readFile(todoPath, 'utf-8');
      } catch {
        return { error: "'todo.md' not found. Use writeTodo first." };
      }

      const lines = content.split('\n');
      if (args.itemIndex < 1 || args.itemIndex > lines.length) {
        return { error: `Invalid itemIndex. 'todo.md' has ${lines.length} lines.` };
      }

      const lineIndex = args.itemIndex - 1;
      const currentLine = lines[lineIndex];

      const statusMarkers: Record<string, string> = {
        pending: '[ ]', in_progress: '[/]', completed: '[x]', cancelled: '[~]'
      };
      const marker = statusMarkers[args.newStatus as keyof typeof statusMarkers];
      if (!marker) return { error: `Invalid newStatus: ${args.newStatus}` };

      const textContent = args.newText !== undefined
        ? args.newText
        : currentLine.replace(/^\s*-\s*\[[ x/~]\]\s*/, '').trim();

      lines[lineIndex] = `- ${marker} ${textContent}`;
      await fs.writeFile(todoPath, lines.join('\n'), 'utf-8');
      return { success: true, message: `Todo item ${args.itemIndex} updated.`, updatedLine: lines[lineIndex] };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};

// --- Agent Loop ---
async function agentLoop(messages: Message[]): Promise<Message[]> {
  let currentMessages = [...messages];

  // Initial validation of history before starting the loop.
  // This is especially useful if the script restarts with existing history.
  const validatedMessages = validateConversationHistory(currentMessages);
  if (validatedMessages.length !== currentMessages.length) {
      console.log(systemPrefix + chalk.yellowBright(' Conversation history was cleaned by validateConversationHistory.'));
      currentMessages = validatedMessages;
      // If history was truncated, it's possible the last message is not suitable for continuing.
      // Consider if we need to re-prompt user or take other action. For now, proceed.
  }


  while (true) {
    try {
      console.log(systemPrefix + chalk.cyan(' Calling LLM...'));

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'X-Title': 'File Assistant CLI', // Optional: Helps identify your app on OpenRouter
          // 'HTTP-Referer': 'YOUR_SITE_URL', // Optional: If you have one
        },
        body: JSON.stringify({
          model: MODEL_ID,
          tools: tools,
          messages: currentMessages,
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error(errorPrefix + chalk.redBright(' API Error:'), JSON.stringify(responseData, null, 2));
        const apiErrorMessage = responseData.error?.message || 'Unknown API error';
         if (responseData.error?.code === 'invalid_api_key') {
           throw new Error (`Invalid OpenRouter API Key. Please check your OPENROUTER_API_KEY environment variable. Details: ${apiErrorMessage}`);
         }
        throw new Error(`API error: ${apiErrorMessage}`);
      }

      if (!responseData.choices || !Array.isArray(responseData.choices) || responseData.choices.length === 0) {
        console.error(errorPrefix + chalk.redBright(' Invalid API response format:'), responseData);
        throw new Error('API returned an invalid response (no choices).');
      }

      const assistantMessage = responseData.choices[0].message as Message;
      if (!assistantMessage) {
        throw new Error('API response did not contain a valid message.');
      }

      currentMessages.push(assistantMessage);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(toolPrefix + chalk.yellow(` Assistant requests ${assistantMessage.tool_calls.length} tool call(s).`));
        const toolResponses: Message[] = [];

        for (const toolCall of assistantMessage.tool_calls) {
          if (toolCall.type !== 'function') {
            console.warn(errorPrefix + ` Unsupported tool call type: ${toolCall.type}. Skipping.`);
            toolResponses.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: 'unknown_tool_type',
              content: JSON.stringify({ error: `Unsupported tool call type: ${toolCall.type}` })
            });
            continue;
          }

          const toolName = toolCall.function.name;
          console.log(toolPrefix + chalk.yellow(` Executing tool: ${toolName} (ID: ${toolCall.id})`));
          
          let args;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (e: any) {
            console.error(errorPrefix + chalk.red(` Failed to parse arguments for ${toolName}: ${e.message}`));
            toolResponses.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify({ error: `Invalid arguments format: ${e.message}` })
            });
            continue; // Move to next tool call
          }

          const implementation = toolImplementations[toolName];
          if (implementation) {
            try {
              const result = await implementation(args);
              toolResponses.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify(result)
              });
            } catch (toolError: any) {
              console.error(errorPrefix + chalk.red(` Error during ${toolName} execution: ${toolError.message}`));
              toolResponses.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolName,
                content: JSON.stringify({ error: `Tool execution failed: ${toolError.message}` })
              });
            }
          } else {
            console.warn(errorPrefix + chalk.red(` Tool ${toolName} not implemented.`));
            toolResponses.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify({ error: `Tool ${toolName} not found.` })
            });
          }
        }
        currentMessages.push(...toolResponses);
        // Continue loop to send tool responses back to LLM
      } else {
        // No tool calls, assistant has provided a direct response.
        return currentMessages; // End of this interaction turn
      }
    } catch (error: any) {
      console.error(errorPrefix + chalk.redBright(' Agent loop error:'), error.message);
      // Add an error message to the history for the AI to see, or for user context.
      currentMessages.push({
        role: 'assistant', // Or 'system' if preferred for error reporting
        content: `An error occurred: ${error.message}. The user might need to rephrase or simplify the request.`
      });
      return currentMessages; // Return current messages, including the error, to break the loop.
    }
  }
}

// --- Main CLI Function ---
async function main() {
  if (!OPENROUTER_API_KEY) {
    console.error(errorPrefix + chalk.redBright('FATAL ERROR: OPENROUTER_API_KEY environment variable is not set!'));
    console.log(chalk.yellow('Please set it, e.g., by running: export OPENROUTER_API_KEY="your_actual_api_key"'));
    process.exit(1);
  }

  // Ensure workspace directory exists
  try {
    await fs.mkdir(WORKSPACE_DIRECTORY, { recursive: true });
    console.log(systemPrefix + `Workspace directory: ${chalk.gray(WORKSPACE_DIRECTORY)}`);
  } catch (error: any) {
    console.error(errorPrefix + chalk.redBright(`Failed to create workspace directory '${WORKSPACE_DIRECTORY}': ${error.message}`));
    process.exit(1);
  }

  console.log(chalk.bold.magentaBright('\n======================================'));
  console.log(chalk.bold.magentaBright('🤖 Welcome to File Assistant CLI 🤖'));
  console.log(chalk.bold.magentaBright('======================================'));
  console.log(chalk.cyan('\nAvailable commands:'));
  console.log(chalk.cyan('  /exit  - Exit the application'));
  console.log(chalk.cyan('  /reset - Reset the conversation history'));
  console.log(chalk.cyan('\nWorking with files in: ') + chalk.yellow(WORKSPACE_DIRECTORY_NAME));
  console.log(chalk.cyan('Tip: For complex tasks, break them down or ask the assistant to plan first.\n'));

  let messages: Message[] = [
    {
      role: 'system',
      content: `You are a helpful file assistant operating strictly within a sandboxed workspace directory named '${WORKSPACE_DIRECTORY_NAME}'. Your primary function is to manage files and folders (list, read, write, update, delete, rename) and maintain a 'todo.md' list within this workspace using the provided tools.

Key Instructions:
1.  **Always use tools for actions:** When asked to perform any file/folder operation or todo management, you MUST use the corresponding tool. Do not just state you will do it.
2.  **Workspace only:** All paths for file/folder operations are relative to the '${WORKSPACE_DIRECTORY_NAME}' workspace. You cannot access files outside this sandbox.
3.  **One main operation at a time:** If a user requests multiple distinct file operations (e.g., "create file A and delete folder B"), address them sequentially. You can use multiple tool calls in one response if they are part of a single logical step (e.g., read a file, then write a modified version).
4.  **Clarify ambiguity:** If a request is unclear, ask for clarification.
5.  **Planning with 'think':** For complex requests or multi-step tasks, use the 'think' tool first to outline your plan. This helps in structuring your approach.
6.  **Todo Management:**
    *   Use 'readTodo', 'writeTodo', and 'updateTodoItem' for managing 'todo.md'.
    *   Todo format: \`- [ ] Task description\`, \`- [/] In progress\`, \`- [x] Completed\`, \`- [~] Cancelled\`.
7.  **Be concise but clear:** Summarize actions taken and results. If an error occurs with a tool, report it.
8.  **Continuity:** If a task requires multiple steps/turns, continue until it's complete or the user directs otherwise. You don't need to ask for permission to continue an already assigned multi-step task unless you encounter an issue or ambiguity.
9.  **List files/folders:** Use 'listFiles' tool to inspect directory contents. Default is to list both files and folders in the workspace root.
10. **Error Handling:** If a tool call returns an error, inform the user about the error and suggest potential reasons or next steps. Do not attempt the same failed operation repeatedly without modification or clarification.
`
    }
  ];

  while (true) {
    const { userInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userInput',
        message: 'Your request:',
        prefix: userPrefix,
      }
    ]);

    if (userInput.toLowerCase() === '/exit') {
      console.log(chalk.magentaBright('\nThank you for using File Assistant CLI. Goodbye! 👋'));
      break;
    }
    if (userInput.toLowerCase() === '/reset') {
      console.log(systemPrefix + chalk.yellowBright(' Resetting conversation history...'));
      messages = [messages[0]]; // Keep only the system message
      console.log(systemPrefix + chalk.green(' Conversation reset.'));
      continue;
    }
    if (!userInput.trim()) {
      console.log(chalk.yellow('Please enter a command or question.'));
      continue;
    }

    // Logic for resetting conversation if it's in a bad state or too long
    const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
    const hadRecentError = lastMessage?.role === 'assistant' && lastMessage.content?.toLowerCase().includes('error occurred');
    
    const hasUnresolvedToolCallsInHistory = messages.some(msg =>
        msg.role === 'assistant' && msg.tool_calls &&
        msg.tool_calls.some(call =>
            !messages.some(m => m.role === 'tool' && m.tool_call_id === call.id)
        )
    );

    if (hadRecentError || hasUnresolvedToolCallsInHistory || messages.length > MAX_CONVERSATION_LENGTH) {
      let reason = "";
      if (hadRecentError) reason = "due to a recent error";
      else if (hasUnresolvedToolCallsInHistory) reason = "due to unresolved tool calls";
      else if (messages.length > MAX_CONVERSATION_LENGTH) reason = "conversation is too long";
      
      console.log(systemPrefix + chalk.yellowBright(` Resetting conversation history ${reason}. Starting fresh with your input.`));
      messages = [
        messages[0], // System message
        { role: 'user', content: userInput }
      ];
    } else {
      messages.push({ role: 'user', content: userInput });
    }
    
    // Clean history just before sending if validateConversationHistory made changes
    // This step is more about ensuring the history sent to agentLoop is clean.
    const potentiallyCleanedMessages = validateConversationHistory(messages);
    if (potentiallyCleanedMessages.length < messages.length) {
        console.log(systemPrefix + chalk.yellowBright(' Applied validation cleanup to messages before calling agent.'));
        messages = potentiallyCleanedMessages;
        // If user message was removed by cleanup, we might need to re-add current userInput or re-prompt.
        // For now, this state might be rare if other resets catch issues first.
        // Let's ensure the latest userInput is part of messages if it was cleaned away.
        const lastMsg = messages[messages.length -1];
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userInput) {
            messages.push({ role: 'user', content: userInput });
        }
    }


    const updatedMessages = await agentLoop(messages);
    messages = updatedMessages; // Persist updated messages for next turn

    const finalAssistantMessage = messages[messages.length - 1];
    if (finalAssistantMessage?.role === 'assistant' && finalAssistantMessage.content) {
      console.log(`\n${assistantPrefix} ${chalk.whiteBright(finalAssistantMessage.content)}\n`);
    } else if (finalAssistantMessage?.role === 'assistant' && !finalAssistantMessage.content && finalAssistantMessage.tool_calls) {
      // This case should ideally not happen if agentLoop always results in a final text response or error.
      // It means the AI ended on a tool_call without further textual response.
      console.log(`\n${assistantPrefix} ${chalk.italic.gray('[Assistant ended with tool calls, awaiting next step or error in loop.]')}\n`);
    }
  }
}

main().catch(error => {
  console.error(errorPrefix + chalk.redBright(' CRITICAL APPLICATION ERROR:'), error);
  process.exit(1);
});