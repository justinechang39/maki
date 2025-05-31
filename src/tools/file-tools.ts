import fg from 'fast-glob';
import * as fs from 'fs/promises';
import path from 'path';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js'; // Assuming these exist
import type { Tool } from '../core/types.js'; // Assuming these exist
import { getSafeWorkspacePath } from '../core/utils.js'; // Assuming these exist

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
      name: 'glob',
      description: `POWERFUL FILE & DIRECTORY DISCOVERY: Fast, unified tool for finding files and directories using glob patterns. Supports all common patterns (*, **, ?, [], {}) and advanced filtering. This replaces listFiles, listFolders, and findFiles with a simpler, more powerful interface.`,
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: `Glob pattern to search for. Examples: "*" (all items in directory), "**/*.js" (all JS files recursively), "src/**" (everything in src), "*.{jpg,png}" (images), "!node_modules/**" (exclude node_modules). Use forward slashes on all platforms.`
          },
          options: {
            type: 'object',
            description: 'Search configuration options',
            properties: {
              onlyFiles: {
                type: 'boolean',
                description:
                  'Return only files (default: true). Set false to include both files and directories.'
              },
              onlyDirectories: {
                type: 'boolean',
                description:
                  'Return only directories (default: false). Overrides onlyFiles if true.'
              },
              cwd: {
                type: 'string',
                description: `Working directory for search (relative to '${WORKSPACE_DIRECTORY_NAME}'). Default: workspace root.`
              },
              deep: {
                type: 'number',
                description:
                  'Maximum search depth. Default: unlimited. Use 1 for immediate children only.'
              },
              dot: {
                type: 'boolean',
                description:
                  'Include hidden files/directories (starting with .). Default: false.'
              },
              absolute: {
                type: 'boolean',
                description:
                  'Return absolute file paths. Default: false (returns workspace-relative paths).'
              },
              objectMode: {
                type: 'boolean',
                description:
                  'Return rich objects with metadata instead of just path strings. Default: false. WARNING: Use sparingly as this creates verbose output.'
              },
              stats: {
                type: 'boolean',
                description:
                  'Include fs.Stats in results (slower but provides size, dates, etc.). Default: false. WARNING: Creates very verbose output, use only when file metadata is specifically needed.'
              },
              ignore: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Array of glob patterns to exclude from results. Example: ["node_modules/**", "*.log"]'
              },
              caseSensitive: {
                type: 'boolean',
                description: 'Case-sensitive pattern matching. Default: true.'
              },
              maxResults: {
                type: 'number',
                description:
                  'Maximum number of results to return. Default: 100 to prevent context overflow. Set higher only when needed.'
              },
              markDirectories: {
                type: 'boolean',
                description:
                  'Add trailing slash to directory paths for easy identification. Default: false.'
              },
              sizeOnly: {
                type: 'boolean',
                description:
                  'Return only path and size for files (much cleaner than full stats). Useful for filtering by file size. Default: false.'
              }
            }
          }
        },
        required: ['pattern']
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
            description: `File path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be an existing file. Use glob first if unsure of exact path.`
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
          path: {
            type: 'string',
            description: `Target file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Creates parent directories automatically if needed.`
          },
          content: {
            type: 'string',
            description:
              'Complete file content to write. This will replace any existing content entirely.'
          }
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
          path: {
            type: 'string',
            description: `File path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}').`
          },
          content: {
            type: 'string',
            description:
              'New content to insert, replace with, or append. Can be multi-line.'
          },
          operation: {
            type: 'string',
            description:
              'Edit operation: "replace" (substitute specific lines), "insert" (add before specified line), "append" (add to file end), "prepend" (add to file beginning)',
            enum: ['replace', 'insert', 'append', 'prepend']
          },
          startLine: {
            type: 'number',
            description:
              'Line number (1-based) where operation begins. Required for replace/insert operations. Use readFile first to identify correct line numbers.'
          },
          endLine: {
            type: 'number',
            description:
              'End line number (1-based, inclusive) for replace operations. Omit to replace only startLine.'
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
      description: `SINGLE FILE DELETION: Permanently remove one file from workspace. For MULTIPLE files, use executeShellCommand with 'find' + 'rm' for bulk deletion. Use with caution as this cannot be undone.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `File path to delete within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). File must exist.`
          }
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
          path: {
            type: 'string',
            description: `New folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.`
          }
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
          path: {
            type: 'string',
            description: `Folder path to delete within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing directory.`
          },
          recursive: {
            type: 'boolean',
            description:
              'TRUE: Delete folder and ALL contents (dangerous). FALSE: Only delete if empty (safer). Always consider carefully.'
          }
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
          oldPath: {
            type: 'string',
            description: `Current folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must exist.`
          },
          newPath: {
            type: 'string',
            description: `New folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.`
          }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFile',
      description: `SINGLE FILE MOVE/RENAME: Move or rename one file. For MULTIPLE files, use executeShellCommand with 'find' + 'mv' for bulk operations. Can move files between directories while preserving content.`,
      parameters: {
        type: 'object',
        properties: {
          oldPath: {
            type: 'string',
            description: `Current file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing file.`
          },
          newPath: {
            type: 'string',
            description: `New file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.`
          }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copyFile',
      description: `SINGLE FILE DUPLICATION: Copy one file while preserving the original. For MULTIPLE files, use executeShellCommand with 'find' + 'cp' for much better efficiency. Use this only for single file operations.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: {
            type: 'string',
            description: `Source file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing file.`
          },
          destinationPath: {
            type: 'string',
            description: `Destination file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.`
          },
          overwrite: {
            type: 'boolean',
            description:
              'Whether to overwrite destination file if it exists. Default: false.'
          }
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
          sourcePath: {
            type: 'string',
            description: `Source folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing directory.`
          },
          destinationPath: {
            type: 'string',
            description: `Destination folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Will create parent folders if needed.`
          },
          overwrite: {
            type: 'boolean',
            description:
              'Whether to overwrite destination folder if it exists. Default: false.'
          }
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
          path: {
            type: 'string',
            description: `File or folder path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must exist.`
          }
        },
        required: ['path']
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
      name: 'executeShellCommand',
      description: `ADVANCED BULK OPERATIONS: Execute shell commands for complex file operations that would require many individual tool calls. Use for efficient bulk operations like finding files by size/date, batch copying/moving, or complex filtering. MUCH faster than multiple individual tool calls for bulk operations.`,
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'Shell command to execute. Will be run in the workspace directory. BULK OPERATION EXAMPLES: "mkdir folder && find . -name \'*.jpg\' -size +1M -exec cp {} folder/ \\;" (bulk copy large images), "find . -name \'*.tmp\' -delete" (bulk delete), "find . -name \'*.pdf\' -exec mv {} documents/ \\;" (bulk move)'
          },
          description: {
            type: 'string',
            description: 'Human-readable description of what this command does (for logging/safety)'
          }
        },
        required: ['command', 'description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'bulkFileOperation',
      description: `BULK FILE EFFICIENCY: Perform operations on multiple files matching criteria. Much more efficient than individual tool calls. Combines discovery + action in one step. Use this instead of glob + multiple individual operations.`,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'Operation to perform: "copy", "move", "delete", or "list"',
            enum: ['copy', 'move', 'delete', 'list']
          },
          pattern: {
            type: 'string',
            description: 'File pattern to match. Examples: "*.jpg", "**/*.pdf", "*.{png,gif}"'
          },
          targetFolder: {
            type: 'string',
            description: 'Target folder for copy/move operations. Will be created if needed.'
          },
          sizeFilter: {
            type: 'string',
            description: 'Size filter. Examples: "+1M" (larger than 1MB), "-100k" (smaller than 100KB), "1M" (exactly 1MB)'
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum directory depth to search. Default: unlimited'
          },
          dryRun: {
            type: 'boolean',
            description: 'Show what would be done without actually doing it. Default: false'
          }
        },
        required: ['operation', 'pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getFolderStructure',
      description: `DIRECTORY MAPPING: Get a comprehensive view of folder structure for better workspace navigation and understanding. Returns all directories recursively with depth indicators, perfect for understanding project organization before performing operations. Much cleaner than using glob for directory exploration.`,
      parameters: {
        type: 'object',
        properties: {
          startPath: {
            type: 'string',
            description: `Starting directory path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Default: workspace root (".")`,
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum depth to recurse into subdirectories. Default: 5. Higher values may create verbose output.',
          },
          includeHidden: {
            type: 'boolean',
            description: 'Include hidden directories (starting with .). Default: false.',
          },
          treeFormat: {
            type: 'boolean',
            description: 'Return results in tree format with visual indentation. Default: false (returns flat list with depth numbers).',
          }
        }
      }
    }
  }
];

