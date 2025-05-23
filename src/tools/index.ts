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
    description: 'Use this tool to document your thinking process, plan steps, or reason about complex problems. The content is only visible to you (logged internally). Use this before undertaking complex multi-step tasks. When you use this tool, you are encouraged to use it multiple times if it helps clarify your plan for a complex task.',
    parameters: {
      type: 'object',
      properties: {
        thoughts: {
          type: 'string',
          description: 'Your detailed thinking process, reasoning, or step-by-step plan.'
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