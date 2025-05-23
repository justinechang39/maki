import * as fs from 'fs/promises';
import path from 'path';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js';
import { getSafeWorkspacePath } from '../core/utils.js';
import type { Tool } from '../core/types.js';

export const fileTools: Tool[] = [
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
  }
];

export const fileToolImplementations: Record<string, (args: any) => Promise<any>> = {
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
        directory: path.relative(getSafeWorkspacePath(), dirPath) || '.',
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
  }
};