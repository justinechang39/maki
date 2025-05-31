import { ChatPromptTemplate } from '@langchain/core/prompts';
import { DynamicStructuredTool } from '@langchain/core/tools';
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph
} from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { toolImplementations, tools } from '../tools/index.js';
import { OPENROUTER_API_KEY, SELECTED_MODEL } from './config.js';
import { COORDINATOR_PROMPT } from './coordinator-prompt.js';

// Global progress callback for user feedback
let globalProgressCallback:
  | ((agentName: string, message: string) => void)
  | undefined;

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
  execution_mode: Annotation<string>, // 'PARALLEL', 'SEQUENTIAL', or 'HYBRID'
  execution_phases: Annotation<
    Array<{
      mode: string;
      tasks: Array<{ role: string; instructions: string }>;
    }>
  >,
  agent_results: Annotation<Record<string, string>>,
  complexity_detected: Annotation<boolean>, // For dynamic switching
  bulk_operation_data: Annotation<any[]> // Store data for bulk operations
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

  // Wrap tools to report execution via progress callback
  const wrappedTools = tools.map(toolDef => {
    const implementation = toolImplementations[toolDef.function.name];

    return new DynamicStructuredTool({
      name: toolDef.function.name,
      description: toolDef.function.description,
      schema: toolDef.function.parameters || {},
      func: async (args: any) => {
        try {
          // Report tool execution start
          globalProgressCallback?.(
            role,
            `🔧 ${toolDef.function.name}(${Object.keys(args).join(', ')})`
          );

          const result = await implementation(args);

          // Report tool completion
          const resultPreview =
            typeof result === 'string'
              ? result.length > 100
                ? result.substring(0, 100) + '...'
                : result
              : JSON.stringify(result, null, 2).substring(0, 100) + '...';
          globalProgressCallback?.(
            role,
            `✅ ${toolDef.function.name} completed`
          );

          return typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMsg = `❌ ${toolDef.function.name} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          globalProgressCallback?.(role, errorMsg);
          return errorMsg;
        }
      }
    });
  });

  // Use proper LangChain prompt format for tool calling agents
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a specialized ${role} sub-agent working as part of a multi-agent system with comprehensive tool access.

## SUB-AGENT CONTEXT
Your specific mission: ${instructions}

You have been delegated this specific task by the coordinator agent. You have COMPLETE access to ALL tools:
- File operations: glob, readFile, writeFile, createFolder, copyFile, etc.
- **bulkFileOperation** - PREFERRED for multiple file copy/move/delete operations with patterns
- **executeShellCommand** - USE FOR COMPLEX BULK OPERATIONS when bulkFileOperation isn't sufficient
- Data processing: parseCSV, updateCSVCell, filterCSV, etc.
- Web operations: fetchWebsiteContent, downloadFile, extractLinksFromPage
- Task management: readTodo, writeTodo, updateTodoItem

## CRITICAL: USE 'think' TOOL FOR PLANNING
- **ALWAYS use 'think' tool first** to plan your approach
- **Use 'think' during execution** to verify progress and next steps  
- **Use 'think' before completion** to ensure all requirements are met

## ESSENTIAL TOOL PATTERNS
- **List directories**: glob("*", {{ onlyDirectories: true }})
- **Find images**: glob("**/*.{{png,jpg,jpeg,gif}}")
- **Get file sizes**: glob("**/*", {{ sizeOnly: true }}) - PREFERRED over separate size tools
- **Single file operations**: createFolder(path) → copyFile(src, dest) for one file
- **BULK OPERATIONS**: bulkFileOperation(operation: "copy", pattern: "*.jpg", sizeFilter: "+1M", targetFolder: "folder") - PREFERRED for multiple files
- **COMPLEX BULK**: executeShellCommand("find . -name '*.jpg' -size +1M -exec cp {{}} folder/ \\;", "Copy large images") - For advanced cases

BALANCED EFFICIENCY:
- You have MAX 7 iterations for quality results
- Use 'think' tool to plan, then execute with precision
- **PREFER bulkFileOperation for multi-file operations** - much simpler and safer than shell commands
- Quality over speed - but don't overthink simple operations
- If coordinator gave specific tool instructions, follow them exactly`
    ],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}']
  ]);

  const agent = await createToolCallingAgent({
    llm,
    tools: wrappedTools,
    prompt
  });

  return new AgentExecutor({
    agent,
    tools: wrappedTools,
    maxIterations: 7, // Balanced for quality while maintaining efficiency
    returnIntermediateSteps: true
  });
}

// Parse hybrid execution phases from coordinator response
function parseHybridPhases(response: string): Array<{
  mode: string;
  tasks: Array<{ role: string; instructions: string }>;
}> {
  const phases: Array<{
    mode: string;
    tasks: Array<{ role: string; instructions: string }>;
  }> = [];

  try {
    const phasesSection = response.split('PHASES:')[1];
    if (!phasesSection) return phases;

    const phaseMatches = phasesSection.match(
      /PHASE \d+ \((SEQUENTIAL|PARALLEL)\):(.*?)(?=PHASE \d+|$)/gs
    );

    if (phaseMatches) {
      for (const phaseMatch of phaseMatches) {
        const modeMatch = phaseMatch.match(
          /PHASE \d+ \((SEQUENTIAL|PARALLEL)\):/
        );
        const mode = modeMatch ? modeMatch[1] : 'SEQUENTIAL';

        const tasks: Array<{ role: string; instructions: string }> = [];
        const taskMatches = phaseMatch.match(/- ([^:]+): ([^-]+?)(?=\n- |$)/gs);

        if (taskMatches) {
          for (const taskMatch of taskMatches) {
            const taskParts = taskMatch.match(/- ([^:]+): (.+)/s);
            if (taskParts && taskParts[1] && taskParts[2]) {
              tasks.push({
                role: taskParts[1].trim(),
                instructions: taskParts[2].trim()
              });
            }
          }
        }

        phases.push({ mode, tasks });
      }
    }
  } catch (error) {
    console.error('Error parsing hybrid phases:', error);
  }

  return phases;
}

// Coordinator Agent - analyzes task and creates detailed delegation plan with tool access
async function coordinatorAgent(state: typeof GraphState.State) {
  const llm = createLLM();

  // Give coordinator access only to think tool for planning (not execution tools)
  const verificationToolNames = ['think']; // Removed glob, readFile, getFolderStructure - coordinator should delegate, not execute
  const verificationTools = verificationToolNames.map(toolName => {
    const tool = tools.find(t => t.function.name === toolName);
    const implementation = toolImplementations[toolName];

    if (!tool || !implementation) {
      throw new Error(`Verification tool ${toolName} not found`);
    }

    return new DynamicStructuredTool({
      name: toolName,
      description: tool.function.description,
      schema: tool.function.parameters || {},
      func: async (args: any) => {
        try {
          // Report tool execution for coordinator
          const inputSummary =
            Object.keys(args).length > 0
              ? `(${Object.entries(args)
                  .map(
                    ([k, v]) => `${k}: ${JSON.stringify(v).substring(0, 80)}`
                  )
                  .join(', ')})`
              : '()';

          globalProgressCallback?.(
            'coordinator',
            `🔧 ${toolName}${inputSummary}`
          );

          const startTime = Date.now();
          const result = await implementation(args);
          const duration = Date.now() - startTime;

          // Report completion with result preview
          const resultPreview = JSON.stringify(result);

          globalProgressCallback?.(
            'coordinator',
            `✅ ${toolName} completed (${duration}ms): ${resultPreview}`
          );

          return typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMsg = `❌ ${toolName} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          globalProgressCallback?.('coordinator', errorMsg);
          return errorMsg;
        }
      }
    });
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      COORDINATOR_PROMPT +
        `

## YOUR PLANNING TOOL

You have access to:
- 'think': Plan your approach, analyze complexity, and make delegation decisions

## TOOL KNOWLEDGE FOR DELEGATION
You know these tools exist for delegation (but don't execute them yourself):
- 'glob': File/directory discovery - delegate to smart_agent for execution
- 'readFile': File content reading - delegate to smart_agent
- 'getFolderStructure': Directory analysis - delegate to smart_agent
- All other tools: Available to sub-agents for execution

Your job is STRATEGIC PLANNING and DELEGATION, not tool execution.`
    ],
    [
      'human',
      'User request: {input}\n\nAnalyze this request and respond with your delegation plan.'
    ],
    ['placeholder', '{agent_scratchpad}']
  ]);

  const agent = await createToolCallingAgent({
    llm,
    tools: verificationTools,
    prompt
  });

  const executor = new AgentExecutor({
    agent,
    tools: verificationTools,
    maxIterations: 2, // Quick planning only - no tool execution
    returnIntermediateSteps: true
  });

  const result = await executor.invoke({ input: state.input });
  const response = result.output;

  const isComplex = response.includes('COMPLEXITY: COMPLEX');
  const isParallel = response.includes('EXECUTION: PARALLEL');
  const isHybrid = response.includes('EXECUTION: HYBRID');
  const isSequential = response.includes('EXECUTION: SEQUENTIAL');

  let executionMode = 'SEQUENTIAL'; // default
  if (isHybrid) {
    executionMode = 'HYBRID';
  } else if (isParallel) {
    executionMode = 'PARALLEL';
  }

  // Parse hybrid phases if hybrid execution
  let executionPhases: Array<{
    mode: string;
    tasks: Array<{ role: string; instructions: string }>;
  }> = [];
  if (isHybrid && response.includes('PHASES:')) {
    executionPhases = parseHybridPhases(response);
  }

  const coordinatorMessage = `${
    isComplex
      ? `🎯 Delegating with ${executionMode} execution`
      : '🎯 Routing to smart agent for analysis'
  }`;

  console.log(`🧠 Coordinator: ${coordinatorMessage}`);
  globalProgressCallback?.('coordinator', coordinatorMessage);

  // Add detailed execution mode info
  if (isComplex) {
    if (isHybrid) {
      globalProgressCallback?.(
        'coordinator',
        `📋 Hybrid execution planned: ${executionPhases.length} phases`
      );
    } else if (isParallel) {
      globalProgressCallback?.(
        'coordinator',
        '⚡ Parallel execution mode selected for maximum speed'
      );
    } else {
      globalProgressCallback?.(
        'coordinator',
        '🔄 Sequential execution mode selected'
      );
    }
  }

  return {
    ...state,
    needs_delegation: isComplex,
    task_type: isComplex ? 'complex' : 'simple',
    execution_mode: executionMode,
    execution_phases: executionPhases,
    analysis: response // Store the full plan
  };
}

// Multi-Agent Executor - executes the plan from coordinator (supports parallel execution)
async function multiAgentExecutor(state: typeof GraphState.State) {
  console.log(
    `🤖 Multi-Agent Executor: Processing complex task with ${state.execution_mode} execution`
  );

  try {
    let results: string[] = [];

    if (
      state.execution_mode === 'HYBRID' &&
      state.execution_phases.length > 0
    ) {
      const hybridMessage = `Executing ${state.execution_phases.length} phases in hybrid mode`;
      console.log(`🔀 ${hybridMessage}`);
      globalProgressCallback?.('multi_executor', hybridMessage);

      // Execute each phase in sequence, but allow parallel execution within each phase
      for (
        let phaseIndex = 0;
        phaseIndex < state.execution_phases.length;
        phaseIndex++
      ) {
        const phase = state.execution_phases[phaseIndex];
        const phaseMessage = `Phase ${phaseIndex + 1}: ${
          phase.mode
        } execution with ${phase.tasks.length} agents`;
        console.log(`📍 ${phaseMessage}`);
        globalProgressCallback?.('multi_executor', phaseMessage);

        if (phase.mode === 'PARALLEL') {
          // Execute agents in this phase in parallel
          const parallelPromises = phase.tasks.map(async (task, i) => {
            console.log(
              `🔧 Starting parallel agent ${i + 1} in phase ${
                phaseIndex + 1
              }: ${task.role}`
            );

            const subAgent = await createSubAgent(task.role, task.instructions);
            const result = await subAgent.invoke({
              input: `Original request: ${state.input}\n\nYour specific task: ${
                task.instructions
              }\n\nPrevious phase results: ${results.join('\n\n')}`
            });

            console.log(
              `✅ Completed parallel agent ${i + 1} in phase ${
                phaseIndex + 1
              }: ${task.role}`
            );
            return `${task.role} completed: ${result.output}`;
          });

          const phaseResults = await Promise.all(parallelPromises);
          results.push(...phaseResults);
        } else {
          // Execute agents in this phase sequentially
          for (let i = 0; i < phase.tasks.length; i++) {
            const task = phase.tasks[i];
            console.log(
              `🔧 Executing sequential agent ${i + 1} in phase ${
                phaseIndex + 1
              }: ${task.role}`
            );

            const subAgent = await createSubAgent(task.role, task.instructions);
            const result = await subAgent.invoke({
              input: `Original request: ${state.input}\n\nYour specific task: ${
                task.instructions
              }\n\nPrevious results: ${results.join('\n\n')}`
            });

            results.push(`${task.role} completed: ${result.output}`);
            console.log(
              `✅ Completed sequential agent ${i + 1} in phase ${
                phaseIndex + 1
              }: ${task.role}`
            );
          }
        }
      }
    } else {
      // Fallback to original single-mode execution
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
          (task): task is { role: string; instructions: string } =>
            task !== null
        );

      if (state.execution_mode === 'PARALLEL') {
        const parallelMessage = 'Executing sub-agents in PARALLEL';
        console.log(`⚡ ${parallelMessage}`);
        globalProgressCallback?.('multi_executor', parallelMessage);

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
        const sequentialMessage = 'Executing sub-agents in SEQUENCE';
        console.log(`🔄 ${sequentialMessage}`);
        globalProgressCallback?.('multi_executor', sequentialMessage);

        // Execute agents sequentially (original behavior)
        for (let i = 0; i < agentTasks.length; i++) {
          const task = agentTasks[i];
          console.log(
            `🔧 Executing sequential sub-agent ${i + 1}: ${task.role}`
          );

          const subAgent = await createSubAgent(task.role, task.instructions);
          const result = await subAgent.invoke({
            input: `Original request: ${state.input}\n\nYour specific task: ${
              task.instructions
            }\n\nPrevious results: ${results.join('\n\n')}`
          });

          results.push(`${task.role} completed: ${result.output}`);
          console.log(
            `✅ Completed sequential sub-agent ${i + 1}: ${task.role}`
          );
        }
      }
    }

    // Combine all results
    const finalOutput = `Multi-agent task completed with ${
      state.execution_mode
    } execution!\n\n${results.join('\n\n')}`;

    return {
      ...state,
      final_output: finalOutput,
      agent_results: {}
    };
  } catch (error) {
    return {
      ...state,
      final_output: `Error in multi-agent execution: ${error}`
    };
  }
}

// Smart Agent that can detect complexity and switch execution modes dynamically
async function smartAgent(
  state: typeof GraphState.State
): Promise<typeof GraphState.State | Command<'parallel_bulk_executor'>> {
  console.log(
    '🧠 Smart Agent: Analyzing task complexity and executing with full visibility'
  );
  globalProgressCallback?.(
    'smart_agent',
    'Analyzing task complexity and executing with full tool visibility'
  );

  const llm = createLLM();

  // Create wrapped tools with comprehensive progress reporting
  const wrappedTools = tools.map(toolDef => {
    const implementation = toolImplementations[toolDef.function.name];

    return new DynamicStructuredTool({
      name: toolDef.function.name,
      description: toolDef.function.description,
      schema: toolDef.function.parameters || {},
      func: async (args: any) => {
        try {
          // Report tool execution start with detailed input
          const inputSummary =
            Object.keys(args).length > 0
              ? `(${Object.entries(args)
                  .map(
                    ([k, v]) => `${k}: ${JSON.stringify(v).substring(0, 100)}`
                  )
                  .join(', ')})`
              : '()';

          globalProgressCallback?.(
            'smart_agent',
            `🔧 ${toolDef.function.name}${inputSummary}`
          );

          const startTime = Date.now();
          const result = await implementation(args);
          const duration = Date.now() - startTime;

          // Report tool completion with result preview and timing
          const resultPreview = JSON.stringify(result);

          globalProgressCallback?.(
            'smart_agent',
            `✅ ${toolDef.function.name} completed (${duration}ms): ${resultPreview}`
          );

          return typeof result === 'string'
            ? result
            : JSON.stringify(result, null, 2);
        } catch (error) {
          const errorMsg = `❌ ${toolDef.function.name} failed: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          globalProgressCallback?.('smart_agent', errorMsg);
          return errorMsg;
        }
      }
    });
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a smart agent that can handle simple tasks OR detect when a task needs parallel execution and dynamically signal for mode switching.

## SMART AGENT CONTEXT
You have comprehensive access to ALL tools and can complete tasks efficiently while detecting complexity.
**CRITICAL**: Use executeShellCommand for bulk file operations - it's dramatically more efficient than multiple individual tool calls.

## DYNAMIC SWITCHING CAPABILITY
You can detect bulk operations and signal when parallel execution is needed:
- **Bulk operations** (multiple files, downloads, copies)
- **Large datasets** (>3 items to process)
- **Time-consuming parallel work** (multiple independent operations)

## CRITICAL: USE 'think' TOOL FOR COMPLEXITY ANALYSIS
- **ALWAYS use 'think' tool first** to analyze the request complexity
- **Use 'glob' to discover** what files/data need processing
- **Count the items** - if >3 items detected, signal for parallel execution
- **If simple task** - complete it directly

## SWITCHING DECISION CRITERIA:
- **>3 files to process** → signal for parallel execution
- **Multiple downloads** → signal for parallel execution  
- **Large image/file operations** → signal for parallel execution
- **Single simple operations** → handle directly

## SIGNALING FOR PARALLEL EXECUTION:
When you detect bulk operations, include "PARALLEL_EXECUTION_NEEDED" in your response:
- Use 'think' to analyze the scope of the operation
- Use 'glob' to discover files that need processing
- If you find >3 items to process, include "PARALLEL_EXECUTION_NEEDED" in your final response
- The system will automatically switch to parallel execution for you

## EXAMPLE DETECTION PATTERNS:
- "Found 15 large images that need copying - PARALLEL_EXECUTION_NEEDED"
- "Discovered 8 PDF files for processing - PARALLEL_EXECUTION_NEEDED"  
- "Multiple downloads detected (>5 URLs) - PARALLEL_EXECUTION_NEEDED"

## EFFICIENCY EXAMPLES:
- **Instead of**: glob → multiple copyFile calls → individual operations
- **Use**: bulkFileOperation(operation: "copy", pattern: "*.jpg", sizeFilter: "+1M", targetFolder: "large-images")

BALANCED EFFICIENCY:
- You have MAX 5 iterations for analysis and simple execution
- Use 'think' tool extensively for decision making
- Quality analysis over hasty execution`
    ],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}']
  ]);

  const agent = await createToolCallingAgent({
    llm,
    tools: wrappedTools,
    prompt
  });

  const executor = new AgentExecutor({
    agent,
    tools: wrappedTools,
    maxIterations: 8, // Increased for multi-step "simple" tasks
    returnIntermediateSteps: true
  });

  globalProgressCallback?.(
    'smart_agent',
    '🎯 Starting task execution with comprehensive tool visibility...'
  );

  const result = await executor.invoke({ input: state.input });

  globalProgressCallback?.(
    'smart_agent',
    '🔍 Analyzing agent output for complexity detection...'
  );

  // Parse the agent's response to detect bulk operations
  const output = result.output;

  // Check if agent detected bulk operations or complexity
  if (
    output.includes('BULK_OPERATION_DETECTED') ||
    output.includes('PARALLEL_EXECUTION_NEEDED') ||
    (output.includes('large') &&
      output.includes('images') &&
      output.includes('copy'))
  ) {
    console.log(
      '🔄 Smart Agent: Bulk operation detected, switching to parallel execution'
    );
    globalProgressCallback?.(
      'smart_agent',
      '🔄 Bulk operation detected - initiating dynamic switch to parallel execution'
    );

    // Extract data for parallel processing from agent's intermediate steps
    const bulkData = extractBulkDataFromSteps(result.intermediateSteps || []);

    globalProgressCallback?.(
      'smart_agent',
      `📦 Extracted ${bulkData.length} items for parallel processing`
    );
    globalProgressCallback?.(
      'smart_agent',
      '🚀 Returning Command to switch to parallel_bulk_executor'
    );

    return new Command({
      update: {
        ...state,
        complexity_detected: true,
        bulk_operation_data: bulkData,
        task_type: 'dynamic_parallel'
      },
      goto: 'parallel_bulk_executor'
    });
  }

  // No bulk operation detected, return normal result
  globalProgressCallback?.(
    'smart_agent',
    '✅ Task completed directly - no parallel execution needed'
  );

  return {
    ...state,
    final_output: result.output
  };
}

// Helper function to extract bulk operation data from agent steps
function extractBulkDataFromSteps(steps: any[]): any[] {
  // This is a simplified implementation
  // In practice, you'd parse the agent's tool calls and analysis
  const bulkData: any[] = [];

  for (const step of steps) {
    if (step.action?.tool === 'glob' && step.observation) {
      try {
        const files = JSON.parse(step.observation);
        if (Array.isArray(files) && files.length > 3) {
          // Detected multiple files - treat as bulk operation
          bulkData.push(
            ...files.map((file: string) => ({ type: 'file', path: file }))
          );
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  return bulkData;
}

// Parallel Bulk Executor - handles bulk operations detected by smart agent
async function parallelBulkExecutor(state: typeof GraphState.State) {
  console.log(
    '⚡ Parallel Bulk Executor: Processing bulk operations in parallel'
  );
  globalProgressCallback?.(
    'parallel_bulk_executor',
    '⚡ Dynamic switch activated - Processing bulk operations in parallel'
  );

  try {
    // Extract bulk operation data from state
    const bulkData = state.bulk_operation_data || [];

    globalProgressCallback?.(
      'parallel_bulk_executor',
      `📊 Bulk data analysis: ${bulkData.length} items detected for parallel processing`
    );

    if (bulkData.length === 0) {
      globalProgressCallback?.(
        'parallel_bulk_executor',
        '⚠️ No bulk operation data found - returning to smart agent'
      );
      return {
        ...state,
        final_output: 'No bulk operations detected for parallel processing.'
      };
    }

    globalProgressCallback?.(
      'parallel_bulk_executor',
      `🚀 Spawning ${bulkData.length} parallel agents for concurrent processing`
    );

    // Create parallel agents for bulk processing
    const parallelPromises = bulkData.map(async (item: any, index: number) => {
      const agentName = `Bulk Processor ${index + 1}`;

      globalProgressCallback?.(
        'parallel_bulk_executor',
        `🔧 Starting ${agentName} for item: ${JSON.stringify(item).substring(
          0,
          100
        )}...`
      );

      const subAgent = await createSubAgent(
        agentName,
        `Process this item: ${JSON.stringify(item)}`
      );

      const result = await subAgent.invoke({
        input: `Original request: ${
          state.input
        }\n\nProcess this specific item: ${JSON.stringify(item)}`
      });

      globalProgressCallback?.(
        'parallel_bulk_executor',
        `✅ ${agentName} completed successfully`
      );

      return `${agentName} completed: ${result.output}`;
    });

    globalProgressCallback?.(
      'parallel_bulk_executor',
      '⏳ Waiting for all parallel agents to complete...'
    );

    // Execute all bulk operations in parallel
    const results = await Promise.all(parallelPromises);

    globalProgressCallback?.(
      'parallel_bulk_executor',
      `🎉 All ${bulkData.length} parallel agents completed successfully!`
    );

    const finalOutput = `Parallel bulk processing completed!\n\n${results.join(
      '\n\n'
    )}`;

    return {
      ...state,
      final_output: finalOutput
    };
  } catch (error) {
    return {
      ...state,
      final_output: `Error in parallel bulk execution: ${error}`
    };
  }
}

// Routing function - decides which path to take
function shouldDelegate(state: typeof GraphState.State) {
  return state.needs_delegation ? 'delegate' : 'direct';
}

// Create the multi-agent workflow with dynamic switching capability
export function createMultiAgentSystem() {
  const workflow = new StateGraph(GraphState)
    // Add nodes
    .addNode('coordinator', coordinatorAgent)
    .addNode('multi_executor', multiAgentExecutor)
    .addNode('smart_agent', smartAgent, {
      ends: ['parallel_bulk_executor', END] // Smart agent can route to parallel executor or end
    })
    .addNode('parallel_bulk_executor', parallelBulkExecutor)

    // Define the flow
    .addEdge(START, 'coordinator')
    .addConditionalEdges('coordinator', shouldDelegate, {
      delegate: 'multi_executor',
      direct: 'smart_agent' // Changed from direct_response to smart_agent
    })

    // Multi-executor goes to END
    .addEdge('multi_executor', END)

    // Parallel bulk executor goes to END
    .addEdge('parallel_bulk_executor', END);

  // Note: smart_agent can use Command to route dynamically, no explicit edges needed

  return workflow.compile();
}

// Execute the multi-agent system
export async function executeMultiAgent(
  input: string,
  onProgress?: (agentName: string, message: string) => void,
  conversationHistory: any[] = []
): Promise<{
  output: string;
  agents_used: string[];
  task_type: string;
}> {
  try {
    // Set the global progress callback
    globalProgressCallback = onProgress;

    const graph = createMultiAgentSystem();

    console.log('🚀 Starting multi-agent system...');

    // Include conversation history in the input for context
    let contextualInput = input;
    if (conversationHistory.length > 1) {
      const recentHistory = conversationHistory
        .slice(-6) // Last 6 messages for context
        .filter(msg => msg.role !== 'system')
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      contextualInput = `Recent conversation:\n${recentHistory}\n\nCurrent request: ${input}`;
    }

    const result = await graph.invoke({
      input: contextualInput,
      task_type: '',
      web_content: '',
      pdf_links: [],
      downloaded_files: [],
      analysis: '',
      summary: '',
      final_output: '',
      needs_delegation: false,
      execution_mode: 'PARALLEL',
      execution_phases: [],
      agent_results: {},
      complexity_detected: false,
      bulk_operation_data: []
    });

    const agentsUsed = [];
    if (result.task_type === 'complex') {
      agentsUsed.push('coordinator', 'multi_executor');
    } else {
      agentsUsed.push('coordinator', 'smart_agent');
      // Check if parallel bulk executor was used
      if (result.final_output?.includes('Parallel bulk processing')) {
        agentsUsed.push('parallel_bulk_executor');
      }
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
  } finally {
    // Clear the global progress callback
    globalProgressCallback = undefined;
  }
}
