import fg from 'fast-glob';
import * as fs from 'fs/promises';
import path from 'path';
import type { Tool } from '../core/types.js';
import { getSafeWorkspacePath } from '../core/utils.js';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return format
    .replace('YYYY', year.toString())
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute);
};

export const smartFileTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'findFiles',
      description:
        'Smart file discovery with advanced filtering. Finds files/folders by name, size, date, type. Use this for all file discovery tasks.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              'Search pattern. Examples: "**/*induction*" (folders with induction), "**/*.{jpg,png}" (images), "*report*" (files with report)'
          },
          type: {
            type: 'string',
            enum: ['files', 'folders', 'both'],
            description: 'What to find: files, folders, or both. Default: files'
          },
          location: {
            type: 'string',
            description: 'Search in specific folder. Default: search everywhere'
          },
          sizeFilter: {
            type: 'string',
            description:
              'Size filter: ">1MB", "<500KB", "1MB-10MB". Works only for files'
          },
          dateFilter: {
            type: 'string',
            description:
              'Date filter: ">2023-01-01", "<7days", "today". Works for created/modified dates'
          },
          includeHidden: {
            type: 'boolean',
            description:
              'Include hidden files/folders (starting with .). Default: false'
          },
          limit: {
            type: 'number',
            description: 'Max results to return. Default: 100'
          }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'processFiles',
      description:
        'Multi-step file operations: find folders/files, then perform actions. Use for complex workflows like "find folders with X, then find files inside, then copy to Y".',
      parameters: {
        type: 'object',
        properties: {
          findPattern: {
            type: 'string',
            description:
              'Pattern to find (e.g., "**/*induction*" for folders with induction)'
          },
          findType: {
            type: 'string',
            enum: ['files', 'folders'],
            description: 'Type to find: files or folders'
          },
          findLocation: {
            type: 'string',
            description: 'Optional: search in specific location'
          },
          sizeFilter: {
            type: 'string',
            description: 'Size filter: ">1MB", "<500KB", "1MB-10MB". Works only for files'
          },
          thenAction: {
            type: 'string',
            enum: ['copy', 'move', 'delete', 'findInside'],
            description:
              'Action to perform: copy/move/delete found items, or findInside to search within found folders'
          },
          thenTarget: {
            type: 'string',
            description: 'Target folder for copy/move operations'
          },
          insidePattern: {
            type: 'string',
            description:
              'When thenAction=findInside, pattern to find inside folders (e.g., "**/*.jpg")'
          },
          finalAction: {
            type: 'string',
            enum: ['copy', 'move', 'delete'],
            description: 'Optional: final action after findInside'
          },
          finalTarget: {
            type: 'string',
            description: 'Target for final action'
          }
        },
        required: ['findPattern', 'findType', 'thenAction']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'batchRename',
      description:
        'Rename multiple files using patterns and metadata. Supports date formatting, counters, original names.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description:
              'Files to rename. Examples: "**/*.jpg", "documents/*.pdf"'
          },
          template: {
            type: 'string',
            description:
              'New name template. Variables: {name}, {ext}, {date:YYYY-MM-DD}, {created:YYYY-MM-DD}, {modified}, {size}, {counter}. Example: "{created:YYYY-MM-DD}_{name}.{ext}"'
          },
          location: {
            type: 'string',
            description:
              'Rename files in specific folder. Default: search everywhere'
          },
          startCounter: {
            type: 'number',
            description: 'Starting number for {counter}. Default: 1'
          }
        },
        required: ['pattern', 'template']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'organizeFiles',
      description:
        'Organize files into folders based on rules. Perfect for sorting by type, size, date, or custom patterns.',
      parameters: {
        type: 'object',
        properties: {
          sourcePattern: {
            type: 'string',
            description: 'Files to organize. Examples: "**/*", "downloads/*"'
          },
          rules: {
            type: 'array',
            description: 'Organization rules (processed in order)',
            items: {
              type: 'object',
              properties: {
                condition: {
                  type: 'string',
                  description:
                    'When to apply rule. Examples: "ext=jpg,png", "size>1MB", "name contains report", "older than 30 days"'
                },
                action: {
                  type: 'string',
                  description:
                    'Where to move files. Examples: "images/", "large_files/", "archive/{year}/"'
                }
              },
              required: ['condition', 'action']
            }
          }
        },
        required: ['sourcePattern', 'rules']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'inspectPath',
      description:
        "Get detailed info about files/folders. Use before operations to understand what you're working with.",
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File or folder path to inspect'
          },
          showContents: {
            type: 'boolean',
            description: 'For folders: show immediate contents. Default: false'
          },
          maxContents: {
            type: 'number',
            description: 'Max items to show in contents. Default: 20'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'quickFileOps',
      description:
        'Basic file operations: read, write, create folders, simple copy/move/delete. Use for simple tasks.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['read', 'write', 'createFolder', 'copy', 'move', 'delete'],
            description: 'Operation to perform'
          },
          path: {
            type: 'string',
            description: 'File/folder path (source for copy/move)'
          },
          target: {
            type: 'string',
            description: 'Target path for copy/move operations'
          },
          content: {
            type: 'string',
            description: 'Content for write operation'
          },
          overwrite: {
            type: 'boolean',
            description: 'Overwrite if target exists. Default: false'
          }
        },
        required: ['operation', 'path']
      }
    }
  }
];

