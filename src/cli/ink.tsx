#!/usr/bin/env node
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { Spinner } from '@inkjs/ui';
import chalk from 'chalk';
import { MAX_CONVERSATION_LENGTH } from '../core/config.js';
import { validateConversationHistory } from '../core/utils.js';
import { callOpenRouterAPI } from '../core/api.js';
import { tools, toolImplementations } from '../tools/index.js';
import type { Message, DisplayMessage, ToolCall } from '../core/types.js';
import { ThreadDatabase } from '../core/database.js';
import { SYSTEM_PROMPT } from '../core/system-prompt.js';
import { DATABASE_PATH, OPENROUTER_API_KEY } from '../core/config.js';
import fs from 'fs';

interface AppProps {}

interface ThreadListItem {
  id: string;
  title?: string;
  createdAt: Date;
  messageCount: number;
}

const ThreadSelector: React.FC<{
  threads: ThreadListItem[];
  selectedIndex: number;
  onSelect: (threadId: string | 'new') => void;
}> = ({ threads, selectedIndex, onSelect }) => {
  const items = [
    { name: '🆕 Start a new thread', value: 'new' },
    ...threads.map(thread => ({
      name: `📝 ${thread.title || 'Untitled'} (${thread.messageCount} messages) - ${thread.createdAt.toLocaleDateString()}`,
      value: thread.id
    }))
  ];

  useInput((input, key) => {
    if (key.return) {
      onSelect(items[selectedIndex].value);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Select a thread:</Text>
      {items.map((item, index) => (
        <Box key={index}>
          <Text color={index === selectedIndex ? 'blue' : 'white'}>
            {index === selectedIndex ? '> ' : '  '}{item.name}
          </Text>
        </Box>
      ))}
      <Text dimColor>Press Enter to select, use ↑↓ to navigate</Text>
    </Box>
  );
};

const ThreadManager: React.FC<{
  thread: ThreadListItem;
  selectedIndex: number;
  onContinue: () => void;
  onDelete: () => void;
  onBack: () => void;
  isDeleting?: boolean;
}> = ({ thread, selectedIndex, onContinue, onDelete, onBack, isDeleting = false }) => {
  const options = [
    { name: '▶️  Continue thread', action: onContinue },
    { name: '🗑️  Delete thread', action: onDelete },
    { name: '← Back to thread list', action: onBack }
  ];

  useInput((input, key) => {
    if (key.return && !isDeleting) {
      options[selectedIndex].action();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Thread: {thread.title || 'Untitled'}</Text>
      <Text dimColor>{thread.messageCount} messages • Created {thread.createdAt.toLocaleDateString()}</Text>
      <Box marginTop={1} flexDirection="column">
        {options.map((option, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? 'blue' : 'white'}>
              {index === selectedIndex ? '> ' : '  '}{option.name}
              {index === 1 && isDeleting ? ' (Deleting...)' : ''}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to select, use ↑↓ to navigate</Text>
      </Box>
    </Box>
  );
};

const App: React.FC<AppProps> = () => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isSelectingThread, setIsSelectingThread] = useState(true);
  const [isManagingThread, setIsManagingThread] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ThreadListItem | null>(null);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadIndex, setSelectedThreadIndex] = useState(0);
  const [threadManagementIndex, setThreadManagementIndex] = useState(0);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isDeletingThread, setIsDeletingThread] = useState(false);
  const isCreatingThread = useRef(false);
  const { exit } = useApp();

  // Format tool results for better display (no useCallback to avoid circular dependency)
  const formatToolResult = (toolName: string, args: any, result: any): string => {
    if (result.error) {
      return `❌ ${toolName} failed: ${result.error}`;
    }

    if (!result.success && result.message) {
      return `⚠️ ${toolName}: ${result.message}`;
    }

    // Format based on tool type
    switch (toolName) {
      case 'listFiles':
        const fileList = result.files?.slice(0, 10).map((f: string) => `  📄 ${f}`).join('\n') || '';
        const moreFiles = result.files?.length > 10 ? `\n  ... and ${result.files.length - 10} more files` : '';
        return `✅ Listed ${result.fileCount || 0} files in ${result.directory || args.path || '.'}\n${fileList}${moreFiles}`;
      
      case 'listFolders':
        const folderList = result.folders?.slice(0, 10).map((f: string) => `  📁 ${f}`).join('\n') || '';
        const moreFolders = result.folders?.length > 10 ? `\n  ... and ${result.folders.length - 10} more folders` : '';
        return `✅ Listed ${result.folderCount || 0} folders in ${result.directory || args.path || '.'}\n${folderList}${moreFolders}`;
      
      case 'readFile':
        const content = result.content || '';
        const preview = content.length > 200 ? content.substring(0, 200) + '...' : content;
        const lines = content.split('\n').length;
        return `✅ Read file ${result.path || args.path} (${lines} lines, ${content.length} chars)\n${preview ? `Preview:\n${preview}` : ''}`;
      
      case 'writeFile':
        return `✅ File written: ${args.path} (${args.content?.length || 0} characters)`;
      
      case 'updateFile':
        return `✅ File updated: ${args.path} (${args.operation} operation${result.linesModified ? `, ${result.linesModified} lines modified` : ''})`;
      
      case 'deleteFile':
        return `✅ File deleted: ${args.path}`;
      
      case 'createFolder':
        return `✅ Folder created: ${args.path}`;
      
      case 'deleteFolder':
        return `✅ Folder deleted: ${args.path}${args.recursive ? ' (recursive)' : ''}`;
      
      case 'searchFiles':
        const resultCount = result.resultCount || 0;
        const resultPreview = result.results?.slice(0, 5).map((r: any) => 
          `  ${r.type === 'filename' ? '📄' : '📝'} ${r.path}${r.line ? `:${r.line}` : ''}${r.preview ? ` - ${r.preview}` : ''}`
        ).join('\n') || '';
        return `✅ Found ${resultCount} matches for "${args.query}"\n${resultPreview}${resultCount > 5 ? `\n  ... and ${resultCount - 5} more matches` : ''}`;
      
      case 'getFileInfo':
        return `✅ File info for ${result.path}:\n  Type: ${result.type}\n  Size: ${result.size} bytes\n  Modified: ${new Date(result.modified).toLocaleString()}`;
      
      case 'copyFile':
      case 'renameFile':
        return `✅ ${result.message}`;
      
      case 'todo_read':
        const todos = result.todos || [];
        const todoPreview = todos.slice(0, 5).map((t: any) => 
          `  ${t.status === 'completed' ? '✅' : t.status === 'in-progress' ? '🔄' : '⭕'} ${t.content}`
        ).join('\n') || '  No todos found';
        return `✅ Current todos (${todos.length}):\n${todoPreview}${todos.length > 5 ? `\n  ... and ${todos.length - 5} more todos` : ''}`;
      
      case 'todo_write':
        return `✅ Updated todo list (${args.todos?.length || 0} items)`;
      
      case 'parseCSV':
        const rowCount = result.data?.length || 0;
        const colCount = result.headers?.length || 0;
        return `✅ Parsed CSV: ${rowCount} rows, ${colCount} columns\n  Headers: ${result.headers?.slice(0, 5).join(', ')}${colCount > 5 ? '...' : ''}`;
      
      case 'writeCSV':
        return `✅ CSV written to ${args.path} (${result.rowCount || 0} rows)`;
      
      case 'fetchWebContent':
        const contentLength = result.content?.length || 0;
        const title = result.title ? `\n  Title: ${result.title}` : '';
        return `✅ Fetched ${args.url} (${contentLength} chars)${title}`;
      
      default:
        // Generic success message with result preview
        if (result.success || result.message) {
          const message = result.message || 'Operation completed successfully';
          const hasData = Object.keys(result).some(key => !['success', 'message'].includes(key));
          const dataPreview = hasData ? `\n  Result: ${JSON.stringify(result, null, 2).substring(0, 200)}${JSON.stringify(result).length > 200 ? '...' : ''}` : '';
          return `✅ ${message}${dataPreview}`;
        }
        return `✅ ${toolName} completed`;
    }
  };

  // Load threads on mount
  useEffect(() => {
    const loadThreads = async () => {
      try {
        // Check if database exists, if not, create it with migration
        if (!fs.existsSync(DATABASE_PATH)) {
          console.log('Setting up database for first time...');
          // For global installation, we need to create tables manually since we can't run migrations
          // The database will be created automatically when Prisma connects
        }
        
        const threadList = await ThreadDatabase.getAllThreads();
        setThreads(threadList);
        setIsLoadingThreads(false);
      } catch (error) {
        console.error('Failed to load threads:', error);
        setIsLoadingThreads(false);
      }
    };
    
    loadThreads();
  }, []);

  // Handle thread selection
  const handleThreadSelect = useCallback(async (threadIdOrNew: string | 'new') => {
    if (threadIdOrNew === 'new') {
      // Create new thread and go straight to chat
      try {
        // Prevent duplicate creation using ref (immediate check)
        if (currentThreadId || isCreatingThread.current) {
          setIsSelectingThread(false);
          return;
        }
        
        isCreatingThread.current = true;
        const threadId = await ThreadDatabase.createThread();
        setCurrentThreadId(threadId);
        
        const systemMessage: Message = {
          role: 'system',
          content: SYSTEM_PROMPT
        };
        setConversationHistory([systemMessage]);
        setIsSelectingThread(false);
      } catch (error) {
        console.error('Failed to create thread:', error);
      } finally {
        isCreatingThread.current = false;
      }
    } else {
      // Show thread management for existing threads
      const thread = threads.find(t => t.id === threadIdOrNew);
      if (thread) {
        setSelectedThread(thread);
        setIsSelectingThread(false);
        setIsManagingThread(true);
        setThreadManagementIndex(0);
      }
    }
  }, [currentThreadId, threads]);

  // Handle thread management actions
  const handleContinueThread = useCallback(async () => {
    if (!selectedThread) return;
    
    try {
      setCurrentThreadId(selectedThread.id);
      
      // Load thread history
      const thread = await ThreadDatabase.getThread(selectedThread.id);
      if (thread && thread.messages.length > 0) {
        const loadedHistory = thread.messages.map(msg => ({
          role: msg.role.toLowerCase() as 'user' | 'assistant' | 'system' | 'tool',
          content: msg.content,
          ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
          ...(msg.role === 'TOOL' && msg.toolResponses?.[0] && {
            tool_call_id: msg.toolResponses[0].tool_call_id,
            name: msg.toolResponses[0].name
          })
        }));
        
        setConversationHistory(loadedHistory);
        
        // Display loaded messages
        const displayMessages = thread.messages
          .filter(msg => msg.role !== 'SYSTEM')
          .map(msg => ({
            role: msg.role.toLowerCase() as 'user' | 'assistant',
            content: msg.content
          }));
        setMessages(displayMessages as DisplayMessage[]);
      } else {
        // Add system message if no messages exist
        const systemMessage: Message = {
          role: 'system',
          content: SYSTEM_PROMPT
        };
        setConversationHistory([systemMessage]);
      }
      
      setIsManagingThread(false);
    } catch (error) {
      console.error('Failed to continue thread:', error);
    }
  }, [selectedThread]);

  const handleDeleteThread = useCallback(async () => {
    if (!selectedThread || isDeletingThread) return;
    
    setIsDeletingThread(true);
    
    try {
      await ThreadDatabase.deleteThread(selectedThread.id);
      
      // Refresh thread list
      const threadList = await ThreadDatabase.getAllThreads();
      setThreads(threadList);
      
      // Go back to thread selection
      setIsManagingThread(false);
      setIsSelectingThread(true);
      setSelectedThread(null);
      setSelectedThreadIndex(0);
    } catch (error) {
      console.error('Failed to delete thread:', error);
    } finally {
      setIsDeletingThread(false);
    }
  }, [selectedThread, isDeletingThread]);

  const handleBackToThreadList = useCallback(() => {
    setIsManagingThread(false);
    setIsSelectingThread(true);
    setSelectedThread(null);
  }, []);

  // Generate thread title based on first message
  const generateThreadTitle = useCallback(async (userMessage: string, threadId: string) => {
    try {
      const titlePrompt = [
        {
          role: 'system' as const,
          content: 'You are a helpful assistant that generates concise, descriptive titles for conversation threads. Based on the user\'s first message, create a short title (max 50 characters) that captures the main topic or request. Return only the title, nothing else.'
        },
        {
          role: 'user' as const,
          content: `Generate a title for this conversation: "${userMessage}"`
        }
      ];

      const titleResponse = await callOpenRouterAPI(titlePrompt, []);
      const title = titleResponse.choices?.[0]?.message?.content?.trim() || 'Untitled';
      
      // Update thread title in database
      await ThreadDatabase.updateThreadTitle(threadId, title);
      
      // Refresh thread list if we're viewing it
      if (isSelectingThread || isManagingThread) {
        const threadList = await ThreadDatabase.getAllThreads();
        setThreads(threadList);
      }
      
    } catch (error) {
      console.error('Failed to generate thread title:', error);
    }
  }, [isSelectingThread, isManagingThread]);

  const executeToolCall = useCallback(async (toolCall: ToolCall): Promise<any> => {
    const { name, arguments: argsString } = toolCall.function;
    
    let args: any;
    try {
      args = JSON.parse(argsString);
    } catch (error) {
      return { error: 'Invalid JSON in tool arguments' };
    }

    const implementation = toolImplementations[name];
    if (!implementation) {
      return { error: `Unknown tool: ${name}` };
    }

    // Show tool execution start
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `🛠️ Executing ${name}...`,
      isProcessing: true
    } as DisplayMessage]);

    try {
      const result = await implementation(args);
      
      // Small delay to prevent flickering
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Update the last message to show completion instead of adding new ones
      setMessages(prev => {
        const newMessages = [...prev];
        // Remove the "Executing..." message
        newMessages.pop();
        
        // Special display for 'think' tool
        if (name === 'think') {
          newMessages.push({
            role: 'assistant',
            content: `💭 ${args.thoughts}`,
            isThinking: true
          } as DisplayMessage);
        } else {
          // Show detailed completion for other tools with formatted result
          const resultDisplay = formatToolResult(name, args, result);
          newMessages.push({
            role: 'assistant',
            content: resultDisplay,
            isProcessing: false,
            isToolResult: true
          } as DisplayMessage);
        }
        
        return newMessages;
      });
      
      return result;
    } catch (error: any) {
      setMessages(prev => {
        const newMessages = [...prev];
        // Remove the "Executing..." message
        newMessages.pop();
        // Add error message
        newMessages.push({
          role: 'assistant',
          content: `❌ ${name} failed: ${error.message}`,
          isProcessing: false
        } as DisplayMessage);
        return newMessages;
      });
      return { error: error.message };
    }
  }, []);

  const processAssistantResponse = useCallback(async (response: any, depth: number = 0): Promise<Message[]> => {
    // Prevent infinite recursion
    if (depth > 3) {
      console.warn('Maximum recursion depth reached for tool calls');
      return [];
    }

    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('No response choice from API');
    }

    const message = choice.message;
    const newMessages: Message[] = [];
    
    // Add assistant message to conversation
    const assistantMessage: Message = {
      role: 'assistant',
      content: message.content,
      tool_calls: message.tool_calls
    };
    newMessages.push(assistantMessage);

    // Save assistant message to database
    if (currentThreadId) {
      await ThreadDatabase.addMessage(
        currentThreadId,
        'ASSISTANT',
        message.content || '',
        message.tool_calls
      );
    }

    // Display assistant's text response if any
    if (message.content && message.content.trim()) {
      setMessages(prev => [...prev, {
        ...assistantMessage,
        showToolCalls: false
      } as DisplayMessage]);
    }

    // Process tool calls if any
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const result = await executeToolCall(toolCall);
        
        // Add tool response to conversation
        const toolMessage: Message = {
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
          name: toolCall.function.name
        };
        newMessages.push(toolMessage);

        // Save tool response to database
        if (currentThreadId) {
          await ThreadDatabase.addMessage(
            currentThreadId,
            'TOOL',
            JSON.stringify(result),
            undefined,
            [{ tool_call_id: toolCall.id, name: toolCall.function.name, result }]
          );
        }
      }

      // Get follow-up response from assistant after tool execution (with recursion limit)
      if (depth < 3) {
        const updatedHistory = [...conversationHistory, ...newMessages];
        const followUpResponse = await callOpenRouterAPI(updatedHistory, tools);
        const followUpMessages = await processAssistantResponse(followUpResponse, depth + 1);
        newMessages.push(...followUpMessages);
      }
    }

    return newMessages;
  }, [conversationHistory, executeToolCall, currentThreadId]);

  const handleSubmit = useCallback(async () => {
    if (!inputText.trim() || isProcessing) return;

    const userInput = inputText.trim();
    
    if (userInput.toLowerCase() === 'exit' || userInput.toLowerCase() === 'quit') {
      exit();
      return;
    }

    // Add user message to display and conversation
    const userMessage: Message = {
      role: 'user',
      content: userInput
    };

    setMessages(prev => [...prev, userMessage as DisplayMessage]);
    setInputText('');
    setIsProcessing(true);

    // Save user message to database
    if (currentThreadId) {
      await ThreadDatabase.addMessage(currentThreadId, 'USER', userInput);
      
      // Check if this is the first user message (only system message exists)
      const isFirstMessage = conversationHistory.length === 1 && conversationHistory[0].role === 'system';
      if (isFirstMessage) {
        // Generate thread title in the background
        generateThreadTitle(userInput, currentThreadId);
      }
    }

    try {
      const newHistory = [...conversationHistory, userMessage];
      
      // Validate and potentially clean conversation history
      const cleanHistory = validateConversationHistory(newHistory);
      
      // Limit conversation length
      const limitedHistory = cleanHistory.length > MAX_CONVERSATION_LENGTH
        ? cleanHistory.slice(-MAX_CONVERSATION_LENGTH)
        : cleanHistory;

      setConversationHistory(limitedHistory);

      // Call OpenRouter API
      const response = await callOpenRouterAPI(limitedHistory, tools);
      const responseMessages = await processAssistantResponse(response);
      
      setConversationHistory(prev => [...prev, ...responseMessages]);

    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❗ Error: ${error.message}`,
      } as DisplayMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [inputText, isProcessing, conversationHistory, processAssistantResponse, exit]);

  useInput((input, key) => {
    if (isSelectingThread) {
      if (key.upArrow) {
        setSelectedThreadIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedThreadIndex(prev => Math.min(threads.length, prev + 1));
      } else if (key.return) {
        const items = [
          { name: '🆕 Start a new thread', value: 'new' },
          ...threads.map(thread => ({ name: '', value: thread.id }))
        ];
        handleThreadSelect(items[selectedThreadIndex].value);
      } else if (key.ctrl && input === 'c') {
        exit();
      }
    } else if (isManagingThread) {
      if (key.upArrow && !isDeletingThread) {
        setThreadManagementIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && !isDeletingThread) {
        setThreadManagementIndex(prev => Math.min(2, prev + 1));
      } else if (key.return && !isDeletingThread) {
        const actions = [handleContinueThread, handleDeleteThread, handleBackToThreadList];
        actions[threadManagementIndex]();
      } else if (key.ctrl && input === 'c') {
        exit();
      }
    } else {
      if (key.return) {
        handleSubmit();
      } else if (key.ctrl && input === 'c') {
        exit();
      } else if (key.backspace || key.delete) {
        setInputText(prev => prev.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setInputText(prev => prev + input);
      }
    }
  });

  const formatMessage = (msg: DisplayMessage) => {
    const prefix = msg.role === 'user' ? '👤' : 
                  msg.role === 'assistant' ? '🤖' : 
                  msg.isThinking ? '💭' : 
                  msg.isToolResult ? '🔧' : '⚙️';
    
    const color = msg.role === 'user' ? 'blue' :
                 msg.role === 'assistant' ? 'green' :
                 msg.isThinking ? 'magenta' : 
                 msg.isToolResult ? 'cyan' : 'gray';
    
    return `${prefix} ${chalk[color](msg.content || '')}`;
  };

  if (isLoadingThreads) {
    return (
      <Box flexDirection="column" height="100%" justifyContent="center" alignItems="center">
        <Spinner label=" Loading threads..." />
      </Box>
    );
  }

  if (isSelectingThread) {
    return (
      <Box flexDirection="column" height="100%">
        <Box borderStyle="round" borderColor="gray" padding={1} marginBottom={1}>
          <Text bold>OpenRouter Agent CLI (Ink Interface)</Text>
        </Box>
        
        <ThreadSelector 
          threads={threads}
          selectedIndex={selectedThreadIndex}
          onSelect={handleThreadSelect}
        />
      </Box>
    );
  }

  if (isManagingThread && selectedThread) {
    return (
      <Box flexDirection="column" height="100%">
        <Box borderStyle="round" borderColor="gray" padding={1} marginBottom={1}>
          <Text bold>OpenRouter Agent CLI (Ink Interface)</Text>
        </Box>
        
        <ThreadManager
          thread={selectedThread}
          selectedIndex={threadManagementIndex}
          onContinue={handleContinueThread}
          onDelete={handleDeleteThread}
          onBack={handleBackToThreadList}
          isDeleting={isDeletingThread}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="round" borderColor="gray" padding={1} marginBottom={1}>
        <Text bold>OpenRouter Agent CLI (Ink Interface)</Text>
      </Box>
      
      <Box flexDirection="column" flexGrow={1} marginBottom={1} padding={1}>
        {messages.map((msg, index) => (
          <Box key={index} 
               marginBottom={msg.isToolResult ? 1 : 0} 
               borderStyle={msg.isToolResult ? "single" : undefined}
               borderColor={msg.isToolResult ? "cyan" : undefined}
               padding={msg.isToolResult ? 1 : 0}>
            <Text>{formatMessage(msg)}</Text>
          </Box>
        ))}
        
        {isProcessing && (
          <Box>
            <Spinner label=" Processing..." />
          </Box>
        )}
      </Box>
      
      <Box borderStyle="single" borderColor="blue" padding={1}>
        <Text>
          💬 {inputText}
          <Text dimColor>│ Enter to send, Ctrl+C to exit</Text>
        </Text>
      </Box>
    </Box>
  );
};

export function startInkInterface(): void {
  console.log('🚀 Starting OpenRouter Agent...');
  
  // Check for API key before starting
  if (!OPENROUTER_API_KEY) {
    console.error('❌ Error: OPENROUTER_API_KEY environment variable is required.');
    console.error('');
    console.error('Please set your OpenRouter API key:');
    console.error('  export OPENROUTER_API_KEY="your-api-key-here"');
    console.error('');
    console.error('Or add it to your shell profile (~/.bashrc, ~/.zshrc, etc.):');
    console.error('  echo \'export OPENROUTER_API_KEY="your-api-key-here"\' >> ~/.zshrc');
    process.exit(1);
  }

  console.log('✅ API key found');
  console.log('🚀 Starting Ink interface...');
  
  try {
    render(<App />);
  } catch (error) {
    console.error('❌ Error starting interface:', error);
    process.exit(1);
  }
}

// Always run when this file is executed
startInkInterface();