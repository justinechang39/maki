#!/usr/bin/env node
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url'; // To get __dirname in ESM
import { URL } from 'url'; // <--- ADDED for URL parsing

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
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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'; // Fallback for testing, ensure it's set in env
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MODEL_ID = 'openai/gpt-4.1-mini'; // Updated to a more current model

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE_DIRECTORY_NAME = 'file_assistant_workspace';
const WORKSPACE_DIRECTORY = path.resolve(__dirname, WORKSPACE_DIRECTORY_NAME);

const MAX_CONVERSATION_LENGTH = 100;

// --- Types ---
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Message {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
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
  { // NEW TOOL DEFINITION
    type: 'function',
    function: {
      name: 'fetchWebsiteContent',
      description: 'Fetches the raw text content (primarily HTML or plain text) from a given public URL. Use this to get information from websites. The response will be a string of the page\'s content, which might be HTML code. Content may be truncated if too long (default 10,000 characters). This tool cannot access local files or internal/private network resources.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The public HTTP or HTTPS URL to fetch content from (e.g., "https://www.example.com"). Must be a fully qualified URL.'
          },
          maxLength: {
            type: 'number',
            description: 'Optional. Maximum number of characters to return from the beginning of the content. Defaults to 10000. Min 100, Max 50000.'
          }
        },
        required: ['url']
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
 * Checks if a URL is safe to fetch (public, http/https, not local/private).
 * @param urlString The URL to check.
 * @returns True if the URL is considered safe, false otherwise.
 */
function isSafeUrl(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname;

    // 1. Protocol check (allow http and https)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      console.warn(errorPrefix + chalk.yellow(`isSafeUrl: Disallowed protocol: ${parsedUrl.protocol}`));
      return false;
    }

    // 2. Disallow localhost and loopback
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
      console.warn(errorPrefix + chalk.yellow(`isSafeUrl: Disallowed hostname (localhost/loopback): ${hostname}`));
      return false;
    }

    // 3. Disallow private IP ranges (IPv4 and IPv6 ULA)
    // IPv4: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    // IPv6: fd00::/8 (ULA)
    if (/^10\./.test(hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^fd[0-9a-f]{2}:/i.test(hostname) // Case insensitive for IPv6
       ) {
      console.warn(errorPrefix + chalk.yellow(`isSafeUrl: Disallowed hostname (private IP): ${hostname}`));
      return false;
    }
    
    // 4. Disallow .local TLD (often used for mDNS/Bonjour on local networks)
    if (hostname.endsWith('.local')) {
        console.warn(errorPrefix + chalk.yellow(`isSafeUrl: Disallowed hostname (.local TLD): ${hostname}`));
        return false;
    }

    return true;
  } catch (error) {
    console.warn(errorPrefix + chalk.yellow(`isSafeUrl: Invalid URL format: ${urlString}`));
    return false;
  }
}

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

  let lastValidIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.tool_calls) {
      const hasUnanswered = message.tool_calls.some(call => unansweredCalls.has(call.id));
      if (hasUnanswered) {
        lastValidIndex = i;
        break;
      }
    }
  }
  
  if (lastValidIndex < messages.length) {
      if (lastValidIndex > 0 && messages[lastValidIndex -1].role === 'user') {
          return messages.slice(0, lastValidIndex -1);
      }
      return messages.slice(0, lastValidIndex);
  }

  return messages;
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
      const includeFiles = args.includeFiles !== false;
      const includeFolders = args.includeFolders !== false;

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
      await fs.mkdir(path.dirname(safePath), { recursive: true });
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
        if (readError.code !== 'ENOENT') throw readError;
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
      await fs.rm(safePath, { recursive: !!args.recursive, force: !!args.recursive });
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
  // NEW TOOL IMPLEMENTATION
  fetchWebsiteContent: async (args: { url: string; maxLength?: number }) => {
    let { url, maxLength = 10000 } = args; 
    maxLength = Math.max(100, Math.min(maxLength, 50000)); 

    if (!isSafeUrl(url)) {
      const reason = `Invalid or disallowed URL: ${url}. Must be a public HTTP/HTTPS URL and not point to local or private network resources.`;
      return { error: reason };
    }

    try {
      console.log(toolPrefix + chalk.cyanBright(` Fetching URL: ${url} (max ${maxLength} chars)`));
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); 

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FileAssistantCLI-Agent/1.0 (AI Agent)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          error: `Failed to fetch URL. Status: ${response.status} ${response.statusText}`,
          statusCode: response.status,
          url
        };
      }

      const contentType = response.headers.get('content-type') || 'unknown';
      let textContent = await response.text();
      let message = `Successfully fetched content from ${url}. Content-Type: ${contentType}.`;

      // if (textContent.length > maxLength) {
      //   textContent = textContent.substring(0, maxLength);
      //   message = `Successfully fetched content from ${url}. Content-Type: ${contentType}. Content truncated to ${maxLength} characters.`;
      // }

      return {
        success: true,
        url,
        statusCode: response.status,
        contentType,
        content: textContent,
        message
      };

    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { error: `Request to ${url} timed out after 15 seconds.` };
      }
      console.error(errorPrefix + chalk.red(` Error fetching ${url}: ${error.stack || error.message}`));
      return { error: `Error fetching URL ${url}: ${error.message}. Check server logs for details.` };
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

  const validatedMessages = validateConversationHistory(currentMessages);
  if (validatedMessages.length !== currentMessages.length) {
      console.log(systemPrefix + chalk.yellowBright(' Conversation history was cleaned by validateConversationHistory.'));
      currentMessages = validatedMessages;
  }

  while (true) {
    try {
      console.log(systemPrefix + chalk.cyan(' Calling LLM...'));

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'X-Title': 'File Assistant CLI', 
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
            continue;
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
      } else {
        return currentMessages;
      }
    } catch (error: any) {
      console.error(errorPrefix + chalk.redBright(' Agent loop error:'), error.message);
      currentMessages.push({
        role: 'assistant',
        content: `An error occurred: ${error.message}. The user might need to rephrase or simplify the request.`
      });
      return currentMessages;
    }
  }
}

