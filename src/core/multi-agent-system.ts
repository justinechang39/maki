import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { toolImplementations, tools } from '../tools/index.js';
import { OPENROUTER_API_KEY, SELECTED_MODEL } from './config.js';
import { COORDINATOR_PROMPT } from './coordinator-prompt.js';
import { SYSTEM_PROMPT } from './system-prompt.js';

// Define the shared state between agents
const GraphState = Annotation.Root({
  input: Annotation<string>,
  task_type: Annotation<string>,
  web_content: Annotation<string>,
  pdf_links: Annotation<string[]>,
  downloaded_files: Annotation<string[]>,
  analysis: Annotation<string>,
  summary: Annotation<string>,
  final_output: Annotation<string>,
  needs_delegation: Annotation<boolean>,
  execution_mode: Annotation<string>, // 'PARALLEL' or 'SEQUENTIAL'
  agent_results: Annotation<Record<string, string>>
});

// Create LLM instance
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
    temperature: 0.1
  });
}

// Convert tools for agent use
function createAgentTools(toolNames: string[]): DynamicStructuredTool[] {
  return toolNames.map(toolName => {
    const tool = tools.find(t => t.function.name === toolName);
    const implementation = toolImplementations[toolName];

    if (!tool || !implementation) {
      throw new Error(`Tool ${toolName} not found`);
    }

    return new DynamicStructuredTool({
      name: toolName,
      description: tool.function.description,
      schema: tool.function.parameters || {},
      func: async (args: any) => {
        try {
          const result = await implementation(args);
          return typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);
        } catch (error) {
          return `Error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
        }
      }
    });
  });
}

// Create a full-capability sub-agent (has access to ALL tools, just like main agent)
async function createSubAgent(role: string, instructions: string) {
  const llm = createLLM();
  const allTools = createAgentTools(tools.map(t => t.function.name)); // ALL tools

  // Use proper LangChain prompt format for tool calling agents
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `${SYSTEM_PROMPT}

## SUB-AGENT CONTEXT
You are a specialized ${role} sub-agent working as part of a multi-agent system.

Your specific mission: ${instructions}

You have been delegated this specific task by the coordinator agent. Focus exclusively on completing your assigned mission using the tools available to you. You have full access to ALL tools - use them aggressively to accomplish your goals.`
    ],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}']
  ]);

  const agent = await createToolCallingAgent({
    llm,
    tools: allTools,
    prompt
  });

  return new AgentExecutor({
    agent,
    tools: allTools,
    maxIterations: 15,
    returnIntermediateSteps: true
  });
}

// Coordinator Agent - analyzes task and creates detailed delegation plan
async function coordinatorAgent(state: typeof GraphState.State) {
  const llm = createLLM();

  const prompt = ChatPromptTemplate.fromTemplate(
    COORDINATOR_PROMPT +
      `

User request: {input}

Analyze this request and respond with your delegation plan.`
  );

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const response = await chain.invoke({ input: state.input });

  const isComplex = response.includes('COMPLEXITY: COMPLEX');
  const isParallel = response.includes('EXECUTION: PARALLEL');

  console.log(
    `🧠 Coordinator: ${
      isComplex
        ? isParallel
          ? 'Delegating with PARALLEL execution'
          : 'Delegating with SEQUENTIAL execution'
        : 'Handling as simple task'
    }`
  );

  return {
    ...state,
    needs_delegation: isComplex,
    task_type: isComplex ? 'complex' : 'simple',
    execution_mode: isParallel ? 'PARALLEL' : 'SEQUENTIAL',
    analysis: response // Store the full plan
  };
}

// Multi-Agent Executor - executes the plan from coordinator (supports parallel execution)
async function multiAgentExecutor(state: typeof GraphState.State) {
  console.log(
    `🤖 Multi-Agent Executor: Processing complex task with ${state.execution_mode} execution`
  );

  try {
    // Parse the plan from coordinator
    const plan = state.analysis;
    const planLines = plan
      .split('\n')
      .filter(line => line.trim().startsWith('- Agent'));

    const agentTasks = planLines
      .map(line => {
        const match = line.match(/- Agent \d+: \[(.*?)\] - (.*)/);
        if (match) {
          return {
            role: match[1],
            instructions: match[2]
          };
        }
        return null;
      })
      .filter(
        (task): task is { role: string; instructions: string } => task !== null
      );

    let results: string[] = [];

    if (state.execution_mode === 'PARALLEL') {
      console.log('⚡ Executing sub-agents in PARALLEL');

      // Execute all agents in parallel
      const parallelPromises = agentTasks.map(async (task, i) => {
        console.log(`🔧 Starting parallel sub-agent ${i + 1}: ${task.role}`);

        const subAgent = await createSubAgent(task.role, task.instructions);
        const result = await subAgent.invoke({
          input: `Original request: ${state.input}\n\nYour specific task: ${task.instructions}`
        });

        console.log(`✅ Completed parallel sub-agent ${i + 1}: ${task.role}`);
        return `${task.role} completed: ${result.output}`;
      });

      // Wait for all to complete
      results = await Promise.all(parallelPromises);
    } else {
      console.log('🔄 Executing sub-agents in SEQUENCE');

      // Execute agents sequentially (original behavior)
      for (let i = 0; i < agentTasks.length; i++) {
        const task = agentTasks[i];
        console.log(`🔧 Executing sequential sub-agent ${i + 1}: ${task.role}`);

        const subAgent = await createSubAgent(task.role, task.instructions);
        const result = await subAgent.invoke({
          input: `Original request: ${state.input}\n\nYour specific task: ${
            task.instructions
          }\n\nPrevious results: ${results.join('\n\n')}`
        });

        results.push(`${task.role} completed: ${result.output}`);
        console.log(`✅ Completed sequential sub-agent ${i + 1}: ${task.role}`);
      }
    }

    // Combine all results
    const finalOutput = `Multi-agent task completed with ${
      state.execution_mode
    } execution!\n\n${results.join('\n\n')}`;

    return {
      ...state,
      final_output: finalOutput,
      agent_results: Object.fromEntries(
        agentTasks.map((task, i) => [task.role, results[i] || ''])
      )
    };
  } catch (error) {
    return {
      ...state,
      final_output: `Error in multi-agent execution: ${error}`
    };
  }
}

// Direct Response Agent - handles simple tasks
async function directResponseAgent(state: typeof GraphState.State) {
  console.log('💬 Direct Response Agent: Handling simple task');

  const llm = createLLM();

  const prompt = ChatPromptTemplate.fromTemplate(`
    You are a helpful assistant. Respond directly to the user's request.
    
    User input: {input}
    
    Provide a clear, helpful response.
  `);

  const chain = prompt.pipe(llm).pipe(new StringOutputParser());
  const response = await chain.invoke({ input: state.input });

  return {
    ...state,
    final_output: response
  };
}

// Routing function - decides which path to take
function shouldDelegate(state: typeof GraphState.State) {
  return state.needs_delegation ? 'delegate' : 'direct';
}

// Create the multi-agent workflow
export function createMultiAgentSystem() {
  const workflow = new StateGraph(GraphState)
    // Add nodes
    .addNode('coordinator', coordinatorAgent)
    .addNode('multi_executor', multiAgentExecutor)
    .addNode('direct_response', directResponseAgent)

    // Define the flow
    .addEdge(START, 'coordinator')
    .addConditionalEdges('coordinator', shouldDelegate, {
      delegate: 'multi_executor',
      direct: 'direct_response'
    })

    // Both paths go to END
    .addEdge('multi_executor', END)
    .addEdge('direct_response', END);

  return workflow.compile();
}

// Execute the multi-agent system
export async function executeMultiAgent(
  input: string,
  onProgress?: (agentName: string, message: string) => void
): Promise<{
  output: string;
  agents_used: string[];
  task_type: string;
}> {
  try {
    const graph = createMultiAgentSystem();

    console.log('🚀 Starting multi-agent system...');

    const result = await graph.invoke({
      input,
      task_type: '',
      web_content: '',
      pdf_links: [],
      downloaded_files: [],
      analysis: '',
      summary: '',
      final_output: '',
      needs_delegation: false,
      execution_mode: 'PARALLEL',
      agent_results: {}
    });

    const agentsUsed = [];
    if (result.task_type === 'complex') {
      agentsUsed.push('coordinator', 'multi_executor');
    } else {
      agentsUsed.push('coordinator', 'direct_response');
    }

    return {
      output: result.final_output,
      agents_used: agentsUsed,
      task_type: result.task_type
    };
  } catch (error) {
    console.error('❌ Multi-agent system error:', error);
    return {
      output:
        'I encountered an error while processing your request. Please try again.',
      agents_used: [],
      task_type: 'error'
    };
  }
}