export const smartFileImplementations: Record<
  string,
  (args: any) => Promise<any>
> = {
  findFiles: async (args: {
    pattern: string;
    type?: 'files' | 'folders' | 'both';
    location?: string;
    sizeFilter?: string;
    dateFilter?: string;
    includeHidden?: boolean;
    limit?: number;
  }) => {
    try {
      const workspacePath = getSafeWorkspacePath();
      const searchPath = args.location
        ? getSafeWorkspacePath(args.location)
        : workspacePath;
      const limit = args.limit || 100;
      const type = args.type || 'files';

      const fgOptions: fg.Options = {
        cwd: searchPath,
        onlyFiles: type === 'files',
        onlyDirectories: type === 'folders',
        dot: args.includeHidden || false,
        stats: true,
        objectMode: true,
        ignore: ['node_modules/**', '.git/**'],
        suppressErrors: true
      };

      let results = (await fg(
        args.pattern,
        fgOptions
      )) as unknown as fg.Entry[];

      // Apply size filter
      if (args.sizeFilter && type !== 'folders') {
        results = results.filter(entry => {
          if (!entry.stats) return false;
          const size = entry.stats.size;

          if (args.sizeFilter!.startsWith('>')) {
            const minSize = parseSize(args.sizeFilter!.substring(1));
            return size > minSize;
          } else if (args.sizeFilter!.startsWith('<')) {
            const maxSize = parseSize(args.sizeFilter!.substring(1));
            return size < maxSize;
          } else if (args.sizeFilter!.includes('-')) {
            const [min, max] = args.sizeFilter!.split('-');
            return size >= parseSize(min) && size <= parseSize(max);
          }
          return true;
        });
      }

      // Apply date filter
      if (args.dateFilter) {
        const now = new Date();
        results = results.filter(entry => {
          if (!entry.stats) return false;
          const fileDate = entry.stats.mtime;

          if (args.dateFilter!.startsWith('>')) {
            const targetDate = new Date(args.dateFilter!.substring(1));
            return fileDate > targetDate;
          } else if (args.dateFilter!.startsWith('<')) {
            if (args.dateFilter!.includes('days')) {
              const days = parseInt(args.dateFilter!.replace(/[<>days]/g, ''));
              const cutoff = new Date(
                now.getTime() - days * 24 * 60 * 60 * 1000
              );
              return fileDate > cutoff;
            } else {
              const targetDate = new Date(args.dateFilter!.substring(1));
              return fileDate < targetDate;
            }
          } else if (args.dateFilter === 'today') {
            const today = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate()
            );
            return fileDate >= today;
          }
          return true;
        });
      }

      // Limit results
      if (results.length > limit) {
        results = results.slice(0, limit);
      }

      // Format results
      const formattedResults = results.map(entry => {
        const relativePath = path.relative(
          workspacePath,
          path.resolve(searchPath, entry.path)
        );
        return {
          path: relativePath,
          name: entry.name,
          type: entry.stats?.isDirectory() ? 'folder' : 'file',
          size: entry.stats?.size || 0,
          sizeFormatted: formatBytes(entry.stats?.size || 0),
          modified: entry.stats?.mtime.toISOString(),
          created: entry.stats?.birthtime.toISOString()
        };
      });

      return {
        success: true,
        pattern: args.pattern,
        searchLocation: args.location || 'workspace root',
        found: formattedResults.length,
        results: formattedResults,
        hasMore: results.length >= limit
      };
    } catch (error: any) {
      return {
        error: `Find files failed: ${error.message}`,
        pattern: args.pattern
      };
    }
  },

  processFiles: async (args: {
    findPattern: string;
    findType: 'files' | 'folders';
    findLocation?: string;
    sizeFilter?: string;
    thenAction: 'copy' | 'move' | 'delete' | 'findInside';
    thenTarget?: string;
    insidePattern?: string;
    finalAction?: 'copy' | 'move' | 'delete';
    finalTarget?: string;
  }) => {
    try {
      // Step 1: Find initial files/folders
      const findResult = await smartFileImplementations.findFiles({
        pattern: args.findPattern,
        type: args.findType,
        location: args.findLocation,
        sizeFilter: args.sizeFilter
      });
      if (!findResult.success) {
        return { error: `Find step failed: ${findResult.error}` };
      }

      let currentResults = findResult.results;
      let operations: string[] = [];

      // Step 2: Process the found items
      if (args.thenAction === 'findInside') {
        // Find files inside the found folders
        const insideResults = [];
        for (const folder of currentResults.filter(
          (r: any) => r.type === 'folder'
        )) {
          const insideFind = await smartFileImplementations.findFiles({
            pattern: args.insidePattern || '**/*',
            type: 'files',
            location: folder.path
          });
          if (insideFind.success) {
            insideResults.push(...insideFind.results);
          }
        }
        currentResults = insideResults;
        operations.push(
          `Found ${insideResults.length} items inside ${findResult.results.length} folders`
        );
      } else {
        // Perform operation on found items
        const action = args.thenAction;
        const target = args.thenTarget;

        if ((action === 'copy' || action === 'move') && target) {
          await smartFileImplementations.quickFileOps({
            operation: 'createFolder',
            path: target
          });
        }

        for (const item of currentResults) {
          if (action === 'copy' && target) {
            operations.push(`Copy ${item.path} to ${target}/`);
            await smartFileImplementations.quickFileOps({
              operation: 'copy',
              path: item.path,
              target: path.join(target, item.name),
              overwrite: true
            });
          } else if (action === 'move' && target) {
            operations.push(`Move ${item.path} to ${target}/`);
            await smartFileImplementations.quickFileOps({
              operation: 'move',
              path: item.path,
              target: path.join(target, item.name)
            });
          } else if (action === 'delete') {
            operations.push(`Delete ${item.path}`);
            await smartFileImplementations.quickFileOps({
              operation: 'delete',
              path: item.path
            });
          }
        }
      }

      // Step 3: Final step if specified
      if (args.finalAction && currentResults.length > 0) {
        const finalAction = args.finalAction;
        const finalTarget = args.finalTarget;

        if ((finalAction === 'copy' || finalAction === 'move') && finalTarget) {
          await smartFileImplementations.quickFileOps({
            operation: 'createFolder',
            path: finalTarget
          });
        }

        for (const item of currentResults) {
          if (finalAction === 'copy' && finalTarget) {
            operations.push(`Copy ${item.path} to ${finalTarget}/`);
            await smartFileImplementations.quickFileOps({
              operation: 'copy',
              path: item.path,
              target: path.join(finalTarget, item.name),
              overwrite: true
            });
          } else if (finalAction === 'move' && finalTarget) {
            operations.push(`Move ${item.path} to ${finalTarget}/`);
            await smartFileImplementations.quickFileOps({
              operation: 'move',
              path: item.path,
              target: path.join(finalTarget, item.name)
            });
          }
        }
      }

      return {
        success: true,
        initialFound: findResult.results.length,
        finalProcessed: currentResults.length,
        operations,
        summary: `Completed: ${operations.length} operations on ${currentResults.length} items`
      };
    } catch (error: any) {
      return {
        error: `Process files failed: ${error.message}`,
        details: error.stack
      };
    }
  },

  batchRename: async (args: {
    pattern: string;
    template: string;
    location?: string;
    startCounter?: number;
  }) => {
    try {
      // Find files to rename
      const findResult = await smartFileImplementations.findFiles({
        pattern: args.pattern,
        type: 'files',
        location: args.location
      });

      if (!findResult.success) {
        return { error: `Find files failed: ${findResult.error}` };
      }

      const workspacePath = getSafeWorkspacePath();
      const renames: { from: string; to: string }[] = [];
      let counter = args.startCounter || 1;

      for (const file of findResult.results) {
        const safePath = getSafeWorkspacePath(file.path);
        const stats = await fs.stat(safePath);

        const pathInfo = path.parse(file.path);
        const variables = {
          name: pathInfo.name,
          ext: pathInfo.ext.substring(1), // Remove the dot
          date: formatDate(new Date()),
          created: formatDate(stats.birthtime),
          modified: formatDate(stats.mtime),
          size: formatBytes(stats.size),
          counter: counter.toString().padStart(3, '0')
        };

        let newName = args.template;

        // Replace variables in template
        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`\\{${key}(?::[^}]+)?\\}`, 'g');
          newName = newName.replace(regex, match => {
            if (
              match.includes(':') &&
              (key === 'date' || key === 'created' || key === 'modified')
            ) {
              const format = match.split(':')[1].replace('}', '');
              const dateObj =
                key === 'date'
                  ? new Date()
                  : key === 'created'
                  ? stats.birthtime
                  : stats.mtime;
              return formatDate(dateObj, format);
            }
            return value;
          });
        });

        const newPath = path.join(pathInfo.dir, newName);
        renames.push({ from: file.path, to: newPath });

        await smartFileImplementations.quickFileOps({
          operation: 'move',
          path: file.path,
          target: newPath
        });

        counter++;
      }

      return {
        success: true,
        filesFound: findResult.results.length,
        renames: renames,
        summary: `Renamed ${renames.length} files`
      };
    } catch (error: any) {
      return {
        error: `Batch rename failed: ${error.message}`,
        details: error.stack
      };
    }
  },

  organizeFiles: async (args: {
    sourcePattern: string;
    rules: Array<{ condition: string; action: string }>;
  }) => {
    try {
      // Find files to organize
      const findResult = await smartFileImplementations.findFiles({
        pattern: args.sourcePattern,
        type: 'files'
      });

      if (!findResult.success) {
        return { error: `Find files failed: ${findResult.error}` };
      }

      const moves: { from: string; to: string; rule: string }[] = [];

      for (const file of findResult.results) {
        // Apply rules in order
        for (const rule of args.rules) {
          if (matchesCondition(file, rule.condition)) {
            const targetDir = interpolateAction(file, rule.action);
            const targetPath = path.join(targetDir, file.name);

            moves.push({
              from: file.path,
              to: targetPath,
              rule: rule.condition
            });

            await smartFileImplementations.quickFileOps({
              operation: 'createFolder',
              path: targetDir
            });
            await smartFileImplementations.quickFileOps({
              operation: 'move',
              path: file.path,
              target: targetPath
            });
            break; // First matching rule wins
          }
        }
      }

      return {
        success: true,
        filesProcessed: findResult.results.length,
        filesMoved: moves.length,
        moves: moves,
        summary: `Organized ${moves.length} of ${findResult.results.length} files`
      };
    } catch (error: any) {
      return {
        error: `Organize files failed: ${error.message}`,
        details: error.stack
      };
    }
  },

  inspectPath: async (args: {
    path: string;
    showContents?: boolean;
    maxContents?: number;
  }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const stats = await fs.stat(safePath);
      const isDirectory = stats.isDirectory();

      let contents = undefined;
      if (isDirectory && args.showContents) {
        const items = await fs.readdir(safePath, { withFileTypes: true });
        const maxItems = args.maxContents || 20;
        contents = items.slice(0, maxItems).map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'folder' : 'file'
        }));
        if (items.length > maxItems) {
          contents.push({
            name: `... and ${items.length - maxItems} more items`,
            type: 'info'
          });
        }
      }

      return {
        success: true,
        path: args.path,
        type: isDirectory ? 'folder' : 'file',
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        created: stats.birthtime.toISOString(),
        modified: stats.mtime.toISOString(),
        accessed: stats.atime.toISOString(),
        contents
      };
    } catch (error: any) {
      return {
        error: `Inspect path failed: ${error.message}`,
        path: args.path
      };
    }
  },

  quickFileOps: async (args: {
    operation: 'read' | 'write' | 'createFolder' | 'copy' | 'move' | 'delete';
    path: string;
    target?: string;
    content?: string;
    overwrite?: boolean;
  }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);

      switch (args.operation) {
        case 'read':
          const content = await fs.readFile(safePath, 'utf-8');
          return { success: true, path: args.path, content };

        case 'write':
          if (!args.content)
            return { error: 'Content required for write operation' };
          await fs.mkdir(path.dirname(safePath), { recursive: true });
          await fs.writeFile(safePath, args.content, 'utf-8');
          return {
            success: true,
            message: `File '${args.path}' written successfully`
          };

        case 'createFolder':
          await fs.mkdir(safePath, { recursive: true });
          return {
            success: true,
            message: `Folder '${args.path}' created successfully`
          };

        case 'copy':
          if (!args.target)
            return { error: 'Target required for copy operation' };
          const safeTarget = getSafeWorkspacePath(args.target);

          if (!args.overwrite) {
            try {
              await fs.access(safeTarget);
              return {
                error: `Target '${args.target}' already exists. Use overwrite=true to replace.`
              };
            } catch {
              /* File doesn't exist, proceed */
            }
          }

          await fs.mkdir(path.dirname(safeTarget), { recursive: true });
          await fs.copyFile(safePath, safeTarget);
          return {
            success: true,
            message: `Copied '${args.path}' to '${args.target}'`
          };

        case 'move':
          if (!args.target)
            return { error: 'Target required for move operation' };
          const safeMoveTarget = getSafeWorkspacePath(args.target);
          await fs.mkdir(path.dirname(safeMoveTarget), { recursive: true });
          await fs.rename(safePath, safeMoveTarget);
          return {
            success: true,
            message: `Moved '${args.path}' to '${args.target}'`
          };

        case 'delete':
          const stats = await fs.stat(safePath);
          if (stats.isDirectory()) {
            await fs.rm(safePath, { recursive: true, force: true });
          } else {
            await fs.unlink(safePath);
          }
          return { success: true, message: `Deleted '${args.path}'` };

        default:
          return { error: `Unknown operation: ${args.operation}` };
      }
    } catch (error: any) {
      return {
        error: `${args.operation} operation failed: ${error.message}`,
        path: args.path
      };
    }
  }
};

// Helper functions
function parseSize(sizeStr: string): number {
  const units: { [key: string]: number } = {
    B: 1,
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024
  };

  const match = sizeStr.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB)$/i);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  return value * (units[unit] || 1);
}

function matchesCondition(file: any, condition: string): boolean {
  // Simple condition matching - can be expanded
  if (condition.startsWith('ext=')) {
    const extensions = condition.substring(4).split(',');
    return extensions.some(ext =>
      file.path.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
    );
  }

  if (condition.includes('size>')) {
    const sizeStr = condition.split('size>')[1];
    const minSize = parseSize(sizeStr);
    return file.size > minSize;
  }

  if (condition.includes('name contains')) {
    const searchTerm = condition.split('name contains')[1].trim();
    return file.name.toLowerCase().includes(searchTerm.toLowerCase());
  }

  return false;
}

function interpolateAction(file: any, action: string): string {
  // Simple action interpolation - can be expanded
  const fileDate = new Date(file.created);
  return action
    .replace('{year}', fileDate.getFullYear().toString())
    .replace('{month}', String(fileDate.getMonth() + 1).padStart(2, '0'))
    .replace('{ext}', path.parse(file.path).ext.substring(1));
}
