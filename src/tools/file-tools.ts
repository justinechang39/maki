import * as fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js'; // Assuming these exist
import { getSafeWorkspacePath } from '../core/utils.js';   // Assuming these exist
import type { Tool } from '../core/types.js';             // Assuming these exist

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
      description: `FILE DISCOVERY: List only files within a specified directory (non-recursive). Perfect for exploring immediate file contents. For recursive searching or advanced filtering across subdirectories, use findFiles instead.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `Directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Leave empty or use '.' for workspace root. Shows only files in this directory.`
          },
          extension: {
            type: 'string',
            description: 'Filter by file extension (e.g., "txt", "js", "md"). Omit the dot. For multiple extensions or recursive search, use findFiles.'
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
            description: `File path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be an existing file. Use listFiles or findFiles first if unsure of exact path.`
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
      description: `PRECISION EDITING: Make targeted changes to existing files without losing other content. Use for surgical edits like adding/modifying specific lines, inserting new sections, or appending content. For 'append' or 'prepend', the file will be created if it doesn't exist. For 'replace' or 'insert', the file must already exist. Preferred over writeFile for preserving existing code while making specific changes.`,
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: `File path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}').` },
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
      description: `INSPECTION TOOL: Get detailed information about a file or folder including size, modification date, permissions, and type. Essential for understanding properties before operations.`,
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
      description: `FOLDER NAVIGATION: List only directories/folders within a specified path (non-recursive). Perfect for understanding folder structure and navigating between directories. Use this when you specifically need to see the directory structure without files cluttering the view. For recursive search, use findFiles.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `Directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Leave empty or use '.' for workspace root. Shows only subdirectories in this directory.`
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
      description: `WORKSPACE AWARENESS: Get information about the main workspace directory configuration. Essential for understanding the project's root context. Note: This provides information about the defined workspace, not the OS current working directory.`,
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
      name: 'findFiles',
      description: `POWERFUL RECURSIVE SEARCH TOOL: Fast file and folder discovery using ripgrep. Use this to find files/folders by name patterns, search file contents, or locate specific code patterns. Perfect for code navigation and discovery tasks. Use "both" or "all" for searchType to be efficient.`,
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: `Search term. For filenames/foldernames: use simple text (e.g., "user", "service", which becomes *user*/*service*) or glob patterns (e.g., "*.ts", "api/v?"). For content: search for exact text or regex patterns. If omitted when 'fileTypes' are specified (for 'files' or 'folders' searchType), it defaults to finding all items of those types (like pattern: "*").`
          },
          searchType: {
            type: 'string',
            enum: ['files', 'content', 'folders', 'both', 'all'],
            description: 'Specify search target: "files" (names only), "content" (inside files), "folders" (names only). Use "both" (files & content) or "all" (files, content, & folders) for comprehensive searches to reduce multiple calls. Default: "files".'
          },
          path: {
            type: 'string',
            description: `Directory to search within (relative to '${WORKSPACE_DIRECTORY_NAME}'). Defaults to workspace root. Searches recursively through subdirectories.`
          },
          fileTypes: {
            type: 'string',
            description: 'Filter by file extensions (e.g., "js,ts,md", "png,jpg"). Omit the dot. Comma-separated for multiple. Leave empty for all types. For common image types, use: "png,jpg,jpeg,gif,webp,svg,bmp,tiff".'
          },
          ignoreCase: {
            type: 'boolean',
            description: 'Whether to ignore case sensitivity in search. Default: true for broader matches.'
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return. Default: 50. Use smaller numbers for focused searches.'
          },
          includeHidden: {
            type: 'boolean',
            description: 'Whether to include hidden files/directories (starting with .). Default: false.'
          }
        },
        required: [] // Pattern OR fileTypes are effectively required, validated in implementation.
      }
    }
  }
];

