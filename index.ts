#!/usr/bin/env node
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url'; // To get __dirname in ESM
import { URL } from 'url'; // <--- ADDED for URL parsing

// For colored output (optional, install with: npm install chalk@4.1.2)
// If you prefer not to use chalk, remove these lines and the chalk.xyz calls
import chalk from 'chalk';
import * as csv from 'fast-csv';
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
// openai/gpt-4.1-mini
// anthropic/claude-sonnet-4
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
      description: `Update specific lines in an existing file in the workspace ('${WORKSPACE_DIRECTORY_NAME}') with granular line-based operations.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          content: { type: 'string', description: 'The new content to insert or replace with.' },
          operation: {
            type: 'string',
            description: 'Operation type: "replace" (replace specific lines), "insert" (insert before line), "append" (add to end), or "prepend" (add to beginning).',
            enum: ['replace', 'insert', 'append', 'prepend']
          },
          startLine: { type: 'number', description: 'Starting line number (1-based) for replace/insert operations. Required for replace and insert operations.' },
          endLine: { type: 'number', description: 'Ending line number (1-based, inclusive) for replace operations. If not specified for replace, only startLine is replaced.' }
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
      name: 'parseCSV',
      description: `Parse a CSV file in the workspace ('${WORKSPACE_DIRECTORY_NAME}') and return its structure and data.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers in the first row. Defaults to true.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateCSVCell',
      description: `Update a specific cell in a CSV file by row and column identifiers.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          rowIndex: { type: 'number', description: 'Zero-based row index (excluding headers if present).' },
          column: { type: 'string', description: 'Column name (if headers exist) or zero-based column index as string.' },
          value: { type: 'string', description: 'New value for the cell.' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'rowIndex', 'column', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addCSVRow',
      description: `Add a new row to a CSV file.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          rowData: { type: 'object', description: 'Object with column names as keys and cell values as values.' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'rowData']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'removeCSVRow',
      description: `Remove a row from a CSV file by index.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          rowIndex: { type: 'number', description: 'Zero-based row index (excluding headers if present).' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'rowIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'filterCSV',
      description: `Filter CSV rows based on column criteria and create a new CSV file.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: `Source CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          targetPath: { type: 'string', description: `Target CSV file path where filtered results will be saved.` },
          column: { type: 'string', description: 'Column name to filter by.' },
          operator: { type: 'string', description: 'Filter operator: "equals", "contains", "startsWith", "endsWith", "greaterThan", "lessThan".', enum: ['equals', 'contains', 'startsWith', 'endsWith', 'greaterThan', 'lessThan'] },
          value: { type: 'string', description: 'Value to compare against.' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['sourcePath', 'targetPath', 'column', 'operator', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'sortCSV',
      description: `Sort CSV rows by one or more columns.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          sortColumns: { 
            type: 'array', 
            description: 'Array of column sort specifications.',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: 'Column name to sort by.' },
                direction: { type: 'string', description: 'Sort direction: "asc" or "desc".', enum: ['asc', 'desc'] }
              },
              required: ['column', 'direction']
            }
          },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'sortColumns']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addCSVColumn',
      description: `Add a new column to a CSV file with optional default values.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          columnName: { type: 'string', description: 'Name of the new column.' },
          defaultValue: { type: 'string', description: 'Default value for existing rows. Defaults to empty string.' },
          position: { type: 'number', description: 'Zero-based position to insert the column. Defaults to end.' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'columnName']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'removeCSVColumn',
      description: `Remove a column from a CSV file.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          column: { type: 'string', description: 'Column name to remove.' },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['path', 'column']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'aggregateCSV',
      description: `Perform aggregation operations on CSV data (sum, count, average, min, max) grouped by columns.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: `Source CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').` },
          targetPath: { type: 'string', description: `Target CSV file path where aggregated results will be saved.` },
          groupByColumns: { type: 'array', items: { type: 'string' }, description: 'Columns to group by.' },
          aggregations: {
            type: 'array',
            description: 'Array of aggregation specifications.',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: 'Column to aggregate.' },
                operation: { type: 'string', description: 'Aggregation operation.', enum: ['sum', 'count', 'average', 'min', 'max'] },
                alias: { type: 'string', description: 'Optional alias for the result column.' }
              },
              required: ['column', 'operation']
            }
          },
          hasHeaders: { type: 'boolean', description: 'Whether the CSV file has headers. Defaults to true.' }
        },
        required: ['sourcePath', 'targetPath', 'aggregations']
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

