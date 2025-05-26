import type { Tool } from '../core/types.js';

// Tool definitions
import { csvToolImplementations, csvTools } from './csv-tools.js';
import { fileToolImplementations, fileTools } from './file-tools.js';
import { todoToolImplementations, todoTools } from './todo-tools.js';
import { webToolImplementations, webTools } from './web-tools.js';

// Think tool
const thinkTool: Tool = {
  type: 'function',
  function: {
    name: 'think',
    description: 'CRITICAL REASONING TOOL: Use this to reason through any situation, plan operations, work through ambiguities, and make informed decisions. This is your private internal workspace - the user cannot see your thoughts. Use this tool whenever you need to reason: before tasks, during execution, to reassess progress, and ALWAYS to double-check your work before presenting results. This should be your most frequently used tool. Use it to ask yourself: Did you do it right? Are you done? Is there anything else that needs to be done?',
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