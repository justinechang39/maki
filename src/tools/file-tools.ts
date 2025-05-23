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
      description: `EXPLORATION TOOL: Discover and catalog workspace contents. Use this to understand project structure, find specific file types, or navigate directories. Essential for initial exploration before making changes. Shows both files and folders with detailed counts for better workspace understanding.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `Directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Leave empty or use '.' for workspace root. Use subdirectory names for deeper exploration.`
          },
          extension: {
            type: 'string',
            description: 'Filter by file extension (e.g., "txt", "js", "md"). Omit the dot. Use this to find specific file types quickly.'
          },
          includeFiles: {
            type: 'boolean',
            description: 'Include files in results. Set false to see only folder structure.'
          },
          includeFolders: {
            type: 'boolean',
            description: 'Include folders in results. Set false to see only files.'
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
      description: `CONTENT INSPECTION: Read and examine file contents. Use this to understand existing code, data, or configuration before making modifications. Essential for analyzing current state and planning changes. Returns complete file content as text.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `File path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be an existing file. Use listFiles first if unsure of exact path.`
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
      description: `CONTENT CREATION: Create new files or completely replace existing content. Use for creating new files from scratch or when you need to rewrite an entire file. WARNING: This overwrites existing files completely. For partial edits, use updateFile instead.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `Target file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Creates parent directories automatically if needed.` },
          content: { type: 'string', description: 'Complete file content to write. This will replace any existing content entirely.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateFile',
      description: `PRECISION EDITING: Make targeted changes to existing files without losing other content. Use for surgical edits like adding/modifying specific lines, inserting new sections, or appending content. Preferred over writeFile for preserving existing code while making specific changes.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `Existing file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). File must already exist.` },
          content: { type: 'string', description: 'New content to insert, replace with, or append. Can be multi-line.' },
          operation: {
            type: 'string',
            description: 'Edit operation: "replace" (substitute specific lines), "insert" (add before specified line), "append" (add to file end), "prepend" (add to file beginning)',
            enum: ['replace', 'insert', 'append', 'prepend']
          },
          startLine: { type: 'number', description: 'Line number (1-based) where operation begins. Required for replace/insert operations. Use readFile first to identify correct line numbers.' },
          endLine: { type: 'number', description: 'End line number (1-based, inclusive) for replace operations. Omit to replace only startLine.' }
        },
        required: ['path', 'content', 'operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFile',
      description: `CLEANUP OPERATION: Permanently remove files from workspace. Use with caution as this cannot be undone. Ideal for removing temporary files, outdated content, or cleaning up after operations.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `File path to delete within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). File must exist.` }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createFolder',
      description: `ORGANIZATION TOOL: Create directory structure for better file organization. Automatically creates parent directories if needed. Use to establish project structure or organize content into logical groups.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `New folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.` }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFolder',
      description: `CLEANUP OPERATION: Remove directories from workspace. Set recursive=true to delete non-empty folders and all contents. Use with extreme caution as this permanently removes all nested content.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `Folder path to delete within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing directory.` },
          recursive: { type: 'boolean', description: 'TRUE: Delete folder and ALL contents (dangerous). FALSE: Only delete if empty (safer). Always consider carefully.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFolder',
      description: `REORGANIZATION TOOL: Move/rename directories for better organization. Changes folder path and updates all contained file locations. Useful for restructuring project layout.`,
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: `Current folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must exist.` },
          newPath: { type: 'string', description: `New folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.` }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFile',
      description: `REORGANIZATION TOOL: Move/rename files for better organization or correct naming. Can move files between directories. Updates file location while preserving content.`,
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: `Current file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing file.` },
          newPath: { type: 'string', description: `New file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.` }
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