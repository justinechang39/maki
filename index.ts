#!/usr/bin/env node
import inquirer from 'inquirer';
import * as fs from 'fs/promises';
import path from 'path';

// Define the OpenRouter API details
const OPENROUTER_API_KEY = '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'
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_ID = 'google/gemini-2.5-flash-preview'; // Model that is more reliable with function calling

// Message types
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Message {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

interface ToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// Define our file operation tools
const tools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'think',
      description: 'Use this tool to document your thinking process. This allows you to work through complex problems step by step, reason about different approaches, and clarify your understanding. The content is only visible to you. When you use this tool, you must use it 3 times in a row. This is to ensure deeper and proper thinking.',
      parameters: {
        type: 'object',
        properties: {
          thoughts: { 
            type: 'string', 
            description: 'Your detailed thinking process, reasoning, or working through a problem.' 
          }
        },
        required: ['thoughts']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'List all files in a directory with optional extension filtering.',
      parameters: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'The directory path to list files from. Defaults to current directory if not specified.' 
          },
          extension: {
            type: 'string',
            description: 'Optional file extension to filter by (e.g., "txt", "js", etc.). Do not include the dot.'  
          }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Read the text content of a file from disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { 
            type: 'string', 
            description: 'The filesystem path to the file.' 
          }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'writeFile',
      description: 'Write text content to a file on disk, creating or overwriting it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to write to.' },
          content: { type: 'string', description: 'The text content to write into the file.' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateFile',
      description: 'Update an existing file by appending or modifying content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to update.' },
          content: { type: 'string', description: 'The content to append or modify.' },
          operation: { 
            type: 'string', 
            description: 'The operation to perform: "append" to add at end, "prepend" to add at beginning.',
            enum: ['append', 'prepend']
          }
        },
        required: ['path', 'content', 'operation']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFile',
      description: 'Delete a file from disk.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The file path to delete.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'createFolder',
      description: 'Create a new folder or directory.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The folder path to create.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'deleteFolder',
      description: 'Delete a folder and all its contents.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'The folder path to delete.' },
          recursive: { type: 'boolean', description: 'Whether to delete non-empty directories recursively. Defaults to false for safety.' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFolder',
      description: 'Rename a folder.',
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'The current path of the folder.' },
          newPath: { type: 'string', description: 'The new path for the folder.' }
        },
        required: ['oldPath', 'newPath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'renameFile',
      description: 'Rename a file.',
      parameters: {
        type: 'object',
        properties: {
          oldPath: { type: 'string', description: 'The current path of the file.' },
          newPath: { type: 'string', description: 'The new path for the file.' }
        },
        required: ['oldPath', 'newPath']
      }
    }
  }
];

// Helper function to validate conversation history and remove dangling tool calls
function validateConversationHistory(messages: Message[]): Message[] {
  // Build a map of tool call IDs and their responses
  const toolCallIds = new Set<string>();
  const toolResponseIds = new Set<string>();
  
  // First pass: Collect all tool call IDs and response IDs
  for (const message of messages) {
    // Track tool calls from assistant
    if (message.role === 'assistant' && message.tool_calls) {
      for (const call of message.tool_calls) {
        toolCallIds.add(call.id);
      }
    }
    
    // Track tool responses
    if (message.role === 'tool' && message.tool_call_id) {
      toolResponseIds.add(message.tool_call_id);
    }
  }
  
  // Find unanswered tool calls
  const unansweredCalls = new Set<string>();
  for (const id of toolCallIds) {
    if (!toolResponseIds.has(id)) {
      unansweredCalls.add(id);
    }
  }
  
  // If all tool calls have responses, return the original messages
  if (unansweredCalls.size === 0) {
    return messages;
  }
  
  // Otherwise, filter out the problematic messages
  const cleanedMessages: Message[] = [];
  let skipNextAssistant = false;
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    // Skip assistant messages with unanswered tool calls
    if (message.role === 'assistant' && message.tool_calls) {
      const hasUnansweredCall = message.tool_calls.some(call => unansweredCalls.has(call.id));
      if (hasUnansweredCall) {
        skipNextAssistant = true;
        continue;
      }
    }
    
    // Skip the user message that triggered the problematic assistant message
    if (skipNextAssistant && message.role === 'user') {
      skipNextAssistant = false;
      continue;
    }
    
    // Skip tool responses for unanswered calls (shouldn't happen, but just in case)
    if (message.role === 'tool' && message.tool_call_id && unansweredCalls.has(message.tool_call_id)) {
      continue;
    }
    
    // Add all other messages
    cleanedMessages.push(message);
  }
  
  return cleanedMessages;
}

