import * as fs from 'fs/promises';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js';
import {
  isValidCSVContent,
  parseCSVContent,
  writeCSVContent
} from '../core/csv-utils.js';
import type { Tool } from '../core/types.js';
import { getSafeWorkspacePath } from '../core/utils.js';

export const csvTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'parseCSV',
      description: `DATA ANALYSIS: Inspect CSV files and understand their structure. Returns column headers, row count, data types, and preview rows. Essential first step before manipulating CSV data. Use this to understand the data before making changes.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `CSV file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be an existing .csv file.`
          },
          hasHeaders: {
            type: 'boolean',
            description:
              'TRUE: First row contains column names (most common). FALSE: Data starts from first row. Defaults to true.'
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateCSVCell',
      description: `PRECISION DATA EDITING: Modify individual cells in CSV data. Use for correcting specific values, updating single data points, or making targeted changes. Use parseCSV first to understand the structure and identify correct row/column.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `CSV file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing CSV file.`
          },
          rowIndex: {
            type: 'number',
            description:
              'Data row number (0-based, excluding header row). Use parseCSV preview to identify correct row.'
          },
          column: {
            type: 'string',
            description:
              'Column name (if headers exist) or numeric column index as string. Use exact header name from parseCSV results.'
          },
          value: {
            type: 'string',
            description:
              'New cell value. Will be stored as text - format appropriately for your data type.'
          },
          hasHeaders: {
            type: 'boolean',
            description:
              'Must match the actual file structure. Use parseCSV to confirm. Defaults to true.'
          }
        },
        required: ['path', 'rowIndex', 'column', 'value']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addCSVRow',
      description: `DATA EXPANSION: Insert new records into CSV files. Use for adding new data entries, appending calculated results, or expanding datasets. Provide data as key-value pairs matching column headers.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `CSV file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing CSV file.`
          },
          rowData: {
            type: 'object',
            description:
              'Data object with column names as keys and values as strings. Keys must match existing column headers exactly.'
          },
          hasHeaders: {
            type: 'boolean',
            description:
              'Must match file structure. Use parseCSV to verify. Defaults to true.'
          }
        },
        required: ['path', 'rowData']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'removeCSVRow',
      description: `DATA CLEANUP: Delete specific rows from CSV files. Use for removing invalid data, duplicates, or outdated records. Use parseCSV first to identify the correct row index to remove.`,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: `CSV file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing CSV file.`
          },
          rowIndex: {
            type: 'number',
            description:
              'Row number to delete (0-based, excluding header). Use parseCSV preview to identify correct row. Cannot be undone.'
          },
          hasHeaders: {
            type: 'boolean',
            description:
              'Must match file structure. Use parseCSV to verify. Defaults to true.'
          }
        },
        required: ['path', 'rowIndex']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'filterCSV',
      description: `DATA EXTRACTION: Create filtered subsets of CSV data based on criteria. Generates new CSV files containing only rows matching your conditions. Ideal for data analysis, reporting, or creating focused datasets.`,
      parameters: {
        type: 'object',
        properties: {
          sourcePath: {
            type: 'string',
            description: `Source CSV file path within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Must be existing CSV file.`
          },
          targetPath: {
            type: 'string',
            description: `Output file path for filtered results. Will create new CSV file with matching rows and same structure.`
          },
          column: {
            type: 'string',
            description:
              'Column name to apply filter criteria. Use exact header name from parseCSV results.'
          },
          operator: {
            type: 'string',
            description:
              'Comparison operation: "equals" (exact match), "contains" (substring), "startsWith"/"endsWith" (positional), "greaterThan"/"lessThan" (numeric/alphabetic)',
            enum: [
              'equals',
              'contains',
              'startsWith',
              'endsWith',
              'greaterThan',
              'lessThan'
            ]
          },
          value: {
            type: 'string',
            description:
              'Comparison value. For numeric comparisons, ensure value can be parsed as number.'
          },
          hasHeaders: {
            type: 'boolean',
            description: 'Must match source file structure. Defaults to true.'
          }
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
          path: {
            type: 'string',
            description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').`
          },
          sortColumns: {
            type: 'array',
            description: 'Array of column sort specifications.',
            items: {
              type: 'object',
              properties: {
                column: {
                  type: 'string',
                  description: 'Column name to sort by.'
                },
                direction: {
                  type: 'string',
                  description: 'Sort direction: "asc" or "desc".',
                  enum: ['asc', 'desc']
                }
              },
              required: ['column', 'direction']
            }
          },
          hasHeaders: {
            type: 'boolean',
            description: 'Whether the CSV file has headers. Defaults to true.'
          }
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
          path: {
            type: 'string',
            description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').`
          },
          columnName: {
            type: 'string',
            description: 'Name of the new column.'
          },
          defaultValue: {
            type: 'string',
            description:
              'Default value for existing rows. Defaults to empty string.'
          },
          position: {
            type: 'number',
            description:
              'Zero-based position to insert the column. Defaults to end.'
          },
          hasHeaders: {
            type: 'boolean',
            description: 'Whether the CSV file has headers. Defaults to true.'
          }
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
          path: {
            type: 'string',
            description: `The CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').`
          },
          column: { type: 'string', description: 'Column name to remove.' },
          hasHeaders: {
            type: 'boolean',
            description: 'Whether the CSV file has headers. Defaults to true.'
          }
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
          sourcePath: {
            type: 'string',
            description: `Source CSV file path relative to the workspace root ('${WORKSPACE_DIRECTORY_NAME}').`
          },
          targetPath: {
            type: 'string',
            description: `Target CSV file path where aggregated results will be saved.`
          },
          groupByColumns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Columns to group by.'
          },
          aggregations: {
            type: 'array',
            description: 'Array of aggregation specifications.',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: 'Column to aggregate.' },
                operation: {
                  type: 'string',
                  description: 'Aggregation operation.',
                  enum: ['sum', 'count', 'average', 'min', 'max']
                },
                alias: {
                  type: 'string',
                  description: 'Optional alias for the result column.'
                }
              },
              required: ['column', 'operation']
            }
          },
          hasHeaders: {
            type: 'boolean',
            description: 'Whether the CSV file has headers. Defaults to true.'
          }
        },
        required: ['sourcePath', 'targetPath', 'aggregations']
      }
    }
  }
];

