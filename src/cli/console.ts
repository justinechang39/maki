#!/usr/bin/env node
import inquirer from 'inquirer';
import chalk from 'chalk';
import { MAX_CONVERSATION_LENGTH } from '../core/config.js';
import { validateConversationHistory } from '../core/utils.js';
import { callOpenRouterAPI } from '../core/api.js';
import { tools, toolImplementations } from '../tools/index.js';
import type { Message, ToolCall } from '../core/types.js';

const userPrefix = chalk.blue('👤');
const assistantPrefix = chalk.green('🤖');
const toolPrefix = chalk.yellow('🛠️');
const errorPrefix = chalk.red('❗');
const systemPrefix = chalk.gray('⚙️');

let conversationHistory: Message[] = [];

async function executeToolCall(toolCall: ToolCall): Promise<any> {
  const { name, arguments: argsString } = toolCall.function;
  
  let args: any;
  try {
    args = JSON.parse(argsString);
  } catch (error) {
    console.error(errorPrefix + chalk.red(` Invalid JSON in tool call arguments: ${argsString}`));
    return { error: 'Invalid JSON in tool arguments' };
  }

  const implementation = toolImplementations[name];
  if (!implementation) {
    console.error(errorPrefix + chalk.red(` Unknown tool: ${name}`));
    return { error: `Unknown tool: ${name}` };
  }

  console.log(toolPrefix + chalk.yellowBright(` Executing ${name}...`));
  
  try {
    const result = await implementation(args);
    
    // Special handling for 'think' tool
    if (name === 'think') {
      console.log(toolPrefix + chalk.magentaBright(` Agent thinking: ${args.thoughts.substring(0, 150)}${args.thoughts.length > 150 ? '...' : ''}`));
    }
    
    return result;
  } catch (error: any) {
    console.error(errorPrefix + chalk.red(` Error executing ${name}: ${error.message}`));
    return { error: error.message };
  }
}

async function processAssistantResponse(response: any): Promise<void> {
  const choice = response.choices?.[0];
  if (!choice) {
    console.error(errorPrefix + chalk.red(' No response choice from API'));
    return;
  }

  const message = choice.message;
  
  // Add assistant message to conversation
  conversationHistory.push({
    role: 'assistant',
    content: message.content,
    tool_calls: message.tool_calls
  });

  // Display assistant's text response if any
  if (message.content && message.content.trim()) {
    console.log(assistantPrefix + chalk.green(` ${message.content}`));
  }

  // Process tool calls if any
  if (message.tool_calls && message.tool_calls.length > 0) {
    for (const toolCall of message.tool_calls) {
      const result = await executeToolCall(toolCall);
      
      // Add tool response to conversation
      conversationHistory.push({
        role: 'tool',
        content: JSON.stringify(result),
        tool_call_id: toolCall.id,
        name: toolCall.function.name
      });
    }

    // Get follow-up response from assistant after tool execution
    try {
      const followUpResponse = await callOpenRouterAPI(conversationHistory, tools);
      await processAssistantResponse(followUpResponse);
    } catch (error: any) {
      console.error(errorPrefix + chalk.red(` Error in follow-up API call: ${error.message}`));
    }
  }
}

export async function startConsoleInterface(): Promise<void> {
  console.log(systemPrefix + chalk.gray(' OpenRouter Agent CLI started. Type your requests below.'));
  console.log(systemPrefix + chalk.gray(' Type "exit" or "quit" to end the session.\n'));

  // Add system message
  conversationHistory.push({
    role: 'system',
    content: `You are an intelligent file assistant with specialized tools for workspace management and data processing. You operate within a secure workspace environment and help users accomplish complex file operations efficiently.

## YOUR CAPABILITIES & TOOLS

**THINKING & PLANNING:**
- ALWAYS use the 'think' tool before complex multi-step operations
- Break down user requests into logical steps
- Plan your approach before executing actions

**FILE OPERATIONS:**
- listFiles: Explore and navigate directory structures
- readFile: Inspect existing content before modifications  
- writeFile: Create new files or completely replace content
- updateFile: Make precise edits to existing files (preferred for modifications)
- File/folder management: create, delete, rename, organize

**CSV DATA PROCESSING:**
- parseCSV: Analyze structure before any CSV operations
- Cell/row manipulation: update, add, remove specific data
- Data analysis: filter, sort, aggregate operations
- Always inspect CSV structure first with parseCSV

**TASK MANAGEMENT:**
- readTodo: Check current task status
- writeTodo/updateTodoItem: Manage project tasks and progress

**WEB INTEGRATION:**
- fetchWebsiteContent: Retrieve external data and resources

## OPERATIONAL GUIDELINES

**SYSTEMATIC APPROACH:**
1. Use 'think' tool to analyze the request
2. Explore/inspect existing content (listFiles, readFile, parseCSV)
3. Plan the sequence of operations
4. Execute changes systematically
5. Verify results when possible

**TOOL SELECTION STRATEGY:**
- For file edits: Use updateFile instead of writeFile to preserve content
- For CSV work: Always parseCSV first to understand structure
- For exploration: Start with listFiles to understand workspace
- For planning: Use think tool for multi-step operations

**COMMUNICATION STYLE:**
- Be direct and action-oriented
- Explain what you're doing and why
- Confirm successful operations
- Alert user to any issues or limitations

You have full autonomy to use tools as needed to accomplish user goals efficiently and safely.`
  });

  while (true) {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: chalk.blue('You:'),
          validate: (input: string) => {
            return input.trim().length > 0 || 'Please enter a message';
          }
        }
      ]);

      const userInput = answers.userInput.trim();

      if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
        console.log(systemPrefix + chalk.gray(' Goodbye!'));
        break;
      }

      // Add user message to conversation
      conversationHistory.push({
        role: 'user',
        content: userInput
      });

      // Validate and potentially clean conversation history
      conversationHistory = validateConversationHistory(conversationHistory);

      // Limit conversation length
      if (conversationHistory.length > MAX_CONVERSATION_LENGTH) {
        conversationHistory = conversationHistory.slice(-MAX_CONVERSATION_LENGTH);
      }

      // Call OpenRouter API
      console.log(systemPrefix + chalk.gray(' Processing...'));
      
      const response = await callOpenRouterAPI(conversationHistory, tools);
      await processAssistantResponse(response);
      
      console.log(); // Add blank line for readability

    } catch (error: any) {
      console.error(errorPrefix + chalk.red(` Error: ${error.message}`));
      console.log(); // Add blank line for readability
    }
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startConsoleInterface().catch(console.error);
}