// --- CSV Helper Functions ---

interface CSVRow {
  [key: string]: string | number | boolean | null;
}

/**
 * Parse CSV content from string to structured data
 */
async function parseCSVContent(content: string, hasHeaders: boolean = true): Promise<{ headers: string[]; rows: CSVRow[] }> {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    let headers: string[] = [];
    
    csv.parseString(content, { headers: hasHeaders })
      .on('data', (row) => {
        if (hasHeaders) {
          rows.push(row);
          if (headers.length === 0) {
            headers = Object.keys(row);
          }
        } else {
          rows.push(row);
        }
      })
      .on('headers', (headerArray) => {
        headers = headerArray;
      })
      .on('end', () => {
        if (!hasHeaders && rows.length > 0) {
          // Generate headers if not provided: Column1, Column2, etc.
          headers = Object.keys(rows[0]).map((_, index) => `Column${index + 1}`);
        }
        resolve({ headers, rows });
      })
      .on('error', (error) => reject(error));
  });
}

/**
 * Convert structured data back to CSV string
 */
async function writeCSVContent(headers: string[], rows: CSVRow[], includeHeaders: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    csv.writeToString(rows, { 
      headers: includeHeaders ? headers : false,
      writeHeaders: includeHeaders
    })
    .then(data => resolve(data))
    .catch(error => reject(error));
  });
}

/**
 * Validate if a file appears to be CSV format
 */