// --- Main CLI Function ---
async function main() {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk-or-v1-YOUR-KEY-HERE') { // Added a check for placeholder key
    console.error(errorPrefix + chalk.redBright('FATAL ERROR: OPENROUTER_API_KEY environment variable is not set or is a placeholder!'));
    console.log(chalk.yellow('Please set it, e.g., by running: export OPENROUTER_API_KEY="your_actual_api_key"'));
    process.exit(1);
  }

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
      content: `You are a helpful file assistant operating strictly within a sandboxed workspace directory named '${WORKSPACE_DIRECTORY_NAME}'. Your primary function is to manage files and folders (list, read, write, update, delete, rename) and maintain a 'todo.md' list within this workspace using the provided tools. You can also fetch content from public websites.

Key Instructions:
1.  **Always use tools for actions:** When asked to perform any file/folder operation, todo management, or website fetching, you MUST use the corresponding tool. Do not just state you will do it.
2.  **Workspace only:** All paths for file/folder operations are relative to the '${WORKSPACE_DIRECTORY_NAME}' workspace. You cannot access files outside this sandbox.
3.  **One main operation at a time:** If a user requests multiple distinct operations (e.g., "create file A and fetch website B"), address them sequentially. You can use multiple tool calls in one response if they are part of a single logical step.
4.  **Clarify ambiguity:** If a request is unclear, ask for clarification.
5.  **Planning with 'think':** For complex requests or multi-step tasks, use the 'think' tool first to outline your plan. This helps in structuring your approach.
6.  **Todo Management:**
    *   Use 'readTodo', 'writeTodo', and 'updateTodoItem' for managing 'todo.md'.
    *   Todo format: \`- [ ] Task description\`, \`- [/] In progress\`, \`- [x] Completed\`, \`- [~] Cancelled\`.
7.  **Be concise but clear:** Summarize actions taken and results. If an error occurs with a tool, report it.
8.  **Continuity:** If a task requires multiple steps/turns, continue until it's complete or the user directs otherwise. You don't need to ask for permission to continue an already assigned multi-step task unless you encounter an issue or ambiguity.
9.  **List files/folders:** Use 'listFiles' tool to inspect directory contents. Default is to list both files and folders in the workspace root.
10. **Error Handling:** If a tool call returns an error, inform the user about the error and suggest potential reasons or next steps. Do not attempt the same failed operation repeatedly without modification or clarification.
11. **Fetch Website Content:** Use the 'fetchWebsiteContent' tool to retrieve raw content (e.g., HTML, text) from public websites. Provide a full URL (e.g., "https://example.com"). The content might be truncated if it's very long. You will receive the raw data (like HTML source code); you may need to describe how to extract specific information from it or summarize it based on the user's request. This tool CANNOT access local network resources or private IP addresses. Only public HTTP/HTTPS URLs are allowed.
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
      messages = [messages[0]];
      console.log(systemPrefix + chalk.green(' Conversation reset.'));
      continue;
    }
    if (!userInput.trim()) {
      console.log(chalk.yellow('Please enter a command or question.'));
      continue;
    }

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
        messages[0],
        { role: 'user', content: userInput }
      ];
    } else {
      messages.push({ role: 'user', content: userInput });
    }
    
    const potentiallyCleanedMessages = validateConversationHistory(messages);
    if (potentiallyCleanedMessages.length < messages.length) {
        console.log(systemPrefix + chalk.yellowBright(' Applied validation cleanup to messages before calling agent.'));
        messages = potentiallyCleanedMessages;
        const lastMsg = messages[messages.length -1];
        if (!lastMsg || lastMsg.role !== 'user' || lastMsg.content !== userInput) {
            messages.push({ role: 'user', content: userInput });
        }
    }

    const updatedMessages = await agentLoop(messages);
    messages = updatedMessages;

    const finalAssistantMessage = messages[messages.length - 1];
    if (finalAssistantMessage?.role === 'assistant' && finalAssistantMessage.content) {
      console.log(`\n${assistantPrefix} ${chalk.whiteBright(finalAssistantMessage.content)}\n`);
    } else if (finalAssistantMessage?.role === 'assistant' && !finalAssistantMessage.content && finalAssistantMessage.tool_calls) {
      console.log(`\n${assistantPrefix} ${chalk.italic.gray('[Assistant ended with tool calls, awaiting next step or error in loop.]')}\n`);
    }
  }
}

main().catch(error => {
  console.error(errorPrefix + chalk.redBright(' CRITICAL APPLICATION ERROR:'), error);
  process.exit(1);
});