export const fileToolImplementations: Record<string, (args: any) => Promise<any>> = {
  listFiles: async (args: { path?: string; extension?: string }) => {
    try {
      const dirPath = getSafeWorkspacePath(args.path || '.');
      let files: string[] = [];

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      files = entries.filter(e => e.isFile()).map(e => e.name);

      if (args.extension) {
        const ext = args.extension.startsWith('.') ? args.extension : `.${args.extension}`;
        files = files.filter(f => f.endsWith(ext));
      }

      const relativePathToCurrentDir = path.relative(getSafeWorkspacePath(), dirPath) || '.';
      const isRoot = relativePathToCurrentDir === '.';
      const parentDirRelativePath = !isRoot ? path.dirname(relativePathToCurrentDir) : null;

      return {
        success: true,
        directory: relativePathToCurrentDir,
        absolutePath: dirPath,
        parentDirectory: parentDirRelativePath,
        files: files.sort(),
        fileCount: files.length,
        searchMode: 'current directory only',
        extensionFilter: args.extension || 'all files',
        navigation: {
          canGoUp: !isRoot,
          upPath: parentDirRelativePath || '.',
          isRoot: isRoot
        }
      };
    } catch (error: any) {
      return {
        error: `Failed to list files: ${error.message}`,
        searchPath: args.path || '.',
        extension: args.extension || 'all files',
      };
    }
  },

  readFile: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');
      return { success: true, path: args.path, content };
    } catch (error: any) {
      return { error: `Failed to read file '${args.path}': ${error.message}` };
    }
  },

  writeFile: async (args: { path: string; content: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, args.content, 'utf-8');
      return { success: true, message: `File '${args.path}' written successfully.` };
    } catch (error: any) {
      return { error: `Failed to write file '${args.path}': ${error.message}` };
    }
  },

  updateFile: async (args: { path: string; content: string; operation: 'replace' | 'insert' | 'append' | 'prepend'; startLine?: number; endLine?: number }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      let existingContent = '';

      try {
        existingContent = await fs.readFile(safePath, 'utf-8');
      } catch (readError: any) {
        if (readError.code === 'ENOENT') {
          if (args.operation === 'append' || args.operation === 'prepend') {
            existingContent = ''; // File will be created
          } else {
            return { error: `File '${args.path}' does not exist. Cannot perform '${args.operation}' operation as it requires an existing file.` };
          }
        } else {
          throw readError; // Other read error
        }
      }

      const lines = existingContent.split('\n');
      let newContent = '';

      switch (args.operation) {
        case 'replace':
          if (args.startLine === undefined) {
            return { error: 'startLine is required for replace operation.' };
          }
          if (args.startLine < 1) { // Simplified: startLine must be at least 1
             return { error: `Invalid startLine ${args.startLine}. Must be 1 or greater.`};
          }
          
          const endLine = args.endLine || args.startLine;
          if (endLine < args.startLine) {
             return { error: `Invalid endLine ${endLine}. Must be >= startLine.`};
          }
          // Allow startLine/endLine to go slightly beyond lines.length if replacing empty lines at end or effectively appending.
          // This logic can be complex. The core idea is to replace what's there.
          // If startLine > lines.length, it means we are "replacing" non-existent lines, which is like appending.
          
          const newLines = args.content.split('\n');
          if (args.startLine > lines.length) { // "Replacing" after the last actual line
            while(lines.length < args.startLine -1) lines.push(''); // Pad with empty lines if needed
            lines.push(...newLines);
          } else {
            // Ensure endLine does not go excessively beyond existing lines for replacement
            const actualEndLine = Math.min(endLine, lines.length);
            lines.splice(args.startLine - 1, actualEndLine - (args.startLine - 1), ...newLines);
          }
          newContent = lines.join('\n');
          break;

        case 'insert':
          if (args.startLine === undefined) {
            return { error: 'startLine is required for insert operation.' };
          }
          if (args.startLine < 1 || args.startLine > lines.length + 1) { // Can insert at line after last line
            return { error: `Invalid startLine ${args.startLine}. Valid range is 1 to ${lines.length + 1}.` };
          }
          
          const insertLines = args.content.split('\n');
          lines.splice(args.startLine - 1, 0, ...insertLines);
          newContent = lines.join('\n');
          break;

        case 'append':
          newContent = existingContent + (existingContent && !existingContent.endsWith('\n') && args.content ? '\n' : '') + args.content;
          break;

        case 'prepend':
          newContent = args.content + (args.content && !args.content.endsWith('\n') && existingContent ? '\n' : '') + existingContent;
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
        linesAffected: args.operation === 'replace' 
          ? (args.endLine || args.startLine!) - args.startLine! + 1 
          : args.content.split('\n').length
      };
    } catch (error: any) {
      return { error: `Failed to update file '${args.path}': ${error.message}` };
    }
  },

  deleteFile: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.unlink(safePath);
      return { success: true, message: `File '${args.path}' deleted successfully.` };
    } catch (error: any) {
      return { error: `Failed to delete file '${args.path}': ${error.message}` };
    }
  },

  createFolder: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.mkdir(safePath, { recursive: true });
      return { success: true, message: `Folder '${args.path}' created successfully.` };
    } catch (error: any) {
      return { error: `Failed to create folder '${args.path}': ${error.message}` };
    }
  },

  deleteFolder: async (args: { path: string; recursive?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.rm(safePath, { recursive: !!args.recursive, force: !!args.recursive });
      return { success: true, message: `Folder '${args.path}' deleted successfully.` };
    } catch (error: any) {
      return { error: `Failed to delete folder '${args.path}': ${error.message}` };
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
      return { error: `Failed to rename folder '${args.oldPath}': ${error.message}` };
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
      return { error: `Failed to rename file '${args.oldPath}': ${error.message}` };
    }
  },

  copyFile: async (args: { sourcePath: string; destinationPath: string; overwrite?: boolean }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);
      
      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return { error: `Destination file '${args.destinationPath}' already exists. Use overwrite=true to replace.` };
        }
      } catch { /* File doesn't exist, proceed */ }
      
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.copyFile(safeSrcPath, safeDestPath);
      return { success: true, message: `File copied from '${args.sourcePath}' to '${args.destinationPath}'.` };
    } catch (error: any) {
      return { error: `Failed to copy file '${args.sourcePath}': ${error.message}` };
    }
  },

  copyFolder: async (args: { sourcePath: string; destinationPath: string; overwrite?: boolean }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);
      
      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return { error: `Destination folder '${args.destinationPath}' already exists. Use overwrite=true to replace.` };
        }
        await fs.rm(safeDestPath, { recursive: true, force: true });
      } catch { /* Folder doesn't exist, proceed */ }
      
      // fs.cp needs the destination parent to exist, but not the destination itself if it's a directory copy.
      // If safeDestPath is 'a/b/c' and we are copying a folder 'src_folder' to 'a/b/c', then 'a/b' must exist.
      // If 'c' exists and is a file, fs.cp errors. If 'c' exists and is a dir, fs.cp copies *into* it.
      // To ensure we replace 'c' if it's a dir and overwrite is true, we already rm'd it.
      // So, now we ensure parent of safeDestPath exists.
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.cp(safeSrcPath, safeDestPath, { recursive: true });
      return { success: true, message: `Folder copied from '${args.sourcePath}' to '${args.destinationPath}'.` };
    } catch (error: any) {
      return { error: `Failed to copy folder '${args.sourcePath}': ${error.message}` };
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
        sizeFormatted: formatBytes(stats.size),
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
      return { error: `Failed to get info for '${args.path}': ${error.message}` };
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
            results.push({ path: filePath, error: 'Not a file' });
          } else {
            results.push({ path: filePath, size: stats.size, sizeFormatted: formatBytes(stats.size) });
            totalSize += stats.size;
          }
        } catch (error: any) {
          results.push({ path: filePath, error: error.message });
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
      return { error: `An unexpected error occurred while getting file sizes: ${error.message}` };
    }
  },

  listFolders: async (args: { path?: string }) => {
    try {
      const dirPath = getSafeWorkspacePath(args.path || '.');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const folders = entries.filter(e => e.isDirectory()).map(e => e.name).sort();
      
      const relativePathToCurrentDir = path.relative(getSafeWorkspacePath(), dirPath) || '.';
      const isRoot = relativePathToCurrentDir === '.';
      const parentDirRelativePath = !isRoot ? path.dirname(relativePathToCurrentDir) : null;
      
      return {
        success: true,
        directory: relativePathToCurrentDir,
        absolutePath: dirPath,
        parentDirectory: parentDirRelativePath,
        folders,
        folderCount: folders.length,
        navigation: {
          canGoUp: !isRoot,
          upPath: parentDirRelativePath || '.',
          isRoot: isRoot
        }
      };
    } catch (error: any) {
      return { error: `Failed to list folders in '${args.path || '.'}': ${error.message}` };
    }
  },

  getCurrentDirectory: async () => {
    try {
      const workspaceRootPath = getSafeWorkspacePath(); 
      const workspaceName = path.basename(workspaceRootPath);
      
      return {
        success: true,
        workspaceName: workspaceName,
        workspaceRootConstant: WORKSPACE_DIRECTORY_NAME, 
        absoluteWorkspacePath: workspaceRootPath,
        message: `The primary workspace is '${workspaceName}'. All tool paths are relative to this root: '${workspaceRootPath}'. The constant name for the workspace dir is '${WORKSPACE_DIRECTORY_NAME}'.`
      };
    } catch (error: any) {
      return { error: `Failed to get workspace directory information: ${error.message}` };
    }
  },

  findFiles: async (args: { 
    pattern?: string; 
    searchType?: 'files' | 'content' | 'folders' | 'both' | 'all'; 
    path?: string; 
    fileTypes?: string;
    ignoreCase?: boolean; 
    maxResults?: number;
    includeHidden?: boolean;
  }) => {
    try {
      const searchPath = getSafeWorkspacePath(args.path || '.'); // CWD for ripgrep & base for searchFolders
      const searchType = args.searchType || 'files';
      const ignoreCase = args.ignoreCase !== false; 
      const maxResults = args.maxResults || 50;
      const includeHidden = args.includeHidden || false;
      
      let pattern = args.pattern;
      const activeFileTypes = args.fileTypes 
          ? args.fileTypes.split(',').map(t => t.trim().replace(/^\./, '')).filter(t => t) 
          : [];

      if (!pattern && activeFileTypes.length > 0 && (searchType === 'files' || searchType === 'folders' || searchType === 'both' || searchType === 'all')) {
        pattern = '*'; 
      }
      
      if (!pattern && activeFileTypes.length === 0) {
        return { 
          error: 'A search pattern is required, or fileTypes must be specified for file/folder name searches.',
          searchPath: args.path || '.',
          searchType
        };
      }
      // From here, `pattern` should be defined if needed by the search type logic.

      const results: Array<{
        path: string; 
        type: 'filename' | 'content' | 'folder';
        line?: number;
        preview?: string;
        match?: string; 
      }> = [];

      // Common folders to ignore for the JS-based searchFolders fallback. Ripgrep handles its own ignores.
      const ignoredFoldersForJsSearch = [
        'node_modules', '.git', '.svn', '.hg', '.bzr',
        '.vscode', '.idea', 'dist', 'build', 'out',
        'coverage', '.nyc_output', 'tmp', 'temp',
        '.cache', '.next', '.nuxt', 'vendor', '__pycache__'
      ];

      // Ripgrep for Filenames
      if ((searchType === 'files' || searchType === 'both' || searchType === 'all') && results.length < maxResults) {
        const filenameSearchArgs: string[] = ['--files'];
        if (!includeHidden) filenameSearchArgs.push('--no-hidden');
        else filenameSearchArgs.push('--hidden'); // Explicitly include if requested

        activeFileTypes.forEach(ext => filenameSearchArgs.push('--glob', `*.${ext}`));
        
        if (pattern && pattern !== '*') {
            const globPattern = (pattern.includes('*') || pattern.includes('?') || pattern.includes('['))
                                ? pattern
                                : `*${pattern}*`; // Wrap simple patterns for contains-like behavior
            filenameSearchArgs.push('--glob', globPattern);
        }
        
        try {
          const filenameResultsOutput = await runRipgrep(filenameSearchArgs, searchPath);
          filenameResultsOutput.split('\n').forEach(line => {
            if (line.trim() && results.length < maxResults) {
              const absoluteMatchPath = path.resolve(searchPath, line.trim());
              results.push({
                path: path.relative(getSafeWorkspacePath(), absoluteMatchPath),
                type: 'filename'
              });
            }
          });
        } catch (error: any) {
          console.warn(`Ripgrep filename search failed (pattern: "${pattern}", path: "${args.path || '.'}"): ${error.message}. Consider fallback if no other results.`);
        }
      }
      
      // Ripgrep for Content
      if ((searchType === 'content' || searchType === 'both' || searchType === 'all') && results.length < maxResults && pattern && pattern !== '*') {
        const contentArgs: string[] = [];
        if (ignoreCase) contentArgs.push('--ignore-case'); // More common rg flag
        if (!includeHidden) contentArgs.push('--no-hidden');
        else contentArgs.push('--hidden');

        activeFileTypes.forEach(ext => contentArgs.push('--glob', `*.${ext}`));
        
        contentArgs.push('--line-number'); // rg flag for line numbers
        contentArgs.push('--'); 
        contentArgs.push(pattern);

        try {
          const contentResultsOutput = await runRipgrep(contentArgs, searchPath);
          contentResultsOutput.split('\n').forEach(line => {
            if (line.trim() && results.length < maxResults) {
              const parts = line.match(/^([^:]+):(\d+):(.*)/); 
              if (parts) {
                const rawFilePath = parts[1];
                const lineNum = parts[2];
                const contentPreview = parts[3];
                
                const absoluteMatchPath = path.resolve(searchPath, rawFilePath.trim());
                const relativeMatchPath = path.relative(getSafeWorkspacePath(), absoluteMatchPath);

                results.push({
                  path: relativeMatchPath,
                  type: 'content',
                  line: parseInt(lineNum, 10),
                  preview: contentPreview.trim().substring(0, 150) + (contentPreview.length > 150 ? '...' : ''),
                  match: contentPreview.trim()
                });
              }
            }
          });
        } catch (error: any) {
          console.warn(`Ripgrep content search failed (pattern: "${pattern}", path: "${args.path || '.'}"): ${error.message}. Consider fallback if no other results.`);
        }
      }
      
      // Folder Search (using JS recursive search as rg for pure folder names by pattern is less direct)
      // Ripgrep *could* do this with `rg --files --type d --glob "pattern"`, but the JS version is already here.
      if ((searchType === 'folders' || searchType === 'all') && results.length < maxResults && pattern) {
        try {
          // searchFolders expects paths relative to its starting `baseDir` (which is `searchPath` here)
          // The results it pushes should already be workspace-relative if constructed correctly inside.
          await searchFoldersRecursive(
            searchPath, // baseDir for this search operation
            pattern,
            ignoreCase,
            includeHidden,
            ignoredFoldersForJsSearch,
            results,
            maxResults,
            0,
            6, // maxDepth
            getSafeWorkspacePath() // workspaceRoot for making paths relative
            );
        } catch (error: any) {
          console.warn(`Folder search (JS recursive) failed (pattern: "${pattern}", path: "${args.path || '.'}"): ${error.message}`);
        }
      }

      // If Ripgrep failed significantly and no results, consider full fallback.
      if (results.length === 0 && (searchType === 'content' || searchType === 'files')) {
          const rgErrors = (console.warn.toString().includes("Ripgrep") && console.warn.toString().includes("failed")); // crude check
          if (rgErrors || true) { // Or always run fallback if rg yields nothing for these types
            console.log("Ripgrep yielded no results or failed for primary search types, attempting JS fallback.");
            // return await fallbackSearch(args, searchPath); // Re-evaluate if this is the best strategy
          }
      }


      return {
        success: true,
        pattern: args.pattern || (activeFileTypes.length > 0 ? '*' : 'undefined'),
        searchType,
        searchPathUsed: args.path || '.',
        absoluteSearchPath: searchPath,
        fileTypesFilter: args.fileTypes || 'none',
        results: results.slice(0, maxResults),
        resultCount: results.length,
        hasMore: results.length >= maxResults && results.length > 0 
      };
    } catch (error: any) {
      console.error(`Critical error in findFiles tool: ${error.stack || error.message}`);
      return { error: `An unexpected error occurred during findFiles: ${error.message}` };
    }
  }
};

