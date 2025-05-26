import fs from 'fs';
import path from 'path';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js';
import type { Tool } from '../core/types.js';
import { getSafeWorkspacePath, isSafeUrl } from '../core/utils.js';

export const webTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'fetchWebsiteContent',
      description:
        'EXTERNAL DATA RETRIEVAL: Fetch content from public websites for research, analysis, or data collection. Returns raw HTML/text content that you can parse and extract information from. Use for gathering external data, checking APIs, or retrieving reference materials. Cannot access private/internal networks.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Public HTTP/HTTPS URL to fetch (e.g., "https://api.example.com/data", "https://docs.example.com"). Must be fully qualified URL starting with http:// or https://'
          },
          maxLength: {
            type: 'number',
            description:
              'Content length limit in characters. Default: 10,000. Range: 100-50,000. Larger values for complete documents, smaller for quick checks.'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'downloadFile',
      description:
        'EXTERNAL FILE DOWNLOAD: Download files from public URLs to the local workspace. Supports various file types including images, documents, archives, etc. Shows download progress and saves to specified location.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Public HTTP/HTTPS URL of the file to download (e.g., "https://example.com/file.pdf", "https://api.example.com/data.json"). Must be fully qualified URL starting with http:// or https://'
          },
          filename: {
            type: 'string',
            description:
              'Optional filename to save as. If not provided, will extract from URL or generate one. Include file extension (e.g., "document.pdf", "data.json")'
          },
          directory: {
            type: 'string',
            description: `Directory to save the file in within workspace (relative to '${WORKSPACE_DIRECTORY_NAME}'). Default: "downloads". Will create if it doesn't exist.`
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'checkUrlStatus',
      description:
        'WEB UTILITY: Check if a URL is accessible and get basic information like status code, content type, and response headers. Useful for validating links before downloading or fetching content.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description:
              'Public HTTP/HTTPS URL to check (e.g., "https://example.com/api", "https://example.com/file.pdf")'
          }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'extractLinksFromPage',
      description:
        'WEB ANALYSIS: Extract all links from a webpage. Returns a list of URLs found on the page, categorized by type (internal, external, files, etc.). Useful for web scraping and site analysis.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Public HTTP/HTTPS URL of the webpage to analyze'
          },
          linkTypes: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Types of links to extract: "internal", "external", "files", "images", "all". Default: ["all"]'
          }
        },
        required: ['url']
      }
    }
  }
];

export const webToolImplementations: Record<
  string,
  (args: any) => Promise<any>