export const csvToolImplementations: Record<
  string,
  (args: any) => Promise<any>
> = {
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
          sampleValues: rows
            .slice(0, 3)
            .map(row => row[header])
            .filter(val => val !== null && val !== '')
        }))
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  updateCSVCell: async (args: {
    path: string;
    rowIndex: number;
    column: string;
    value: string;
    hasHeaders?: boolean;
  }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');

      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);

      if (args.rowIndex < 0 || args.rowIndex >= rows.length) {
        return {
          error: `Invalid row index ${args.rowIndex}. File has ${rows.length} rows.`
        };
      }

      // Determine column identifier
      let columnKey = args.column;
      if (hasHeaders && !headers.includes(args.column)) {
        // Try to parse as numeric index
        const colIndex = parseInt(args.column, 10);
        if (isNaN(colIndex) || colIndex < 0 || colIndex >= headers.length) {
          return {
            error: `Invalid column '${
              args.column
            }'. Available columns: ${headers.join(', ')}`
          };
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
        message: `Updated cell at row ${args.rowIndex}, column '${columnKey}' to '${args.value}'`,
        updatedValue: args.value
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  // ... (I'll continue with the other CSV tool implementations in the next part due to length)

  addCSVRow: async (args: {
    path: string;
    rowData: Record<string, any>;
    hasHeaders?: boolean;
  }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');

      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);

      // Add the new row
      rows.push(args.rowData);

      // Write back to file
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');

      return {
        success: true,
        message: `Added new row to ${args.path}`,
        newRowCount: rows.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  removeCSVRow: async (args: {
    path: string;
    rowIndex: number;
    hasHeaders?: boolean;
  }) => {
    try {
      const safePath = getSafeWorkspacePath(args.path);
      const content = await fs.readFile(safePath, 'utf-8');

      const hasHeaders = args.hasHeaders !== false;
      const { headers, rows } = await parseCSVContent(content, hasHeaders);

      if (args.rowIndex < 0 || args.rowIndex >= rows.length) {
        return {
          error: `Invalid row index ${args.rowIndex}. File has ${rows.length} rows.`
        };
      }

      // Remove the row
      const removedRow = rows.splice(args.rowIndex, 1)[0];

      // Write back to file
      const newContent = await writeCSVContent(headers, rows, hasHeaders);
      await fs.writeFile(safePath, newContent, 'utf-8');

      return {
        success: true,
        message: `Removed row ${args.rowIndex} from ${args.path}`,
        removedRow,
        newRowCount: rows.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  // Placeholder implementations for the remaining tools - these would need the full logic
  filterCSV: async (args: any) => {
    return { error: 'filterCSV implementation pending' };
  },

  sortCSV: async (args: any) => {
    return { error: 'sortCSV implementation pending' };
  },

  addCSVColumn: async (args: any) => {
    return { error: 'addCSVColumn implementation pending' };
  },

  removeCSVColumn: async (args: any) => {
    return { error: 'removeCSVColumn implementation pending' };
  },

  aggregateCSV: async (args: any) => {
    return { error: 'aggregateCSV implementation pending' };
  }
};
