import { ChatOpenAI } from '@langchain/openai';
import { createToolCallingAgent, AgentExecutor } from 'langchain/agents';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { OPENROUTER_API_KEY, MODEL_ID } from './config.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import { tools, toolImplementations } from '../tools/index.js';
import type { Tool } from './types.js';

// Configure ChatOpenAI for OpenRouter
const llm = new ChatOpenAI({
  apiKey: OPENROUTER_API_KEY,
  modelName: MODEL_ID,
  configuration: {
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': 'https://github.com/justinechang39/maki',
      'X-Title': 'maki CLI tool'
    }
  },
  timeout: 60000,
  temperature: 0.1
});

// Convert our tool definitions to LangChain tools with improved error handling
function convertToLangChainTools(toolDefs: Tool[]): DynamicStructuredTool[] {
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
          const result = await implementation(args);
          
          // Return the actual result, not stringified for better LLM processing
          // LangChain will handle serialization as needed
          return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          
          // Return a clear error message that the LLM can understand and act upon
          return `Error: ${errorMessage}. Please try a different approach or check your input parameters.`;
        }
      }
    });
  });
}

// Create the agent
export async function createMakiAgent() {
  try {
    const langchainTools = convertToLangChainTools(tools);
    
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', SYSTEM_PROMPT],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad')
    ]);

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
      earlyStoppingMethod: 'generate', // Better handling of tool outputs
      handleParsingErrors: (error: Error) => {
        console.error('❌ Agent parsing error:', error);
        return `I encountered a parsing error: ${error.message}. Let me try a different approach to help you.`;
      }
    });

    return agentExecutor;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to create maki agent: ${errorMessage}`);
  }
}

// Execute agent with error handling and detailed logging
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
    const toolCalls = result.intermediateSteps?.map((step: any) => {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('\n❌ Agent execution error:', error);
    
    return {
      output: 'I encountered an error while processing your request. Please try again or rephrase your question.',
      error: errorMessage
    };
  }
}