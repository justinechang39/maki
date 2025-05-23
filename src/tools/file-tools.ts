import * as fs from 'fs/promises';
import path from 'path';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js';
import { getSafeWorkspacePath } from '../core/utils.js';
import type { Tool } from '../core/types.js';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const fileTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: `FILE DISCOVERY: List only files within a specified directory. Perfect for finding specific file types, exploring file contents, or understanding what files exist in a location. Use listFolders for directory structure.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `Directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Leave empty or use '.' for workspace root. Shows only files in this directory.`
          },
          extension: {
            type: 'string',
            description: 'Filter by file extension (e.g., "txt", "js", "md"). Omit the dot. Use this to find specific file types quickly.'
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
  },
  {
    type: 'function',
    function: {
      name: 'copyFile',
      description: `DUPLICATION TOOL: Create copies of files while preserving the original. Useful for backups, templates, or creating variations of existing files.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: `Source file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing file.` },
          destinationPath: { type: 'string', description: `Destination file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.` },
          overwrite: { type: 'boolean', description: 'Whether to overwrite destination file if it exists. Default: false.' }
        },
        required: ['sourcePath', 'destinationPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copyFolder',
      description: `DUPLICATION TOOL: Create complete copies of folders and all their contents. Useful for backups, creating project templates, or duplicating directory structures.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: { type: 'string', description: `Source folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing directory.` },
          destinationPath: { type: 'string', description: `Destination folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.` },
          overwrite: { type: 'boolean', description: 'Whether to overwrite destination folder if it exists. Default: false.' }
        },
        required: ['sourcePath', 'destinationPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFileInfo',
      description: `INSPECTION TOOL: Get detailed information about files including size, modification date, permissions, and type. Essential for understanding file properties before operations.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `File or folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must exist.` }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFileSizes',
      description: `SIZE ANALYSIS: Get file sizes for multiple files at once. Perfect for analyzing storage usage, comparing file sizes, or getting size information for a batch of files.`,
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: `Array of file paths within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Each path must be an existing file.`
          }
        },
        required: ['paths']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listFolders',
      description: `FOLDER NAVIGATION: List only directories/folders within a specified path. Perfect for understanding folder structure and navigating between directories. Use this when you specifically need to see the directory structure without files cluttering the view.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `Directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Leave empty or use '.' for workspace root. Shows only subdirectories.`
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getCurrentDirectory',
      description: `LOCATION AWARENESS: Get the current working directory path within the workspace. Essential for understanding your current location and navigating the file system effectively.`,
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchFiles',
      description: `DISCOVERY TOOL: Search for files by name pattern or content. Use for finding files when you don't know exact locations or searching within file contents.`,
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term or pattern to find in filenames or content.' },
          path: { type: 'string', description: `Directory to search within (relative to '${WORKSPACE_DIRECTORY_NAME}'). Searches recursively.` },
          searchContent: { type: 'boolean', description: 'Whether to search inside file contents. Default: false (filename only).' },
          extension: { type: 'string', description: 'Filter results by file extension (e.g., "txt", "js"). Omit the dot.' }
        },
        required: ['query']
      }
    }
  }
];