// Helper function to search folders recursively (JS version)
async function searchFoldersRecursive(
  currentSearchDirAbs: string, // Absolute path of the directory currently being searched
  pattern: string,
  ignoreCase: boolean,
  includeHidden: boolean,
  ignoredFolders: string[],
  results: Array<{ path: string; type: 'filename' | 'content' | 'folder'; line?: number; preview?: string; match?: string; }>,
  maxResults: number,
  currentDepth: number,
  maxDepth: number,
  workspaceRootAbs: string // Absolute path to the workspace root, for making result paths relative
): Promise<void> {
  if (currentDepth > maxDepth || results.length >= maxResults) {
    return;
  }

  try {
    const entries = await fs.readdir(currentSearchDirAbs, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      if (entry.isDirectory()) {
        const entryName = entry.name;
        const entryAbsolutePath = path.join(currentSearchDirAbs, entryName);

        if (!includeHidden && entryName.startsWith('.')) continue;
        if (ignoredFolders.includes(entryName)) continue;

        const patternToTest = ignoreCase ? pattern.toLowerCase() : pattern;
        const nameToTest = ignoreCase ? entryName.toLowerCase() : entryName;

        let match = false;
        if (pattern === '*') {
            match = true;
        } else if (pattern.includes('*') || pattern.includes('?') || pattern.includes('[')) {
            const regexPatternStr = '^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*').replace(/\\\?/g, '.') + '$';
            const regexPattern = new RegExp(regexPatternStr, ignoreCase ? 'i' : '');
            match = regexPattern.test(entryName);
        } else {
            match = nameToTest.includes(patternToTest);
        }

        if (match) {
          results.push({
            path: path.relative(workspaceRootAbs, entryAbsolutePath), // Make path relative to workspace
            type: 'folder'
          });
        }

        if (currentDepth < maxDepth && results.length < maxResults) {
          await searchFoldersRecursive(entryAbsolutePath, pattern, ignoreCase, includeHidden, ignoredFolders, results, maxResults, currentDepth + 1, maxDepth, workspaceRootAbs);
        }
      }
    }
  } catch (error) { /* Skip unreadable directories */ }
}


