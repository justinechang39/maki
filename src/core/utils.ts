import path from 'path';
import { WORKSPACE_DIRECTORY, WORKSPACE_DIRECTORY_NAME } from './config.js';
import type { Message } from './types.js';

/**
 * Checks if a URL is safe to fetch (public, http/https, not local/private).
 */
export function isSafeUrl(urlString: string): boolean {
  try {
    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname;

    // 1. Protocol check (allow http and https)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    // 2. Disallow localhost and loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '[::1]'
    ) {
      return false;
    }

    // 3. Disallow private IP ranges (IPv4 and IPv6 ULA)
    if (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^fd[0-9a-f]{2}:/i.test(hostname)
    ) {
      return false;
    }

    // 4. Disallow .local TLD (often used for mDNS/Bonjour on local networks)
    if (hostname.endsWith('.local')) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Resolves a user-provided path against the workspace directory and ensures it's safe.
 */
export function getSafeWorkspacePath(userPath: string = '.'): string {
  const resolvedPath = path.resolve(WORKSPACE_DIRECTORY, userPath);
  if (!resolvedPath.startsWith(WORKSPACE_DIRECTORY)) {
    throw new Error(
      `Path traversal attempt detected. Path must be within '${WORKSPACE_DIRECTORY_NAME}'.`
    );
  }
  return resolvedPath;
}

/**
 * Validates conversation history, primarily for dangling tool calls.
 */
export function validateConversationHistory(messages: Message[]): Message[] {
  const toolCallIds = new Set<string>();
  const toolResponseIds = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls) {
      message.tool_calls.forEach(call => toolCallIds.add(call.id));
    }
    if (message.role === 'tool' && message.tool_call_id) {
      toolResponseIds.add(message.tool_call_id);
    }
  }

  const unansweredCalls = new Set<string>();
  for (const id of toolCallIds) {
    if (!toolResponseIds.has(id)) {
      unansweredCalls.add(id);
    }
  }

  if (unansweredCalls.size === 0) {
    return messages;
  }

  let lastValidIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.tool_calls) {
      const hasUnanswered = message.tool_calls.some(call =>
        unansweredCalls.has(call.id)
      );
      if (hasUnanswered) {
        lastValidIndex = i;
        break;
      }
    }
  }

  if (lastValidIndex < messages.length) {
    if (lastValidIndex > 0 && messages[lastValidIndex - 1].role === 'user') {
      return messages.slice(0, lastValidIndex - 1);
    }
    return messages.slice(0, lastValidIndex);
  }

  return messages;
}