export const fileToolImplementations: Record<string, (args: any) => Promise<any>> = {
  listFiles: async (args: { path?: string; extension?: string }) => {
    try {
      const dirPath = getSafeWorkspacePath(args.path || '.');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      let files = entries.filter(e => e.isFile()).map(e => e.name);
      if (args.extension) {
        const ext = args.extension.startsWith('.') ? args.extension : `.${args.extension}`;
        files = files.filter(f => f.endsWith(ext));
      }
      
      // Get current relative path for navigation context
      const relativePath = path.relative(getSafeWorkspacePath(), dirPath) || '.';
      const parentPath = relativePath !== '.' ? path.dirname(relativePath) : null;
      
      return {
        success: true,
        directory: relativePath,
        absolutePath: dirPath,
        parentDirectory: parentPath,
        files: files.sort(),
        fileCount: files.length,
        navigation: {
          canGoUp: parentPath !== null,
          upPath: parentPath || '.',
          isRoot: relativePath === '.'
        }
      };
    } catch (error: any) {
      return { error: `Failed to list files: ${error.message}` };
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

  copyFile: async (args: { sourcePath: string; destinationPath: string; overwrite?: boolean }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);
      
      // Check if destination exists and overwrite is not allowed
      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return { error: `Destination file '${args.destinationPath}' already exists. Use overwrite=true to replace.` };
        }
      } catch {
        // File doesn't exist, proceed
      }
      
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.copyFile(safeSrcPath, safeDestPath);
      return { success: true, message: `File copied from '${args.sourcePath}' to '${args.destinationPath}'.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  copyFolder: async (args: { sourcePath: string; destinationPath: string; overwrite?: boolean }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);
      
      // Check if destination exists and overwrite is not allowed
      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return { error: `Destination folder '${args.destinationPath}' already exists. Use overwrite=true to replace.` };
        }
        // Remove existing destination if overwrite is true
        await fs.rm(safeDestPath, { recursive: true, force: true });
      } catch {
        // Folder doesn't exist, proceed
      }
      
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.cp(safeSrcPath, safeDestPath, { recursive: true });
      return { success: true, message: `Folder copied from '${args.sourcePath}' to '${args.destinationPath}'.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getFileInfo: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const stats = await fs.stat(safePath);
      
      return {
        success: true,
        path: args.path,
        size: stats.size,
        type: stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'other',
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        permissions: {
          readable: !!(stats.mode & 0o444),
          writable: !!(stats.mode & 0o222),
          executable: !!(stats.mode & 0o111),
          mode: '0' + (stats.mode & parseInt('777', 8)).toString(8)
        }
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  getFileSizes: async (args: { paths: string[] }) => {
    try {
      const results = [];
      let totalSize = 0;
      
      for (const filePath of args.paths) {
        try {
          const safePath = getSafeWorkspacePath(filePath);
          const stats = await fs.stat(safePath);
          
          if (!stats.isFile()) {
            results.push({
              path: filePath,
              error: 'Not a file (directory or other type)'
            });
          } else {
            results.push({
              path: filePath,
              size: stats.size,
              sizeFormatted: formatBytes(stats.size)
            });
            totalSize += stats.size;
          }
        } catch (error: any) {
          results.push({
            path: filePath,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        files: results,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        fileCount: args.paths.length,
        successCount: results.filter(r => !r.error).length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  listFolders: async (args: { path?: string }) => {
    try {
      const dirPath = getSafeWorkspacePath(args.path || '.');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const folders = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      
      // Get current relative path for navigation context
      const relativePath = path.relative(getSafeWorkspacePath(), dirPath) || '.';
      const parentPath = relativePath !== '.' ? path.dirname(relativePath) : null;
      
      return {
        success: true,
        directory: relativePath,
        absolutePath: dirPath,
        parentDirectory: parentPath,
        folders,
        folderCount: folders.length,
        navigation: {
          canGoUp: parentPath !== null,
          upPath: parentPath || '.',
          isRoot: relativePath === '.'
        }
      };
    } catch (error: any) {
      return { error: `Failed to list folders: ${error.message}` };
    }
  },

  getCurrentDirectory: async () => {
    try {
      const workspacePath = getSafeWorkspacePath();
      const currentProcess = process.cwd();
      const workspaceRelative = path.relative(workspacePath, currentProcess);
      
      // Additional workspace information
      const isInWorkspace = currentProcess.startsWith(workspacePath) || currentProcess === workspacePath;
      const workspaceName = path.basename(workspacePath);
      
      return {
        success: true,
        workspaceName: workspaceName,
        workspacePath: WORKSPACE_DIRECTORY_NAME,
        absolutePath: workspacePath,
        currentPath: workspaceRelative || '.',
        isInWorkspace: isInWorkspace,
        currentDirectory: path.basename(currentProcess)
      };
    } catch (error: any) {
      return { error: `Failed to get current directory: ${error.message}` };
    }
  },

  searchFiles: async (args: { query: string; path?: string; searchContent?: boolean; extension?: string }) => {
    try {
      const searchPath = getSafeWorkspacePath(args.path || '.');
      const results: Array<{ path: string; type: 'filename' | 'content'; line?: number; preview?: string }> = [];
      
      const searchInDirectory = async (dirPath: string, relativePath: string = '') => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryPath = path.join(dirPath, entry.name);
          const entryRelativePath = path.join(relativePath, entry.name);
          
          if (entry.isDirectory()) {
            await searchInDirectory(entryPath, entryRelativePath);
          } else if (entry.isFile()) {
            // Filter by extension if specified
            if (args.extension) {
              const ext = args.extension.startsWith('.') ? args.extension : `.${args.extension}`;
              if (!entry.name.endsWith(ext)) continue;
            }
            
            // Search filename
            if (entry.name.toLowerCase().includes(args.query.toLowerCase())) {
              results.push({
                path: entryRelativePath,
                type: 'filename'
              });
            }
            
            // Search content if requested
            if (args.searchContent) {
              try {
                const content = await fs.readFile(entryPath, 'utf-8');
                const lines = content.split('\n');
                lines.forEach((line, index) => {
                  if (line.toLowerCase().includes(args.query.toLowerCase())) {
                    results.push({
                      path: entryRelativePath,
                      type: 'content',
                      line: index + 1,
                      preview: line.trim().substring(0, 100) + (line.length > 100 ? '...' : '')
                    });
                  }
                });
              } catch {
                // Skip files that can't be read as text
              }
            }
          }
        }
      };
      
      await searchInDirectory(searchPath);
      
      return {
        success: true,
        query: args.query,
        searchPath: args.path || '.',
        results,
        resultCount: results.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};