#!/usr/bin/env node
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { ThemeProvider, defaultTheme } from '@inkjs/ui';
import { ThreadSelector } from '../components/ThreadSelector.js';
import { ThreadManager } from '../components/ThreadManager.js';
import { ChatInterface } from '../components/ChatInterface.js';
import { MAX_CONVERSATION_LENGTH } from '../core/config.js';
import { validateConversationHistory } from '../core/utils.js';
import { callOpenRouterAPI } from '../core/api.js';
import { tools, toolImplementations } from '../tools/index.js';
import type { Message, DisplayMessage, ToolCall } from '../core/types.js';
import { ThreadDatabase } from '../core/database.js';
import { SYSTEM_PROMPT } from '../core/system-prompt.js';
import { DATABASE_PATH, OPENROUTER_API_KEY } from '../core/config.js';
import fs from 'fs';

// Helper function to format file sizes
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface AppProps {}

interface ThreadListItem {
  id: string;
  title?: string;
  createdAt: Date;
  messageCount: number;
}



const App: React.FC<AppProps> = () => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [inputKey, setInputKey] = useState(0);
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
  const isDeletingThreadRef = useRef(false);
  const { exit } = useApp();
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format tool results for better display - no need for useCallback, it's a pure function
  const formatToolResult = (toolName: string, args: any, result: any): string => {
    if (result.error) {
      return `${toolName} failed: ${result.error}`;
    }

    if (!result.success && result.message) {
      return `${toolName}: ${result.message}`;
    }

    // Format based on tool type
    switch (toolName) {
      case 'listFiles':
        const fileList = result.files?.slice(0, 8).map((f: string) => `📄 ${f}`).join('\n') || '';
        const moreFiles = result.files?.length > 8 ? `\n... and ${result.files.length - 8} more files` : '';
        return `Listed ${result.fileCount || 0} files in ${result.directory || args.path || '.'}\n${fileList}${moreFiles}`;
      
      case 'listFolders':
        const folderList = result.folders?.slice(0, 8).map((f: string) => `📁 ${f}`).join('\n') || '';
        const moreFolders = result.folders?.length > 8 ? `\n... and ${result.folders.length - 8} more folders` : '';
        return `Listed ${result.folderCount || 0} folders in ${result.directory || args.path || '.'}\n${folderList}${moreFolders}`;
      
      case 'readFile':
        const content = result.content || '';
        const lines = content.split('\n').length;
        const sizeDesc = content.length > 1000 ? `${Math.round(content.length/1000)}KB` : `${content.length} chars`;
        return `Read ${result.path || args.path} (${lines} lines, ${sizeDesc})`;
      
      case 'writeFile':
        const sizeDesc2 = args.content?.length > 1000 ? `${Math.round(args.content.length/1000)}KB` : `${args.content?.length || 0} chars`;
        return `File written: ${args.path} (${sizeDesc2})`;
      
      case 'updateFile':
        return `File updated: ${args.path} (${args.operation}${result.linesModified ? `, ${result.linesModified} lines` : ''})`;
      
      case 'deleteFile':
        return `File deleted: ${args.path}`;
      
      case 'createFolder':
        return `Folder created: ${args.path}`;
      
      case 'deleteFolder':
        return `Folder deleted: ${args.path}${args.recursive ? ' (recursive)' : ''}`;
      
      case 'findFiles':
        const resultCount = result.resultCount || 0;
        const resultPreview = result.results?.slice(0, 4).map((r: any) => {
          const icon = r.type === 'filename' ? '📄' : r.type === 'folder' ? '📁' : '📝';
          return `${icon} ${r.path}${r.line ? `:${r.line}` : ''}${r.preview ? ` - ${r.preview.substring(0, 50)}${r.preview.length > 50 ? '...' : ''}` : ''}`;
        }).join('\n') || '';
        const searchTypeDesc = args.searchType === 'both' ? 'files & content' : 
                             args.searchType === 'content' ? 'content' : 
                             args.searchType === 'folders' ? 'folders' :
                             args.searchType === 'all' ? 'files, folders & content' : 'files';
        const searchPath = args.path ? ` in ${args.path}` : '';
        const typeFilter = args.fileType ? ` (${args.fileType} files)` : '';
        return `🔍 Found ${resultCount} ${searchTypeDesc} matches for "${args.pattern}"${searchPath}${typeFilter}${result.hasMore ? ' (limited)' : ''}\n${resultPreview}${resultCount > 4 ? `\n... and ${resultCount - 4} more matches` : ''}`;
      
      case 'getFileInfo':
        return `File info: ${result.path}\nType: ${result.type} | Size: ${result.size} bytes | Modified: ${new Date(result.modified).toLocaleDateString()}`;
      
      case 'copyFile':
      case 'renameFile':
        return `${result.message}`;
      
      case 'todo_read':
        const todos = result.todos || [];
        const todoPreview = todos.slice(0, 4).map((t: any) => 
          `${t.status === 'completed' ? '✅' : t.status === 'in-progress' ? '🔄' : '⭕'} ${t.content}`
        ).join('\n') || 'No todos found';
        return `Current todos (${todos.length}):\n${todoPreview}${todos.length > 4 ? `\n... and ${todos.length - 4} more` : ''}`;
      
      case 'todo_write':
        return `Updated todo list (${args.todos?.length || 0} items)`;
      
      case 'parseCSV':
        const rowCount = result.data?.length || 0;
        const colCount = result.headers?.length || 0;
        return `Parsed CSV: ${rowCount} rows, ${colCount} columns\nHeaders: ${result.headers?.slice(0, 4).join(', ')}${colCount > 4 ? '...' : ''}`;
      
      case 'writeCSV':
        return `CSV written to ${args.path} (${result.rowCount || 0} rows)`;
      
      case 'fetchWebContent':
        const contentLength = result.content?.length || 0;
        const sizeDesc3 = contentLength > 1000 ? `${Math.round(contentLength/1000)}KB` : `${contentLength} chars`;
        const title = result.title ? `\nTitle: ${result.title}` : '';
        return `Fetched ${args.url} (${sizeDesc3})${title}`;
      
      case 'downloadFile':
        if (result.success) {
          return `📥 Downloaded ${result.filename} (${result.sizeFormatted}) to ${result.filePath}`;
        }
        return `❌ Download failed: ${result.error || 'Unknown error'}`;
      
      case 'checkUrlStatus':
        if (result.success) {
          const status = result.accessible ? '✅ Accessible' : '❌ Not accessible';
          return `${status} - ${args.url} (${result.statusCode} ${result.statusText})\nContent-Type: ${result.contentType}\nSize: ${result.contentLength}`;
        }
        return `❌ URL check failed: ${result.error || 'Unknown error'}`;
      
      case 'extractLinksFromPage':
        if (result.success) {
          const linkCount = result.totalFound || 0;
          const summary = Object.entries(result.links || {}).map(([type, links]: [string, any]) => 
            `${type}: ${Array.isArray(links) ? links.length : 0}`
          ).join(', ');
          return `🔗 Found ${linkCount} links on ${args.url}\n${summary}`;
        }
        return `❌ Link extraction failed: ${result.error || 'Unknown error'}`;
      
      case 'glob':
        if (result.success) {
          const resultCount = result.resultCount || 0;
          const searchPath = result.searchPath || '.';
          const pattern = result.pattern || args.pattern;
          const hasMore = result.hasMore;
          
          // Format results based on whether they're objects or strings
          const results = result.results || [];
          let resultPreview = '';
          
          if (results.length > 0) {
            const displayLimit = 8;
            const itemsToShow = results.slice(0, displayLimit);
            
            resultPreview = itemsToShow.map((item: any) => {
              if (typeof item === 'string') {
                // Simple string path
                return `📄 ${item}`;
              } else if (item.path) {
                // Object with metadata
                const icon = item.dirent?.isDirectory() ? '📁' : '📄';
                const sizeInfo = item.size ? ` (${item.sizeFormatted || formatBytes(item.size)})` : '';
                return `${icon} ${item.path}${sizeInfo}`;
              } else {
                return `📄 ${JSON.stringify(item)}`;
              }
            }).join('\n');
            
            if (results.length > displayLimit) {
              resultPreview += `\n... and ${results.length - displayLimit} more items`;
            }
          } else {
            resultPreview = 'No matches found';
          }
          
          const searchDesc = searchPath !== '.' ? ` in ${searchPath}` : '';
          const moreIndicator = hasMore ? ' (results limited)' : '';
          
          return `🔍 Found ${resultCount} items matching "${pattern}"${searchDesc}${moreIndicator}\n${resultPreview}`;
        }
        return `❌ Glob search failed: ${result.error || 'Unknown error'}`;
      
      default:
        // Generic success message with result preview
        if (result.success || result.message) {
          const message = result.message || 'Operation completed';
          return message;
        }
        return `${toolName} completed`;
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

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
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
    if (!selectedThread || isDeletingThreadRef.current) return;
    
    // Use ref to prevent race conditions
    isDeletingThreadRef.current = true;
    setIsDeletingThread(true);
    
    try {
      console.log('Starting thread deletion for:', selectedThread.id);
      await ThreadDatabase.deleteThread(selectedThread.id);
      
      // Refresh thread list
      const threadList = await ThreadDatabase.getAllThreads();
      setThreads(threadList);
      
      // Go back to thread selection
      setIsManagingThread(false);
      setIsSelectingThread(true);
      setSelectedThread(null);
      setSelectedThreadIndex(0);
      
      console.log('Thread deletion completed successfully');
    } catch (error) {
      console.error('Failed to delete thread:', error);
    } finally {
      isDeletingThreadRef.current = false;
      setIsDeletingThread(false);
    }
  }, [selectedThread]);

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

    const toolId = `tool-${Date.now()}-${Math.random()}`;

    try {
      // Show tool execution
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: name === 'think' ? args.thoughts : `${name}`,
        isToolExecution: true,
        toolName: name,
        isProcessing: true,
        id: toolId
      } as DisplayMessage]);

      const result = await implementation(args);
      
      // Replace executing message with result using stable ID
      setMessages(prev => prev.map(msg => 
        msg.id === toolId ? {
          role: 'assistant',
          content: name === 'think' ? args.thoughts : formatToolResult(name, args, result),
          isProcessing: false,
          isToolResult: name !== 'think',
          isThinking: name === 'think',
          id: toolId
        } as DisplayMessage : msg
      ));
      
      return result;
    } catch (error: any) {
      // Replace executing message with error using stable ID
      setMessages(prev => prev.map(msg => 
        msg.id === toolId ? {
          role: 'assistant',
          content: `❌ ${name} failed: ${error.message}`,
          isProcessing: false,
          isToolResult: true,
          id: toolId
        } as DisplayMessage : msg
      ));
      return { error: error.message };
    }
  }, [formatToolResult]);

  const processAssistantResponse = useCallback(async (response: any, currentHistory: Message[], depth: number = 0): Promise<Message[]> => {
    // Prevent infinite recursion
    if (depth > 3) {
      console.warn('Maximum recursion depth reached for tool calls');
      return [];
    }

    const choice = response.choices?.[0];
    if (!choice) {
      throw new Error('The AI model did not provide a response. Please try your request again.');
    }

    if (!choice.message) {
      throw new Error('The AI model returned an incomplete response. Please try again.');
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
        const updatedHistory = [...currentHistory, ...newMessages];
        const followUpResponse = await callOpenRouterAPI(updatedHistory, tools);
        const followUpMessages = await processAssistantResponse(followUpResponse, updatedHistory, depth + 1);
        newMessages.push(...followUpMessages);
      }
    }

    return newMessages;
  }, [executeToolCall, currentThreadId]);

  const handleSubmit = useCallback(async (userInput: string) => {
    if (!userInput.trim() || isProcessing) return;

    const trimmedInput = userInput.trim();
    
    if (trimmedInput.toLowerCase() === 'exit' || trimmedInput.toLowerCase() === 'quit') {
      exit();
      return;
    }

    // Add user message to display and conversation
    const userMessage: Message = {
      role: 'user',
      content: trimmedInput
    };

    setMessages(prev => [...prev, userMessage as DisplayMessage]);
    setIsProcessing(true);

    // Save user message to database
    if (currentThreadId) {
      await ThreadDatabase.addMessage(currentThreadId, 'USER', trimmedInput);
      
      // Check if this is the first user message (only system message exists)
      const isFirstMessage = conversationHistory.length === 1 && conversationHistory[0].role === 'system';
      if (isFirstMessage) {
        // Generate thread title in the background
        generateThreadTitle(trimmedInput, currentThreadId);
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

      // Call OpenRouter API
      const response = await callOpenRouterAPI(limitedHistory, tools);
      const responseMessages = await processAssistantResponse(response, limitedHistory);
      
      // Update conversation history with both the limited history and new responses
      const finalHistory = [...limitedHistory, ...responseMessages];
      setConversationHistory(finalHistory);

    } catch (error: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❗ Error: ${error.message}`,
      } as DisplayMessage]);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, conversationHistory, processAssistantResponse, exit, currentThreadId, generateThreadTitle]);

  const handleInputKeyChange = useCallback(() => {
    setInputKey(prev => prev + 1);
  }, []);

  useInput((input, key) => {
    if (isSelectingThread) {
      if (key.upArrow) {
        setSelectedThreadIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedThreadIndex(prev => Math.min(threads.length, prev + 1));
      } else if (key.return) {
        const items = [
          { name: 'Start a new thread', value: 'new' },
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
      // Chat mode - TextInput component handles the input now
      if (key.ctrl && input === 'c') {
        exit();
      }
    }
  });

  if (isLoadingThreads) {
    return (
      <Box flexDirection="column" height="100%" justifyContent="center" alignItems="center">
        <Box flexDirection="column" alignItems="center">
          <Text bold color="cyan">▌maki</Text>
          <Text>Loading...</Text>
        </Box>
      </Box>
    );
  }

  if (isSelectingThread) {
    return (
      <Box flexDirection="column" height="100%">
        <Box paddingY={1}>
          <Text bold color="cyan">▌maki</Text>
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
        <Box paddingY={1}>
          <Text bold color="cyan">▌maki</Text>
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
    <ChatInterface
      messages={messages}
      isProcessing={isProcessing}
      inputKey={inputKey}
      onSubmit={handleSubmit}
      onInputKeyChange={handleInputKeyChange}
    />
  );
};

export function startInkInterface(): void {
  console.log('🚀 Starting maki...');
  
  // Check for API key before starting
  if (!OPENROUTER_API_KEY) {
    console.error('❌ Error: OPENROUTER_API_KEY environment variable is required.');
    console.error('');
    console.error('Please set your OpenRouter API key:');
    console.error('  export OPENROUTER_API_KEY="your-api-key-here"');
    console.error('');
    console.error('Or add it to your shell profile (~/.bashrc, ~/.zshrc, etc.):');
    console.error('  echo \'export OPENROUTER_API_KEY="your-api-key-here"\' >> ~/.zshrc');
    console.error('');
    console.error('You can get an API key from: https://openrouter.ai/settings/keys');
    process.exit(1);
  }

  console.log('✅ API key found');
  console.log('🚀 Starting Ink interface...');
  
  try {
    render(
      <ThemeProvider theme={defaultTheme}>
        <App />
      </ThemeProvider>
    );
  } catch (error) {
    console.error('❌ Error starting interface:', error);
    process.exit(1);
  }
}

// Always run when this file is executed
startInkInterface();