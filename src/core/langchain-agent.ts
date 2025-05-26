import {
  ChatPromptTemplate,
  MessagesPlaceholder
} from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { toolImplementations, tools } from '../tools/index.js';
import { OPENROUTER_API_KEY, SELECTED_MODEL } from './config.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import type { Tool } from './types.js';

// Store usage info globally for access after LLM calls
let lastUsageInfo: any = null;

// Create LLM instance dynamically to use current selected model
function createLLM() {
  return new ChatOpenAI({
    apiKey: OPENROUTER_API_KEY,
    modelName: SELECTED_MODEL,
    configuration: {
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/justinechang39/maki',
        'X-Title': 'maki CLI tool'
      }
    },
    timeout: 60000,
    temperature: 0.1,
    modelKwargs: {
      usage: { include: true }
    },
    callbacks: [
      {
        handleLLMEnd(output) {
          // Extract usage info from the full LLM output
          const usage = output.llmOutput?.tokenUsage;
          if (usage) {
            lastUsageInfo = {
              prompt_tokens: usage.promptTokens || 0,
              completion_tokens: usage.completionTokens || 0,
              total_tokens: usage.totalTokens || 0,
              cost: 0 // Not available through LangChain
            };
          }
        }
      }
    ]
  });
}

// Convert our tool definitions to LangChain tools with improved error handling
function convertToLangChainTools(
  toolDefs: Tool[],
  onToolProgress?: (toolName: string, result: string) => void
): DynamicStructuredTool[] {
  return toolDefs.map(tool => {
    const toolName = tool.function.name;
    const implementation = toolImplementations[toolName];

    if (!implementation) {
      throw new Error(`No implementation found for tool: ${toolName}`);
    }

    return new DynamicStructuredTool({
      name: toolName,
      description: tool.function.description,
      schema: tool.function.parameters || {},
      func: async (args: any) => {
        try {
          // Show tool execution start
          if (onToolProgress) {
            onToolProgress(toolName, `Running tool (${toolName})`);
          }

          const result = await implementation(args);
          const resultString =
            typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2);

          // Show tool result
          if (onToolProgress) {
            const truncatedResult =
              resultString.length > 200
                ? resultString.substring(0, 200) + '...'
                : resultString;
            onToolProgress(
              toolName,
              `Tool result returned: ${truncatedResult}`
            );
          }

          // Return the actual result, not stringified for better LLM processing
          // LangChain will handle serialization as needed
          return resultString;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error occurred';

          // Show error if progress callback exists
          if (onToolProgress) {
            onToolProgress(toolName, `Tool error: ${errorMessage}`);
          }

          // Return a clear error message that the LLM can understand and act upon
          return `Error: ${errorMessage}. Please try a different approach or check your input parameters.`;
        }
      }
    });
  });
}

// Create the agent
export async function createMakiAgent(
  onToolProgress?: (toolName: string, message: string) => void
) {
  try {
    const langchainTools = convertToLangChainTools(tools, onToolProgress);

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);

    // Create fresh LLM instance to use current selected model
    const llm = createLLM();

    const agent = await createToolCallingAgent({
      llm,
      tools: langchainTools,
      prompt
    });

    const agentExecutor = new AgentExecutor({
      agent,
      tools: langchainTools,
      maxIterations: 15, // Increased for complex multi-tool operations
      verbose: false, // Disable LangChain verbose logging - we have our own
      returnIntermediateSteps: true,
      earlyStoppingMethod: 'force', // Continue executing until completion
      handleParsingErrors: (error: Error) => {
        console.error('❌ Agent parsing error:', error);
        return `I encountered a parsing error: ${error.message}. Let me try a different approach to help you.`;
      }
    });

    return agentExecutor;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to create maki agent: ${errorMessage}`);
  }
}

// Simple execution - progress is handled by tool wrappers
export async function executeAgentWithProgress(
  agent: AgentExecutor,
  input: string,
  chatHistory: any[] = []
): Promise<{
  output: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    cached_tokens?: number;
    reasoning_tokens?: number;
  };
  toolCalls?: Array<{
    tool: string;
    input: any;
    output: any;
  }>;
}> {
  try {
    console.log('🔍 HERE - About to invoke agent');
    const result = await agent.invoke({
      input: input,
      chat_history: chatHistory || []
    });
    console.log(
      '🔍 HERE - Agent result received:',
      typeof result.output,
      result.output?.substring(0, 100)
    );

    // Extract tool calls from intermediate steps
    const toolCalls =
      result.intermediateSteps?.map((step: any) => ({
        tool: step.action.tool,
        input: step.action.toolInput,
        output: step.observation
      })) || [];

    // Use captured usage info from callback
    const usage = lastUsageInfo;
    lastUsageInfo = null; // Reset for next call

    return {
      output: result.output,
      usage: usage,
      toolCalls
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('\n❌ Agent execution error:', error);

    return {
      output:
        'I encountered an error while processing your request. Please try again or rephrase your question.',
      error: errorMessage
    };
  }
}

// Execute agent with error handling and detailed logging (original function for compatibility)
export async function executeAgent(
  agent: AgentExecutor,
  input: string,
  chatHistory: any[] = []
): Promise<{
  output: string;
  error?: string;
  intermediateSteps?: any[];
  toolCalls?: Array<{
    tool: string;
    input: any;
    output: any;
    reasoning?: string;
  }>;
}> {
  try {
    const result = await agent.invoke({
      input: input,
      chat_history: chatHistory || []
    });

    // Process intermediate steps to extract tool information
    const toolCalls =
      result.intermediateSteps?.map((step: any) => {
        const action = step.action;
        const observation = step.observation;

        return {
          tool: action.tool,
          input: action.toolInput,
          output: observation,
          reasoning: action.log || 'No reasoning provided'
        };
      }) || [];

    return {
      output: result.output,
      intermediateSteps: result.intermediateSteps || [],
      toolCalls
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('\n❌ Agent execution error:', error);

    return {
      output:
        'I encountered an error while processing your request. Please try again or rephrase your question.',
      error: errorMessage
    };
  }
}