// Helper function to run ripgrep
async function runRipgrep(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // console.log(`Spawning rg with args: [${args.join(' ')}] in cwd: ${cwd}`);
    const rg = spawn('rg', args, { cwd });
    let stdout = '';
    let stderr = '';

    rg.stdout.on('data', (data) => { stdout += data.toString(); });
    rg.stderr.on('data', (data) => { stderr += data.toString(); });

    rg.on('close', (code) => {
      if (code === 0) { 
        resolve(stdout);
      } else if (code === 1) { // No matches found is not an error for rg, stdout is empty.
        resolve(stdout); 
      } else { 
        reject(new Error(`ripgrep command [rg ${args.join(' ')}] failed in ${cwd} with code ${code}: ${stderr || stdout}`));
      }
    });
    rg.on('error', (error) => { 
      reject(new Error(`Failed to start ripgrep process (is 'rg' installed and in PATH?): ${error.message}`));
    });
  });
}

// Fallback search function (Simplified, as full fallback is complex and rg is preferred)
// This is more a placeholder for a more robust JS-based fallback if needed.
// For now, the primary strategy relies on Ripgrep for files/content and the JS searchFoldersRecursive for folders.
async function fallbackSearch(
    originalArgs: { 
        pattern?: string; 
        searchType?: 'files' | 'content' | 'folders' | 'both' | 'all'; 
        path?: string; 
        fileTypes?: string; 
        ignoreCase?: boolean; 
        maxResults?: number;
        includeHidden?: boolean;
    }, 
    absoluteSearchPathStart: string
): Promise<any> {
  console.warn("Fallback search activated. This is a basic JS implementation and may be slower or less accurate than Ripgrep.");
  const results: Array<{ path: string; type: 'filename' | 'content' | 'folder'; line?: number; preview?: string }> = [];
  const { pattern, searchType = 'files', fileTypes, ignoreCase = true, maxResults = 50, includeHidden = false } = originalArgs;

  if (!pattern) {
      return { success: true, fallback: true, message: "Fallback search requires a pattern.", results: [], resultCount: 0 };
  }

  const activeFileTypesParsed = fileTypes 
      ? fileTypes.split(',').map(t => t.trim().replace(/^\./, '')).filter(t => t) 
      : [];
  const searchPatternEffective = ignoreCase && pattern ? pattern.toLowerCase() : pattern;
  const workspaceRootAbs = getSafeWorkspacePath(); // For making paths relative

  const searchInDirectoryRecursiveJS = async (currentDirAbs: string) => {
    if (results.length >= maxResults) return;

    try {
      const entries = await fs.readdir(currentDirAbs, { withFileTypes: true });
      
      for (const entry of entries) {
        if (results.length >= maxResults) break;

        const entryName = entry.name;
        const entryAbsPath = path.join(currentDirAbs, entryName);
        const entryPathRelToWorkspace = path.relative(workspaceRootAbs, entryAbsPath);

        if (!includeHidden && entryName.startsWith('.')) continue;
        
        if (entry.isDirectory()) {
          if (searchType === 'folders' || searchType === 'all') {
            const nameToTest = ignoreCase ? entryName.toLowerCase() : entryName;
            if (nameToTest.includes(searchPatternEffective!)) {
              results.push({ path: entryPathRelToWorkspace, type: 'folder' });
              if (results.length >= maxResults) return;
            }
          }
          await searchInDirectoryRecursiveJS(entryAbsPath); // Recurse
        } else if (entry.isFile()) {
          let typeMatch = true;
          if (activeFileTypesParsed.length > 0) {
            typeMatch = activeFileTypesParsed.some(ext => entryName.toLowerCase().endsWith(`.${ext.toLowerCase()}`));
          }
          if (!typeMatch) continue;

          if (searchType === 'files' || searchType === 'both' || searchType === 'all') {
            const nameToTest = ignoreCase ? entryName.toLowerCase() : entryName;
            if (nameToTest.includes(searchPatternEffective!)) {
              results.push({ path: entryPathRelToWorkspace, type: 'filename' });
              if (results.length >= maxResults) return;
            }
          }
          
          if ((searchType === 'content' || searchType === 'both' || searchType === 'all') && results.length < maxResults && pattern && pattern !== '*') {
            try {
              const content = await fs.readFile(entryAbsPath, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (results.length >= maxResults) break;
                const lineContent = lines[i];
                const lineToTest = ignoreCase ? lineContent.toLowerCase() : lineContent;
                if (lineToTest.includes(searchPatternEffective!)) {
                  results.push({
                    path: entryPathRelToWorkspace,
                    type: 'content',
                    line: i + 1,
                    preview: lineContent.trim().substring(0, 100) + (lineContent.length > 100 ? '...' : '')
                  });
                }
              }
            } catch { /* Skip unreadable files */ }
          }
        }
      }
    } catch { /* Skip unreadable directories */ }
  };
  
  await searchInDirectoryRecursiveJS(absoluteSearchPathStart);
  
  return {
    success: true,
    pattern: pattern,
    searchType,
    searchPathUsed: originalArgs.path || '.',
    fileTypesFilter: fileTypes || 'none',
    results: results.slice(0, maxResults),
    resultCount: results.length,
    hasMore: results.length >= maxResults && results.length > 0,
    fallbackUsed: true,
    message: "Search performed using JavaScript fallback."
  };
}