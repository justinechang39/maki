import type { Tool } from '../core/types.js';

// Tool definitions
import { fileTools, fileToolImplementations } from './file-tools.js';
import { csvTools, csvToolImplementations } from './csv-tools.js';
import { todoTools, todoToolImplementations } from './todo-tools.js';
import { webTools, webToolImplementations } from './web-tools.js';

// Think tool
const thinkTool: Tool = {
  type: 'function',
  function: {
    name: 'think',
    description: 'CRITICAL PLANNING TOOL: Use this to break down complex tasks, analyze requirements, and create step-by-step execution plans. This is your internal workspace - the user cannot see your thoughts. Always use this tool before multi-step operations to ensure systematic execution. Use multiple times during complex workflows to reassess and adjust your approach.',
    parameters: {
      type: 'object',
      properties: {
        thoughts: {
          type: 'string',
          description: 'Your detailed analysis, step-by-step plan, decision reasoning, or problem decomposition. Include what you discovered, what you plan to do next, and why.'
        }
      },
      required: ['thoughts']
    }
  }
};

const thinkImplementation = async (args: { thoughts: string }) => {
  return { success: true, message: 'Thinking process documented.', thoughts_received: args.thoughts };
};

// Export all tools and implementations
export const tools: Tool[] = [
  thinkTool,
  ...fileTools,
  ...csvTools,
  ...todoTools,
  ...webTools
];

export const toolImplementations: Record<string, (args: any) => Promise<any>> = {
  think: thinkImplementation,
  ...fileToolImplementations,
  ...csvToolImplementations,
  ...todoToolImplementations,
  ...webToolImplementations
};