> = {
  fetchWebsiteContent: async (args: { url: string; maxLength?: number }) => {
    let { url, maxLength = 10000 } = args;
    maxLength = Math.max(100, Math.min(maxLength, 50000));

    if (!isSafeUrl(url)) {
      const reason = `Invalid or disallowed URL: ${url}. Must be a public HTTP/HTTPS URL and not point to local or private network resources.`;
      return { error: reason };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FileAssistantCLI-Agent/1.0 (AI Agent)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7'
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
      return {
        error: `Error fetching URL ${url}: ${error.message}. Check server logs for details.`
      };
    }
  },

  downloadFile: async (
    args: { url: string; filename?: string; directory?: string },
    progressCallback?: (
      progress: number,
      downloadedSize: number,
      totalSize: number,
      speed: number
    ) => void
  ) => {
    const { url, filename, directory = 'downloads' } = args;

    if (!isSafeUrl(url)) {
      const reason = `Invalid or disallowed URL: ${url}. Must be a public HTTP/HTTPS URL and not point to local or private network resources.`;
      return { error: reason };
    }

    try {
      // Create downloads directory if it doesn't exist
      const downloadDir = getSafeWorkspacePath(directory);

      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // Determine filename
      let finalFilename = filename;
      if (!finalFilename) {
        const urlPath = new URL(url).pathname;
        finalFilename = path.basename(urlPath) || `download_${Date.now()}`;

        // If no extension, try to get from content-type later
        if (!path.extname(finalFilename)) {
          finalFilename += '.bin';
        }
      }

      const filePath = path.join(downloadDir, finalFilename);

      // Start download with progress tracking
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FileAssistantCLI-Agent/1.0 (AI Agent)'
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          error: `Failed to download file. Status: ${response.status} ${response.statusText}`,
          statusCode: response.status,
          url
        };
      }

      const contentLength = response.headers.get('content-length');
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      const contentType = response.headers.get('content-type') || 'unknown';

      // Update filename extension based on content-type if needed
      if (
        !filename &&
        !path.extname(finalFilename) &&
        contentType !== 'unknown'
      ) {
        const ext = getExtensionFromContentType(contentType);
        if (ext) {
          finalFilename = finalFilename.replace('.bin', ext);
          const newFilePath = path.join(downloadDir, finalFilename);
          if (fs.existsSync(filePath)) {
            fs.renameSync(filePath, newFilePath);
          }
        }
      }

      if (!response.body) {
        return { error: 'No response body to download' };
      }

      const fileStream = fs.createWriteStream(filePath);
      let downloadedSize = 0;
      let lastUpdateTime = Date.now();
      let lastDownloadedSize = 0;

      // Convert ReadableStream to Node.js stream and track progress
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        fileStream.write(value);
        downloadedSize += value.length;

        // Calculate speed and progress
        const now = Date.now();
        const timeDiff = now - lastUpdateTime;

        if (timeDiff >= 500) {
          // Update every 500ms
          const sizeDiff = downloadedSize - lastDownloadedSize;
          const speed = timeDiff > 0 ? (sizeDiff / timeDiff) * 1000 : 0; // bytes per second
          const progress =
            totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;

          // Call progress callback if provided
          if (progressCallback) {
            progressCallback(progress, downloadedSize, totalSize, speed);
          }

          lastUpdateTime = now;
          lastDownloadedSize = downloadedSize;
        }
      }

      fileStream.end();

      // Wait for file to be fully written
      await new Promise<void>((resolve, reject) => {
        fileStream.on('finish', () => resolve());
        fileStream.on('error', reject);
      });

      const stats = fs.statSync(filePath);

      return {
        success: true,
        url,
        filename: finalFilename,
        filePath: path.relative(getSafeWorkspacePath(), filePath),
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        contentType,
        downloadProgress: {
          completed: true,
          totalSize: stats.size,
          progress: 100
        },
        message: `📥 Successfully downloaded ${finalFilename} (${formatBytes(
          stats.size
        )}) to ${path.relative(getSafeWorkspacePath(), filePath)}`
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { error: `Download of ${url} timed out after 2 minutes.` };
      }
      return { error: `Error downloading file from ${url}: ${error.message}` };
    }
  },

  checkUrlStatus: async (args: { url: string }) => {
    const { url } = args;

    if (!isSafeUrl(url)) {
      const reason = `Invalid or disallowed URL: ${url}. Must be a public HTTP/HTTPS URL and not point to local or private network resources.`;
      return { error: reason };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD to avoid downloading content
        signal: controller.signal,
        headers: {
          'User-Agent': 'FileAssistantCLI-Agent/1.0 (AI Agent)'
        }
      });
      clearTimeout(timeoutId);

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      return {
        success: true,
        url,
        statusCode: response.status,
        statusText: response.statusText,
        accessible: response.ok,
        contentType: response.headers.get('content-type') || 'unknown',
        contentLength: response.headers.get('content-length') || 'unknown',
        lastModified: response.headers.get('last-modified') || 'unknown',
        headers,
        message: `URL is ${response.ok ? 'accessible' : 'not accessible'} (${
          response.status
        } ${response.statusText})`
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return { error: `Request to ${url} timed out after 10 seconds.` };
      }
      return {
        success: false,
        url,
        accessible: false,
        error: `Error checking URL ${url}: ${error.message}`
      };
    }
  },

  extractLinksFromPage: async (args: { url: string; linkTypes?: string[] }) => {
    const { url, linkTypes = ['all'] } = args;

    if (!isSafeUrl(url)) {
      const reason = `Invalid or disallowed URL: ${url}. Must be a public HTTP/HTTPS URL and not point to local or private network resources.`;
      return { error: reason };
    }

    try {
      // First fetch the page content
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'FileAssistantCLI-Agent/1.0 (AI Agent)',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!response.ok) {
        return {
          error: `Failed to fetch page. Status: ${response.status} ${response.statusText}`,
          statusCode: response.status,
          url
        };
      }

      const html = await response.text();
      const baseUrl = new URL(url);

      // Extract links using regex (simple approach, could be enhanced with proper HTML parser)
      const linkRegex = /href\s*=\s*["']([^"']+)["']/gi;
      const links: string[] = [];
      let match;

      while ((match = linkRegex.exec(html)) !== null) {
        try {
          const linkUrl = new URL(match[1], baseUrl).href;
          links.push(linkUrl);
        } catch {
          // Skip invalid URLs
        }
      }

      // Categorize links
      const categorizedLinks = {
        all: [...new Set(links)], // Remove duplicates
        internal: links.filter(
          link => new URL(link).hostname === baseUrl.hostname
        ),
        external: links.filter(
          link => new URL(link).hostname !== baseUrl.hostname
        ),
        files: links.filter(link =>
          /\.(pdf|doc|docx|xls|xlsx|zip|rar|tar|gz|jpg|jpeg|png|gif|svg|mp4|mp3|avi)$/i.test(
            link
          )
        ),
        images: links.filter(link =>
          /\.(jpg|jpeg|png|gif|svg|webp|bmp|ico)$/i.test(link)
        )
      };

      // Filter by requested link types
      const result: Record<string, string[]> = {};
      for (const type of linkTypes) {
        if (type in categorizedLinks) {
          result[type] =
            categorizedLinks[type as keyof typeof categorizedLinks];
        }
      }

      return {
        success: true,
        url,
        linkTypes,
        links: result,
        totalFound: categorizedLinks.all.length,
        message: `Found ${categorizedLinks.all.length} unique links on ${url}`
      };
    } catch (error: any) {
      return { error: `Error extracting links from ${url}: ${error.message}` };
    }
  }
};

// Helper functions
function getExtensionFromContentType(contentType: string): string | null {
  const typeMap: Record<string, string> = {
    'application/pdf': '.pdf',
    'application/json': '.json',
    'application/xml': '.xml',
    'text/html': '.html',
    'text/plain': '.txt',
    'text/csv': '.csv',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'application/zip': '.zip',
    'application/x-rar': '.rar',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3'
  };

  const baseType = contentType.split(';')[0].trim();
  return typeMap[baseType] || null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