// Tool implementations
const toolImplementations: Record<string, Function> = {
  think: async (args: any) => {
    // Just log the thinking internally but don't expose to user
    console.log('Agent thinking: ' + args.thoughts.substring(0, 100) + (args.thoughts.length > 100 ? '...' : ''));
    return { success: true, message: 'Thinking completed.', thoughts: args.thoughts };
  },
  createFolder: async (args: any) => {
    try {
      const safePath = path.normalize(args.path).replace(/^\.\.\//g, '');
      await fs.mkdir(safePath, { recursive: true });
      return { success: true, message: `Folder ${args.path} created successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  deleteFolder: async (args: any) => {
    try {
      const safePath = path.normalize(args.path).replace(/^\.\.\//g, '');
      await fs.rm(safePath, { recursive: args.recursive === true, force: args.recursive === true });
      return { success: true, message: `Folder ${args.path} deleted successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  renameFolder: async (args: any) => {
    try {
      const safeOldPath = path.normalize(args.oldPath).replace(/^\.\.\//g, '');
      const safeNewPath = path.normalize(args.newPath).replace(/^\.\.\//g, '');
      await fs.rename(safeOldPath, safeNewPath);
      return { success: true, message: `Folder renamed from ${args.oldPath} to ${args.newPath} successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  renameFile: async (args: any) => {
    try {
      const safeOldPath = path.normalize(args.oldPath).replace(/^\.\.\//g, '');
      const safeNewPath = path.normalize(args.newPath).replace(/^\.\.\//g, '');
      await fs.rename(safeOldPath, safeNewPath);
      return { success: true, message: `File renamed from ${args.oldPath} to ${args.newPath} successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  listFiles: async (args: any) => {
    try {
      // Default to current directory if path not provided
      const dirPath = args.path ? path.normalize(args.path).replace(/^\.\.\//, '') : '.';
      
      // Read the directory contents
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      
      // Filter files (not directories) and apply extension filter if provided
      let fileList = files
        .filter(file => file.isFile())
        .map(file => file.name);
      
      // Apply extension filter if provided
      if (args.extension) {
        const extension = args.extension.startsWith('.') ? args.extension : `.${args.extension}`;
        fileList = fileList.filter(filename => filename.endsWith(extension));
      }
      
      return { 
        directory: dirPath,
        files: fileList,
        count: fileList.length
      };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  readFile: async (args: any) => {
    try {
      // Sanitize path to prevent filesystem access outside of desired directory
      const safePath = path.normalize(args.path).replace(/^\.\.\//, '');
      const content = await fs.readFile(safePath, 'utf-8');
      return { content };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  
  writeFile: async (args: any) => {
    try {
      const safePath = path.normalize(args.path).replace(/^\.\.\//, '');
      await fs.writeFile(safePath, args.content, 'utf-8');
      return { success: true, message: `File ${args.path} written successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  
  updateFile: async (args: any) => {
    try {
      const safePath = path.normalize(args.path).replace(/^\.\.\//, '');
      const existingContent = await fs.readFile(safePath, 'utf-8');
      let newContent = existingContent;
      
      if (args.operation === 'append') {
        newContent = existingContent + args.content;
      } else if (args.operation === 'prepend') {
        newContent = args.content + existingContent;
      }
      
      await fs.writeFile(safePath, newContent, 'utf-8');
      return { success: true, message: `File ${args.path} updated successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  },
  
  deleteFile: async (args: any) => {
    try {
      const safePath = path.normalize(args.path).replace(/^\.\.\//, '');
      await fs.unlink(safePath);
      return { success: true, message: `File ${args.path} deleted successfully.` };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};

// Agent loop function to handle tool calling
async function agentLoop(messages: Message[]): Promise<Message[]> {
  let loopMessages = [...messages];
  // Always start with a clean slate for pending tool calls
  let pendingToolCalls: {id: string; completed: boolean}[] = [];
  
  // Ensure there are no dangling tool call messages
  const filteredMessages = validateConversationHistory(loopMessages);
  if (filteredMessages.length !== loopMessages.length) {
    console.log('Fixed conversation history by removing dangling tool calls');
    loopMessages = filteredMessages;
  }
  
  while (true) {
    try {
      // Check if we have any pending tool calls that haven't been responded to
      const hasPendingToolCalls = pendingToolCalls.some(call => !call.completed);
      if (hasPendingToolCalls) {
        console.error('Error: There are pending tool calls without responses');
        throw new Error('Tool call responses are missing. Please try again with a new request.');
      }
      console.log('Thinking...');
      
      // Step 1: Call OpenRouter API with current messages
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://openrouter.ai/'
        },
        body: JSON.stringify({
          model: MODEL_ID,
          tools: tools,
          messages: loopMessages
        })
      });
      
      const data = await response.json();

      if (!response.ok) {
        console.error('API Error:', JSON.stringify(data, null, 2));
        // Check if this is a OpenAI tool_call_id error and provide more details
        if (data.error?.metadata?.raw && data.error.metadata.raw.includes('tool_call_id')) {
          console.error('Tool call ID error detected. Full error:', data.error.metadata.raw);
          throw new Error('Tool call sequence error. The conversation will be reset.');
        }
        throw new Error(`API error: ${data.error?.message || 'Unknown error'}`);
      }
      
      // Validate the response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        console.error('Invalid API response format:', data);
        throw new Error('API returned an invalid response format. No choices found.');
      }
      
      // Step 2: Get assistant's response
      const assistantMessage = data.choices[0].message;
      if (!assistantMessage) {
        throw new Error('API response did not contain a valid message');
      }
      
      loopMessages.push(assistantMessage);
      
      // Step 3: Check if the assistant wants to use a tool
      if (assistantMessage.tool_calls && Array.isArray(assistantMessage.tool_calls) && assistantMessage.tool_calls.length > 0) {
        // Important: Only process ONE tool call at a time to avoid sequence errors
        const toolCall = assistantMessage.tool_calls[0];
        console.log(`Received ${assistantMessage.tool_calls.length} tool call(s), processing only the first one`);
        
        // Track only the first tool call
        pendingToolCalls = [{ id: toolCall.id, completed: false }];
        
        // Validate tool call has the required properties
        if (!toolCall || !toolCall.function || !toolCall.id) {
          throw new Error('Invalid tool call format from API');
        }
        
        const toolName = toolCall.function.name;
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (e: any) {
          throw new Error(`Failed to parse tool arguments: ${e.message}`);
        }
        
        // Log the tool call details for debugging
        console.log(`Processing tool call ID: ${toolCall.id} for tool: ${toolName}`);
        
        console.log(`Using tool: ${toolName}`);
        
        // Step 4: Execute the tool
        if (toolImplementations[toolName]) {
          const result = await toolImplementations[toolName](args);
          
          // Step 5: Add tool response to messages
          loopMessages.push({
            role: 'tool',
            name: toolName,
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
          });
          
          // Mark this tool call as completed
          const toolIndex = pendingToolCalls.findIndex(call => call.id === toolCall.id);
          if (toolIndex !== -1) {
            pendingToolCalls[toolIndex].completed = true;
          }
          
          // Continue the loop for more potential tool calls
        } else {
          // Tool not found
          loopMessages.push({
            role: 'tool',
            name: toolName,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Tool ${toolName} not found.` })
          });
          
          // Mark this tool call as completed even though it failed
          const toolIndex = pendingToolCalls.findIndex(call => call.id === toolCall.id);
          if (toolIndex !== -1) {
            pendingToolCalls[toolIndex].completed = true;
          }
        }
      } else {
        // No more tool calls, break the loop
        console.log('Finished processing');
        // Reset pending tool calls since we're done
        pendingToolCalls = [];
        return loopMessages;
      }
    } catch (error: any) {
      // Handle errors
      console.error('Agent loop error:', error);
      
      // Reset pending tool calls on error
      pendingToolCalls = [];
      
      // If the error is from the OpenRouter API and mentions tool calls
      const errorMessage = error.message || 'Unknown error';
      const isToolCallError = errorMessage.includes('tool_call_id') || 
                              errorMessage.includes('tool_calls');
      
      const userFriendlyMessage = isToolCallError
        ? 'There was an issue processing your request. Please try again with a new command.'
        : `Error: ${errorMessage}. Please try again.`;
      
      loopMessages.push({
        role: 'assistant',
        content: userFriendlyMessage
      });
      
      return loopMessages;
    }
  }
}

// Main function to run the CLI
async function main() {
  // Check for API key
  if (!OPENROUTER_API_KEY) {
    console.error('Error: OPENROUTER_API_KEY environment variable is required!');
    console.log('Please set it with: export OPENROUTER_API_KEY=your_api_key');
    process.exit(1);
  }

  console.log('======================================');
  console.log('🤖 Welcome to File Assistant CLI 🤖');
  console.log('======================================');
  console.log('Available commands:');
  console.log('  /exit  - Exit the application');
  console.log('  /reset - Reset the conversation history');
  console.log('\nFor best results, perform one file operation at a time.\n');

  // Initialize messages with system message
  let messages: Message[] = [
    {
      role: 'system',
      content: 'You are a file assistant. You can list, read, write, update, or delete files and folders using the provided tools. You must follow these strict rules:\n\n1. When asked to create or modify files or folders, ALWAYS use the appropriate tool rather than just saying you would do it.\n\n2. Only process ONE file or folder operation at a time. If the user asks to create or modify multiple files or folders, tell them you\'ll handle them one by one and start with the first one only.\n\n3. Use the listFiles tool when users want to see what files are available in a directory. You can filter by file extension (e.g., ".txt", ".js") if needed.\n\n4. Respond with a summary of changes or answer the user\'s question in a friendly, helpful manner.\n\n5. If a request is unclear, politely ask for clarification.\n\n6. Make extensive use of the "think" tool to work through complex problems or tasks. The thinking tool allows you to reason step by step without showing all your work to the user. Always use this tool for planning before taking action.\n\n7. For folder operations, use createFolder, deleteFolder, and renameFolder tools. When deleting folders that contain files, set recursive:true to delete all contents.\n\n8. For file renaming, use the renameFile tool with oldPath and newPath parameters.\n\nIMPORTANT: The system can only handle one file or folder operation per turn. Never try to perform multiple operations in a single response. Do not finish generating your outputs until the assigned task from the user is complete, if the user asks you to do something, continue doing it until the task is done, no need to stop to ask the user if you should continue.'
    }
  ];

  // Main conversation loop
  while (true) {
    const { userInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userInput',
        message: 'Ask me to work with files:',
        prefix: '👤'
      }
    ]);

    // Check for commands or empty input
    if (userInput.toLowerCase() === '/exit') {
      console.log('\nThank you for using File Assistant CLI. Goodbye! 👋');
      break;
    } else if (userInput.toLowerCase() === '/reset') {
      console.log('Resetting conversation history...');
      messages = [messages[0]]; // Keep only the system message
      continue;
    } else if (!userInput.trim()) {
      console.log('Please enter a command or question');
      continue;
    }

    // Reset messages to just the system message and new user input when there was a previous error
    const previousMessage = messages[messages.length - 1];
    
    // Check if the last message was an error or if there's a tool call error in the history
    const hasErrorMessage = previousMessage && 
                           previousMessage.role === 'assistant' && 
                           previousMessage.content.includes('Error');
    
    // Check for unresolved tool calls in the conversation history
    const hasUnresolvedToolCalls = messages.some(msg => 
      msg.role === 'assistant' && msg.tool_calls && 
      // For each tool call in the message, check if we have a response
      msg.tool_calls.some(call => 
        !messages.some(m => m.role === 'tool' && m.tool_call_id === call.id)
      )
    );
    
    // Check if conversation is getting too long (can lead to context issues)
    const isConversationTooLong = messages.length > 20;
    
    if (hasErrorMessage || hasUnresolvedToolCalls || isConversationTooLong) {
      console.log('Resetting conversation history...');
      messages = [
        messages[0], // Keep the system message
        { role: 'user', content: userInput } // Add new user message
      ];
    } else {
      // Just add the user message to continuing conversation
      messages.push({ role: 'user', content: userInput });
    }

    // Run the agent loop
    messages = await agentLoop(messages);

    // Display the assistant's response (last message)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'assistant') {
      console.log(`\n🤖 ${lastMessage.content}\n`);
    }
  }
}

// Run the application
main().catch(error => {
  console.error('Application error:', error);
  process.exit(1);
});