function isValidCSVContent(content: string): { valid: boolean; reason?: string } {
  if (!content.trim()) {
    return { valid: false, reason: 'File is empty' };
  }
  
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { valid: false, reason: 'No valid lines found' };
  }
  
  // Check if first few lines have consistent comma count
  const firstLineCommas = (lines[0].match(/,/g) || []).length;
  const inconsistentLines = lines.slice(0, Math.min(5, lines.length)).filter(line => 
    (line.match(/,/g) || []).length !== firstLineCommas
  );
  
  if (inconsistentLines.length > 0) {
    return { valid: false, reason: 'Inconsistent number of columns detected' };
  }
  
  return { valid: true };
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
  updateFile: async (args: { path: string; content: string; operation: 'replace' | 'insert' | 'append' | 'prepend'; startLine?: number; endLine?: number }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      let existingContent = '';
      
      try {
        existingContent = await fs.readFile(safePath, 'utf-8');
      } catch (readError: any) {
        if (readError.code !== 'ENOENT') throw readError;
        // File doesn't exist, create it for append/prepend operations
        if (args.operation === 'append' || args.operation === 'prepend') {
          existingContent = '';
        } else {
          return { error: `File '${args.path}' does not exist. Cannot perform ${args.operation} operation.` };
        }
      }

      const lines = existingContent.split('\n');
      let newContent = '';

      switch (args.operation) {
        case 'replace':
          if (args.startLine === undefined) {
            return { error: 'startLine is required for replace operation.' };
          }
          if (args.startLine < 1 || args.startLine > lines.length) {
            return { error: `Invalid startLine ${args.startLine}. File has ${lines.length} lines.` };
          }
          
          const endLine = args.endLine || args.startLine;
          if (endLine < args.startLine || endLine > lines.length) {
            return { error: `Invalid endLine ${endLine}. Must be >= startLine and <= ${lines.length}.` };
          }
          
          const newLines = args.content.split('\n');
          lines.splice(args.startLine - 1, endLine - args.startLine + 1, ...newLines);
          newContent = lines.join('\n');
          break;

        case 'insert':
          if (args.startLine === undefined) {
            return { error: 'startLine is required for insert operation.' };
          }
          if (args.startLine < 1 || args.startLine > lines.length + 1) {
            return { error: `Invalid startLine ${args.startLine}. Valid range is 1 to ${lines.length + 1}.` };
          }
          
          const insertLines = args.content.split('\n');
          lines.splice(args.startLine - 1, 0, ...insertLines);
          newContent = lines.join('\n');
          break;

        case 'append':
          newContent = existingContent + (existingContent && !existingContent.endsWith('\n') ? '\n' : '') + args.content;
          break;

        case 'prepend':
          newContent = args.content + (args.content && !args.content.endsWith('\n') ? '\n' : '') + existingContent;
          break;

        default:
          return { error: `Unsupported operation: ${args.operation}` };
      }

      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      const operationDesc = args.operation === 'replace' 
        ? `replaced lines ${args.startLine}-${args.endLine || args.startLine}`
        : args.operation === 'insert'
        ? `inserted content at line ${args.startLine}`
        : `${args.operation}ed content`;
        
      return { 
        success: true, 
        message: `File '${args.path}' updated successfully (${operationDesc}).`,
        linesModified: args.operation === 'replace' ? (args.endLine || args.startLine!) - args.startLine! + 1 : undefined
      };
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
  },
  
  // CSV Tool Implementations
  parseCSV: async (args: { path: string; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const validation = isValidCSVContent(content);
      if (!validation.valid) {
        return { error: `Invalid CSV format: ${validation.reason}` };
      }
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      return {
        success: true,
        path: args.path,
        headers,
        rowCount: rows.length,
        columnCount: headers.length,
        preview: rows.slice(0, 5), // First 5 rows for preview
        structure: headers.map(header => ({
          name: header,
          sampleValues: rows.slice(0, 3).map(row => row[header]).filter(val => val !== null && val !== '')
        }))
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  updateCSVCell: async (args: { path: string; rowIndex: number; column: string; value: string; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      if (args.rowIndex < 0 || args.rowIndex >= rows.length) {
        return { error: `Invalid row index ${args.rowIndex}. File has ${rows.length} rows.` };
      }
      
      // Determine column identifier
      let columnKey = args.column;
      if (hasHeaders && !headers.includes(args.column)) {
        // Try to parse as numeric index
        const colIndex = parseInt(args.column, 10);
        if (isNaN(colIndex) || colIndex < 0 || colIndex >= headers.length) {
          return { error: `Invalid column '${args.column}'. Available columns: ${headers.join(', ')}` };
        }
        columnKey = headers[colIndex];
      }
      
      // Update the cell
      rows[args.rowIndex][columnKey] = args.value;
      
      // Write back to file
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Updated cell at row ${args.rowIndex}, column '${columnKey}' to '${args.value}'`
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  addCSVRow: async (args: { path: string; rowData: Record<string, any>; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      // Validate row data has all required columns
      if (hasHeaders) {
        const missingColumns = headers.filter(header => !(header in args.rowData));
        const extraColumns = Object.keys(args.rowData).filter(key => !headers.includes(key));
        
        if (missingColumns.length > 0) {
          // Fill missing columns with empty strings
          missingColumns.forEach(col => args.rowData[col] = '');
        }
        if (extraColumns.length > 0) {
          return { error: `Unknown columns: ${extraColumns.join(', ')}. Available columns: ${headers.join(', ')}` };
        }
      }
      
      rows.push(args.rowData);
      
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Added new row. File now has ${rows.length} rows.`,
        newRowIndex: rows.length - 1
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  removeCSVRow: async (args: { path: string; rowIndex: number; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      if (args.rowIndex < 0 || args.rowIndex >= rows.length) {
        return { error: `Invalid row index ${args.rowIndex}. File has ${rows.length} rows.` };
      }
      
      const removedRow = rows.splice(args.rowIndex, 1)[0];
      
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Removed row ${args.rowIndex}. File now has ${rows.length} rows.`,
        removedRow
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  filterCSV: async (args: { sourcePath: string; targetPath: string; column: string; operator: string; value: string; hasHeaders?: boolean }) => {
    try {
      const sourceSafePath = getSafeWorkspacePath(args.sourcePath);
      const targetSafePath = getSafeWorkspacePath(args.targetPath);
      const content = await fs.readFile(sourceSafePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      if (hasHeaders && !headers.includes(args.column)) {
        return { error: `Column '${args.column}' not found. Available columns: ${headers.join(', ')}` };
      }
      
      const filteredRows = rows.filter(row => {
        const cellValue = String(row[args.column] || '');
        const filterValue = args.value;
        
        switch (args.operator) {
          case 'equals':
            return cellValue === filterValue;
          case 'contains':
            return cellValue.includes(filterValue);
          case 'startsWith':
            return cellValue.startsWith(filterValue);
          case 'endsWith':
            return cellValue.endsWith(filterValue);
          case 'greaterThan':
            return parseFloat(cellValue) > parseFloat(filterValue);
          case 'lessThan':
            return parseFloat(cellValue) < parseFloat(filterValue);
          default:
            return false;
        }
      });
      
      const newContent = await writeCSVContent(headers, filteredRows, hasHeaders);
      await fs.mkdir(path.dirname(targetSafePath), { recursive: true });
      await fs.writeFile(targetSafePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Filtered ${rows.length} rows to ${filteredRows.length} rows. Saved to '${args.targetPath}'`,
        originalRows: rows.length,
        filteredRows: filteredRows.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  sortCSV: async (args: { path: string; sortColumns: Array<{ column: string; direction: 'asc' | 'desc' }>; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      // Validate sort columns
      for (const sortCol of args.sortColumns) {
        if (hasHeaders && !headers.includes(sortCol.column)) {
          return { error: `Column '${sortCol.column}' not found. Available columns: ${headers.join(', ')}` };
        }
      }
      
      // Sort rows
      rows.sort((a, b) => {
        for (const sortCol of args.sortColumns) {
          const aVal = String(a[sortCol.column] || '');
          const bVal = String(b[sortCol.column] || '');
          
          // Try numeric comparison first
          const aNum = parseFloat(aVal);
          const bNum = parseFloat(bVal);
          let comparison = 0;
          
          if (!isNaN(aNum) && !isNaN(bNum)) {
            comparison = aNum - bNum;
          } else {
            comparison = aVal.localeCompare(bVal);
          }
          
          if (comparison !== 0) {
            return sortCol.direction === 'desc' ? -comparison : comparison;
          }
        }
        return 0;
      });
      
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Sorted ${rows.length} rows by ${args.sortColumns.map(c => `${c.column} (${c.direction})`).join(', ')}`
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  addCSVColumn: async (args: { path: string; columnName: string; defaultValue?: string; position?: number; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      if (headers.includes(args.columnName)) {
        return { error: `Column '${args.columnName}' already exists.` };
      }
      
      const defaultValue = args.defaultValue || '';
      const position = args.position !== undefined ? Math.max(0, Math.min(args.position, headers.length)) : headers.length;
      
      // Add column to headers
      headers.splice(position, 0, args.columnName);
      
      // Add default values to all rows
      rows.forEach(row => {
        row[args.columnName] = defaultValue;
      });
      
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Added column '${args.columnName}' at position ${position} with default value '${defaultValue}'`
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  removeCSVColumn: async (args: { path: string; column: string; hasHeaders?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      if (!headers.includes(args.column)) {
        return { error: `Column '${args.column}' not found. Available columns: ${headers.join(', ')}` };
      }
      
      // Remove column from headers
      const columnIndex = headers.indexOf(args.column);
      headers.splice(columnIndex, 1);
      
      // Remove column from all rows
      rows.forEach(row => {
        delete row[args.column];
      });
      
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Removed column '${args.column}'. File now has ${headers.length} columns.`
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  aggregateCSV: async (args: { sourcePath: string; targetPath: string; groupByColumns?: string[]; aggregations: Array<{ column: string; operation: string; alias?: string }>; hasHeaders?: boolean }) => {
    try {
      const sourceSafePath = getSafeWorkspacePath(args.sourcePath);
      const targetSafePath = getSafeWorkspacePath(args.targetPath);
      const content = await fs.readFile(sourceSafePath, 'utf-8');
      
      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);
      
      // Validate columns
      const allColumns = (args.groupByColumns || []).concat(args.aggregations.map(a => a.column));
      for (const col of allColumns) {
        if (hasHeaders && !headers.includes(col)) {
          return { error: `Column '${col}' not found. Available columns: ${headers.join(', ')}` };
        }
      }
      
      // Group rows
      const groups: Record<string, CSVRow[]> = {};
      const groupByColumns = args.groupByColumns || [];
      
      if (groupByColumns.length === 0) {
        // No grouping, aggregate all rows
        groups['all'] = rows;
      } else {
        rows.forEach(row => {
          const groupKey = groupByColumns.map(col => String(row[col] || '')).join('|');
          if (!groups[groupKey]) groups[groupKey] = [];
          groups[groupKey].push(row);
        });
      }
      
      // Perform aggregations
      const resultRows: CSVRow[] = [];
      const resultHeaders = [...groupByColumns];
      
      // Add aggregation columns to headers
      args.aggregations.forEach(agg => {
        const columnName = agg.alias || `${agg.operation}_${agg.column}`;
        resultHeaders.push(columnName);
      });
      
      for (const [groupKey, groupRows] of Object.entries(groups)) {
        const resultRow: CSVRow = {};
        
        // Add group by values
        if (groupByColumns.length > 0) {
          const groupValues = groupKey.split('|');
          groupByColumns.forEach((col, index) => {
            resultRow[col] = groupValues[index];
          });
        }
        
        // Calculate aggregations
        args.aggregations.forEach(agg => {
          const columnName = agg.alias || `${agg.operation}_${agg.column}`;
          const values = groupRows.map(row => parseFloat(String(row[agg.column] || '0'))).filter(v => !isNaN(v));
          
          switch (agg.operation) {
            case 'sum':
              resultRow[columnName] = values.reduce((sum, val) => sum + val, 0);
              break;
            case 'count':
              resultRow[columnName] = groupRows.length;
              break;
            case 'average':
              resultRow[columnName] = values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : 0;
              break;
            case 'min':
              resultRow[columnName] = values.length > 0 ? Math.min(...values) : 0;
              break;
            case 'max':
              resultRow[columnName] = values.length > 0 ? Math.max(...values) : 0;
              break;
          }
        });
        
        resultRows.push(resultRow);
      }
      
      const newContent = await writeCSVContent(resultHeaders, resultRows, hasHeaders);
      await fs.mkdir(path.dirname(targetSafePath), { recursive: true });
      await fs.writeFile(targetSafePath, newContent, 'utf-8');
      
      return {
        success: true,
        message: `Aggregated ${rows.length} rows into ${resultRows.length} groups. Saved to '${args.targetPath}'`,
        originalRows: rows.length,
        aggregatedRows: resultRows.length,
        operations: args.aggregations.map(a => `${a.operation}(${a.column})`)
      };
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
            // Debug: log the raw arguments
            console.log(toolPrefix + chalk.gray(` Raw arguments: "${toolCall.function.arguments}"`));
            
            // Handle empty arguments for tools that don't require parameters
            const argumentsStr = toolCall.function.arguments.trim();
            if (!argumentsStr || argumentsStr === '') {
              args = {};
            } else {
              args = JSON.parse(argumentsStr);
            }
          } catch (e: any) {
            console.error(errorPrefix + chalk.red(` Failed to parse arguments for ${toolName}: ${e.message}`));
            console.error(errorPrefix + chalk.red(` Raw arguments were: "${toolCall.function.arguments}"`));
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
6.  **File Operations:**
    *   Use 'writeFile' to create new files or completely replace existing files.
    *   Use 'updateFile' for granular modifications:
        - 'replace' operation: Replace specific lines (requires startLine, optionally endLine)
        - 'insert' operation: Insert content before a specific line (requires startLine)
        - 'append' operation: Add content to the end of the file
        - 'prepend' operation: Add content to the beginning of the file
    *   Always use 'readFile' first to understand file content before making updates.
7.  **Todo Management:**
    *   Use 'readTodo', 'writeTodo', and 'updateTodoItem' for managing 'todo.md'.
    *   Todo format: \`- [ ] Task description\`, \`- [/] In progress\`, \`- [x] Completed\`, \`- [~] Cancelled\`.
8.  **Be concise but clear:** Summarize actions taken and results. If an error occurs with a tool, report it.
9.  **Continuity:** If a task requires multiple steps/turns, continue until it's complete or the user directs otherwise. You don't need to ask for permission to continue an already assigned multi-step task unless you encounter an issue or ambiguity.
10. **List files/folders:** Use 'listFiles' tool to inspect directory contents. Default is to list both files and folders in the workspace root.
11. **Error Handling:** If a tool call returns an error, inform the user about the error and suggest potential reasons or next steps. Do not attempt the same failed operation repeatedly without modification or clarification.
12. **CSV Data Manipulation:**
    *   Use 'parseCSV' to analyze CSV structure and preview data before other operations.
    *   Use 'updateCSVCell' for single cell updates by row index and column name/index.
    *   Use 'addCSVRow'/'removeCSVRow' for row-level operations.
    *   Use 'addCSVColumn'/'removeCSVColumn' for column-level operations.
    *   Use 'filterCSV' to create filtered subsets (saves to new file).
    *   Use 'sortCSV' to sort by one or multiple columns with direction.
    *   Use 'aggregateCSV' for grouping and calculations (sum, count, avg, min, max).
    *   Always specify 'hasHeaders' parameter correctly (defaults to true).
    *   Column references can be by name (if headers exist) or zero-based index.
13. **Fetch Website Content:** Use the 'fetchWebsiteContent' tool to retrieve raw content (e.g., HTML, text) from public websites. Provide a full URL (e.g., "https://example.com"). The content might be truncated if it's very long. You will receive the raw data (like HTML source code); you may need to describe how to extract specific information from it or summarize it based on the user's request. This tool CANNOT access local network resources or private IP addresses. Only public HTTP/HTTPS URLs are allowed.
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