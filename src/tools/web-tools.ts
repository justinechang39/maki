import { isSafeUrl } from '../core/utils.js';
import type { Tool } from '../core/types.js';

export const webTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'fetchWebsiteContent',
      description: 'EXTERNAL DATA RETRIEVAL: Fetch content from public websites for research, analysis, or data collection. Returns raw HTML/text content that you can parse and extract information from. Use for gathering external data, checking APIs, or retrieving reference materials. Cannot access private/internal networks.',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'Public HTTP/HTTPS URL to fetch (e.g., "https://api.example.com/data", "https://docs.example.com"). Must be fully qualified URL starting with http:// or https://'
          },
          maxLength: {
            type: 'number',
            description: 'Content length limit in characters. Default: 10,000. Range: 100-50,000. Larger values for complete documents, smaller for quick checks.'
          }
        },
        required: ['url']
      }
    }
  }
];

export const webToolImplementations: Record<string, (args: any) => Promise<any>> = {
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
      return { error: `Error fetching URL ${url}: ${error.message}. Check server logs for details.` };
    }
  }
};