export const fileToolImplementations: Record<
  string,
  (args: any) => Promise<any>
> = {
  glob: async (args: {
    pattern: string;
    options?: {
      onlyFiles?: boolean;
      onlyDirectories?: boolean;
      cwd?: string;
      deep?: number;
      dot?: boolean;
      absolute?: boolean;
      objectMode?: boolean;
      stats?: boolean;
      ignore?: string[];
      caseSensitive?: boolean;
      maxResults?: number;
      markDirectories?: boolean;
      sizeOnly?: boolean;
    };
  }) => {
    try {
      const opts = args.options || {};
      const workspacePath = getSafeWorkspacePath();
      const searchPath = opts.cwd
        ? getSafeWorkspacePath(opts.cwd)
        : workspacePath;

      // Configure fast-glob options with better defaults
      const fgOptions: fg.Options = {
        cwd: searchPath,
        onlyFiles: opts.onlyDirectories ? false : opts.onlyFiles !== false,
        onlyDirectories: opts.onlyDirectories || false,
        deep: opts.deep,
        dot: opts.dot || false,
        absolute: opts.absolute || false,
        objectMode: opts.objectMode || opts.stats || opts.sizeOnly || false, // Enable objectMode if stats/sizes are requested
        stats: opts.stats || opts.sizeOnly || false, // Enable stats if sizeOnly is requested
        ignore: opts.ignore || [],
        caseSensitiveMatch: opts.caseSensitive !== false,
        markDirectories: opts.markDirectories || false,
        unique: true,
        suppressErrors: true
      };

      // Set reasonable default max results to prevent context overflow
      const defaultMaxResults = opts.maxResults || 100;

      // Execute the glob search
      let results: string[] | fg.Entry[] | any[] = await fg(
        args.pattern,
        fgOptions
      );

      // Limit results to prevent context overflow
      if (results.length > defaultMaxResults) {
        results = results.slice(0, defaultMaxResults);
      }

      // Process results and clean up if needed
      if (fgOptions.objectMode) {
        // Entry objects from fast-glob when objectMode is enabled
        results = (results as unknown as fg.Entry[]).map(entry => {
          // Clean up the dirent object to remove function references that can't be serialized
          const cleanDirent = entry.dirent
            ? {
                name: entry.dirent.name,
                isFile: entry.dirent.isFile(),
                isDirectory: entry.dirent.isDirectory(),
                isSymbolicLink: entry.dirent.isSymbolicLink()
              }
            : undefined;

          const finalPath = opts.absolute
            ? path.resolve(searchPath, entry.path)
            : path.relative(
                workspacePath,
                path.resolve(searchPath, entry.path)
              );

          // Handle sizeOnly mode for cleaner output
          if (opts.sizeOnly && entry.stats) {
            return {
              path: finalPath,
              size: entry.stats.size,
              sizeFormatted: formatBytes(entry.stats.size)
            };
          }

          // Clean up stats object to remove function references
          const cleanStats = entry.stats
            ? {
                dev: entry.stats.dev,
                mode: entry.stats.mode,
                nlink: entry.stats.nlink,
                uid: entry.stats.uid,
                gid: entry.stats.gid,
                rdev: entry.stats.rdev,
                blksize: entry.stats.blksize,
                ino: entry.stats.ino,
                size: entry.stats.size,
                blocks: entry.stats.blocks,
                atimeMs: entry.stats.atimeMs,
                mtimeMs: entry.stats.mtimeMs,
                ctimeMs: entry.stats.ctimeMs,
                birthtimeMs: entry.stats.birthtimeMs,
                sizeFormatted: formatBytes(entry.stats.size)
              }
            : undefined;

          return {
            name: entry.name,
            path: finalPath,
            ...(cleanDirent && { dirent: cleanDirent }),
            ...(cleanStats && { stats: cleanStats })
          };
        }) as any;
      } else if (!opts.absolute) {
        // String results from fast-glob, convert to workspace-relative paths
        results = (results as string[]).map(resultPath => {
          const absolutePath = path.isAbsolute(resultPath)
            ? resultPath
            : path.resolve(searchPath, resultPath);
          return path.relative(workspacePath, absolutePath);
        });
      }
      // If opts.absolute is true and not objectMode, fast-glob already returns absolute paths

      return {
        success: true,
        pattern: args.pattern,
        searchPath: opts.cwd || '.',
        absoluteSearchPath: searchPath,
        results,
        resultCount: results.length,
        options: {
          onlyFiles: fgOptions.onlyFiles,
          onlyDirectories: fgOptions.onlyDirectories,
          deep: fgOptions.deep,
          dot: fgOptions.dot,
          absolute: fgOptions.absolute,
          objectMode: fgOptions.objectMode,
          stats: fgOptions.stats,
          caseSensitive: fgOptions.caseSensitiveMatch,
          maxResults: defaultMaxResults
        },
        hasMore: results.length >= defaultMaxResults
      };
    } catch (error: any) {
      return {
        error: `Glob search failed: ${error.message}`,
        pattern: args.pattern,
        searchPath: args.options?.cwd || '.',
        details: error.stack
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
      return {
        success: true,
        message: `File '${args.path}' written successfully.`
      };
    } catch (error: any) {
      return { error: `Failed to write file '${args.path}': ${error.message}` };
    }
  },

  updateFile: async (args: {
    path: string;
    content: string;
    operation: 'replace' | 'insert' | 'append' | 'prepend';
    startLine?: number;
    endLine?: number;
  }) => {
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
            return {
              error: `File '${args.path}' does not exist. Cannot perform '${args.operation}' operation as it requires an existing file.`
            };
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
          if (args.startLine < 1) {
            // Simplified: startLine must be at least 1
            return {
              error: `Invalid startLine ${args.startLine}. Must be 1 or greater.`
            };
          }

          const endLine = args.endLine || args.startLine;
          if (endLine < args.startLine) {
            return {
              error: `Invalid endLine ${endLine}. Must be >= startLine.`
            };
          }
          // Allow startLine/endLine to go slightly beyond lines.length if replacing empty lines at end or effectively appending.
          // This logic can be complex. The core idea is to replace what's there.
          // If startLine > lines.length, it means we are "replacing" non-existent lines, which is like appending.

          const newLines = args.content.split('\n');
          if (args.startLine > lines.length) {
            // "Replacing" after the last actual line
            while (lines.length < args.startLine - 1) lines.push(''); // Pad with empty lines if needed
            lines.push(...newLines);
          } else {
            // Ensure endLine does not go excessively beyond existing lines for replacement
            const actualEndLine = Math.min(endLine, lines.length);
            lines.splice(
              args.startLine - 1,
              actualEndLine - (args.startLine - 1),
              ...newLines
            );
          }
          newContent = lines.join('\n');
          break;

        case 'insert':
          if (args.startLine === undefined) {
            return { error: 'startLine is required for insert operation.' };
          }
          if (args.startLine < 1 || args.startLine > lines.length + 1) {
            // Can insert at line after last line
            return {
              error: `Invalid startLine ${
                args.startLine
              }. Valid range is 1 to ${lines.length + 1}.`
            };
          }

          const insertLines = args.content.split('\n');
          lines.splice(args.startLine - 1, 0, ...insertLines);
          newContent = lines.join('\n');
          break;

        case 'append':
          newContent =
            existingContent +
            (existingContent && !existingContent.endsWith('\n') && args.content
              ? '\n'
              : '') +
            args.content;
          break;

        case 'prepend':
          newContent =
            args.content +
            (args.content && !args.content.endsWith('\n') && existingContent
              ? '\n'
              : '') +
            existingContent;
          break;

        default:
          return { error: `Unsupported operation: ${args.operation}` };
      }

      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, newContent, 'utf-8');

      const operationDesc =
        args.operation === 'replace'
          ? `replaced lines ${args.startLine}-${args.endLine || args.startLine}`
          : args.operation === 'insert'
          ? `inserted content at line ${args.startLine}`
          : `${args.operation}ed content`;

      return {
        success: true,
        message: `File '${args.path}' updated successfully (${operationDesc}).`,
        linesAffected:
          args.operation === 'replace'
            ? (args.endLine || args.startLine!) - args.startLine! + 1
            : args.content.split('\n').length
      };
    } catch (error: any) {
      return {
        error: `Failed to update file '${args.path}': ${error.message}`
      };
    }
  },

  deleteFile: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.unlink(safePath);
      return {
        success: true,
        message: `File '${args.path}' deleted successfully.`
      };
    } catch (error: any) {
      return {
        error: `Failed to delete file '${args.path}': ${error.message}`
      };
    }
  },

  createFolder: async (args: { path: string }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.mkdir(safePath, { recursive: true });
      return {
        success: true,
        message: `Folder '${args.path}' created successfully.`
      };
    } catch (error: any) {
      return {
        error: `Failed to create folder '${args.path}': ${error.message}`
      };
    }
  },

  deleteFolder: async (args: { path: string; recursive?: boolean }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      await fs.rm(safePath, {
        recursive: !!args.recursive,
        force: !!args.recursive
      });
      return {
        success: true,
        message: `Folder '${args.path}' deleted successfully.`
      };
    } catch (error: any) {
      return {
        error: `Failed to delete folder '${args.path}': ${error.message}`
      };
    }
  },

  renameFolder: async (args: { oldPath: string; newPath: string }) => {
    try {
      const safeOldPath = getSafeWorkspacePath(args.oldPath);
      const safeNewPath = getSafeWorkspacePath(args.newPath);
      await fs.mkdir(path.dirname(safeNewPath), { recursive: true });
      await fs.rename(safeOldPath, safeNewPath);
      return {
        success: true,
        message: `Folder renamed from '${args.oldPath}' to '${args.newPath}'.`
      };
    } catch (error: any) {
      return {
        error: `Failed to rename folder '${args.oldPath}': ${error.message}`
      };
    }
  },

  renameFile: async (args: { oldPath: string; newPath: string }) => {
    try {
      const safeOldPath = getSafeWorkspacePath(args.oldPath);
      const safeNewPath = getSafeWorkspacePath(args.newPath);
      await fs.mkdir(path.dirname(safeNewPath), { recursive: true });
      await fs.rename(safeOldPath, safeNewPath);
      return {
        success: true,
        message: `File renamed from '${args.oldPath}' to '${args.newPath}'.`
      };
    } catch (error: any) {
      return {
        error: `Failed to rename file '${args.oldPath}': ${error.message}`
      };
    }
  },

  copyFile: async (args: {
    sourcePath: string;
    destinationPath: string;
    overwrite?: boolean;
  }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);

      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return {
            error: `Destination file '${args.destinationPath}' already exists. Use overwrite=true to replace.`
          };
        }
      } catch {
        /* File doesn't exist, proceed */
      }

      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.copyFile(safeSrcPath, safeDestPath);
      return {
        success: true,
        message: `File copied from '${args.sourcePath}' to '${args.destinationPath}'.`
      };
    } catch (error: any) {
      return {
        error: `Failed to copy file '${args.sourcePath}': ${error.message}`
      };
    }
  },

  copyFolder: async (args: {
    sourcePath: string;
    destinationPath: string;
    overwrite?: boolean;
  }) => {
    try {
      const safeSrcPath = getSafeWorkspacePath(args.sourcePath);
      const safeDestPath = getSafeWorkspacePath(args.destinationPath);

      try {
        await fs.access(safeDestPath);
        if (!args.overwrite) {
          return {
            error: `Destination folder '${args.destinationPath}' already exists. Use overwrite=true to replace.`
          };
        }
        await fs.rm(safeDestPath, { recursive: true, force: true });
      } catch {
        /* Folder doesn't exist, proceed */
      }

      // fs.cp needs the destination parent to exist, but not the destination itself if it's a directory copy.
      // If safeDestPath is 'a/b/c' and we are copying a folder 'src_folder' to 'a/b/c', then 'a/b' must exist.
      // If 'c' exists and is a file, fs.cp errors. If 'c' exists and is a dir, fs.cp copies *into* it.
      // To ensure we replace 'c' if it's a dir and overwrite is true, we already rm'd it.
      // So, now we ensure parent of safeDestPath exists.
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true });
      await fs.cp(safeSrcPath, safeDestPath, { recursive: true });
      return {
        success: true,
        message: `Folder copied from '${args.sourcePath}' to '${args.destinationPath}'.`
      };
    } catch (error: any) {
      return {
        error: `Failed to copy folder '${args.sourcePath}': ${error.message}`
      };
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
        type: stats.isFile()
          ? 'file'
          : stats.isDirectory()
          ? 'directory'
          : 'other',
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
      return {
        error: `Failed to get info for '${args.path}': ${error.message}`
      };
    }
  },



  executeShellCommand: async (args: { command: string; description: string }) => {
    try {
      const { execSync } = await import('child_process');
      const workspacePath = getSafeWorkspacePath();
      
      console.log(`🔧 Executing: ${args.description}`);
      console.log(`📍 Command: ${args.command}`);
      console.log(`📂 Working directory: ${workspacePath}`);
      
      const output = execSync(args.command, { 
        cwd: workspacePath, 
        encoding: 'utf-8',
        timeout: 30000 // 30 second timeout
      });
      
      return {
        success: true,
        command: args.command,
        description: args.description,
        output: output.toString(),
        workingDirectory: workspacePath
      };
    } catch (error: any) {
      return {
        error: `Shell command failed: ${error.message}`,
        command: args.command,
        description: args.description,
        exitCode: error.status,
        stderr: error.stderr?.toString(),
        details: error.stack
      };
    }
  },

  bulkFileOperation: async (args: {
    operation: 'copy' | 'move' | 'delete' | 'list';
    pattern: string;
    targetFolder?: string;
    sizeFilter?: string;
    maxDepth?: number;
    dryRun?: boolean;
  }) => {
    try {
      const { execSync } = await import('child_process');
      const workspacePath = getSafeWorkspacePath();
      
      // Build find command
      let findCmd = `find .`;
      
      if (args.maxDepth) {
        findCmd += ` -maxdepth ${args.maxDepth}`;
      }
      
      // Add name pattern
      findCmd += ` -name '${args.pattern}'`;
      
      // Add size filter if specified
      if (args.sizeFilter) {
        findCmd += ` -size ${args.sizeFilter}`;
      }
      
      // Add type filter for files only
      findCmd += ` -type f`;
      
      let command = '';
      let description = '';
      
      switch (args.operation) {
        case 'list':
          command = `${findCmd} -exec ls -lh {} \\;`;
          description = `List files matching pattern '${args.pattern}'`;
          break;
          
        case 'copy':
          if (!args.targetFolder) {
            return { error: 'targetFolder is required for copy operation' };
          }
          command = `mkdir -p '${args.targetFolder}' && ${findCmd} -exec cp {} '${args.targetFolder}/' \\;`;
          description = `Copy files matching '${args.pattern}' to '${args.targetFolder}'`;
          break;
          
        case 'move':
          if (!args.targetFolder) {
            return { error: 'targetFolder is required for move operation' };
          }
          command = `mkdir -p '${args.targetFolder}' && ${findCmd} -exec mv {} '${args.targetFolder}/' \\;`;
          description = `Move files matching '${args.pattern}' to '${args.targetFolder}'`;
          break;
          
        case 'delete':
          command = `${findCmd} -delete`;
          description = `Delete files matching '${args.pattern}'`;
          break;
      }
      
      if (args.dryRun) {
        // For dry run, just list what would be affected
        const listCmd = `${findCmd}`;
        const output = execSync(listCmd, { 
          cwd: workspacePath, 
          encoding: 'utf-8',
          timeout: 30000 
        });
        
        return {
          success: true,
          dryRun: true,
          operation: args.operation,
          pattern: args.pattern,
          filesFound: output.trim().split('\n').filter(f => f),
          command: command,
          description: `DRY RUN: ${description}`
        };
      }
      
      // Execute the actual command
      const output = execSync(command, { 
        cwd: workspacePath, 
        encoding: 'utf-8',
        timeout: 30000 
      });
      
      return {
        success: true,
        operation: args.operation,
        pattern: args.pattern,
        command: command,
        description: description,
        output: output.toString(),
        workingDirectory: workspacePath
      };
    } catch (error: any) {
      return {
        error: `Bulk file operation failed: ${error.message}`,
        operation: args.operation,
        pattern: args.pattern,
        exitCode: error.status,
        stderr: error.stderr?.toString(),
        details: error.stack
      };
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
      return {
        error: `Failed to get workspace directory information: ${error.message}`
      };
    }
  },

  getFolderStructure: async (args: {
    startPath?: string;
    maxDepth?: number;
    includeHidden?: boolean;
    treeFormat?: boolean;
  }) => {
    try {
      const startPath = args.startPath || '.';
      const maxDepth = args.maxDepth || 5;
      const includeHidden = args.includeHidden || false;
      const treeFormat = args.treeFormat || false;

      const workspacePath = getSafeWorkspacePath();
      const searchPath = getSafeWorkspacePath(startPath);

      interface FolderInfo {
        path: string;
        depth: number;
        name: string;
        relativePath: string;
      }

      const folders: FolderInfo[] = [];

      const scanDirectory = async (dirPath: string, currentDepth: number): Promise<void> => {
        if (currentDepth > maxDepth) return;

        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (!includeHidden && entry.name.startsWith('.')) continue;

            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(workspacePath, fullPath);

            folders.push({
              path: fullPath,
              depth: currentDepth,
              name: entry.name,
              relativePath: relativePath
            });

            // Recurse into subdirectory
            await scanDirectory(fullPath, currentDepth + 1);
          }
        } catch (error: any) {
          // Skip directories we can't read (permissions, etc.)
          console.warn(`Skipping directory ${dirPath}: ${error.message}`);
        }
      };

      // Start scanning from the specified path
      await scanDirectory(searchPath, 0);

      // Sort by path for consistent output
      folders.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

      if (treeFormat) {
        // Format as tree with visual indentation
        const treeLines = folders.map(folder => {
          const indent = '  '.repeat(folder.depth);
          const prefix = folder.depth === 0 ? '' : '├─ ';
          return `${indent}${prefix}${folder.name}/`;
        });

        return {
          success: true,
          startPath,
          maxDepth,
          folderCount: folders.length,
          treeView: treeLines,
          structure: `Directory structure from '${startPath}':\n${treeLines.join('\n')}`
        };
      } else {
        // Flat list with depth indicators (better for AI processing)
        const flatList = folders.map(folder => ({
          path: folder.relativePath,
          name: folder.name,
          depth: folder.depth
        }));

        return {
          success: true,
          startPath,
          maxDepth,
          folderCount: folders.length,
          folders: flatList,
          summary: `Found ${folders.length} directories under '${startPath}' (max depth: ${maxDepth})`
        };
      }
    } catch (error: any) {
      return {
        error: `Failed to get folder structure: ${error.message}`,
        startPath: args.startPath || '.',
        details: error.stack
      };
    }
  }
};
