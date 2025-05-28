import * as csv from 'fast-csv';
import type { CSVRow } from './types.js';

/**
 * Parse CSV content from string to structured data
 */
export async function parseCSVContent(
  content: string,
  hasHeaders: boolean = true
): Promise<{ headers: string[]; rows: CSVRow[] }> {
  return new Promise((resolve, reject) => {
    const rows: any[] = [];
    let headers: string[] = [];

    csv
      .parseString(content, { headers: hasHeaders })
      .on('data', row => {
        if (hasHeaders) {
          rows.push(row);
          if (headers.length === 0) {
            headers = Object.keys(row);
          }
        } else {
          rows.push(row);
        }
      })
      .on('headers', headerArray => {
        headers = headerArray;
      })
      .on('end', () => {
        if (!hasHeaders && rows.length > 0) {
          // Generate headers if not provided: Column1, Column2, etc.
          headers = Object.keys(rows[0]).map(
            (_, index) => `Column${index + 1}`
          );
        }
        resolve({ headers, rows });
      })
      .on('error', error => reject(error));
  });
}

/**
 * Convert structured data back to CSV string
 */
export async function writeCSVContent(
  headers: string[],
  rows: CSVRow[],
  includeHeaders: boolean = true
): Promise<string> {
  return new Promise((resolve, reject) => {
    csv
      .writeToString(rows, {
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
export function isValidCSVContent(content: string): {
  valid: boolean;
  reason?: string;
} {
  if (!content.trim()) {
    return { valid: false, reason: 'File is empty' };
  }

  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return { valid: false, reason: 'No valid lines found' };
  }

  // Check if first few lines have consistent comma count
  const firstLineCommas = (lines[0].match(/,/g) || []).length;
  const inconsistentLines = lines
    .slice(0, Math.min(5, lines.length))
    .filter(line => (line.match(/,/g) || []).length !== firstLineCommas);

  if (inconsistentLines.length > 0) {
    return { valid: false, reason: 'Inconsistent number of columns detected' };
  }

  return { valid: true };
}
