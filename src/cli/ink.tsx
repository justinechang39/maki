#!/usr/bin/env node
import { ThemeProvider, defaultTheme } from '@inkjs/ui';
import { Box, Text, render, useApp, useInput } from 'ink';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChatInterface } from '../components/ChatInterface.js';
import { ModelSelector } from '../components/ModelSelector.js';
import { ThreadManager } from '../components/ThreadManager.js';
import { ThreadSelector } from '../components/ThreadSelector.js';

import fs from 'fs';
import type { ModelId } from '../core/config.js';
import {
  AVAILABLE_MODELS,
  DATABASE_PATH,
  OPENROUTER_API_KEY,
  setSelectedModel
} from '../core/config.js';
import { ThreadDatabase } from '../core/database.js';
import {
  createMakiAgent,
  executeAgent,
  executeAgentWithProgress
} from '../core/langchain-agent.js';
import { createMemoryFromHistory } from '../core/langchain-memory.js';
import { executeMultiAgent } from '../core/multi-agent-system.js';
import { SYSTEM_PROMPT } from '../core/system-prompt.js';
import type { DisplayMessage, Message } from '../core/types.js';

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
  const [isSelectingModel, setIsSelectingModel] = useState(true);
  const [isSelectingThread, setIsSelectingThread] = useState(false);
  const [isManagingThread, setIsManagingThread] = useState(false);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [selectedThread, setSelectedThread] = useState<ThreadListItem | null>(
    null
  );
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [selectedThreadIndex, setSelectedThreadIndex] = useState(0);
  const [threadManagementIndex, setThreadManagementIndex] = useState(0);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);
  const [isDeletingThread, setIsDeletingThread] = useState(false);
  const [lastUsage, setLastUsage] = useState<any>(null);
  const [agentMode, setAgentMode] = useState<'single' | 'multi'>('multi');
  const isCreatingThread = useRef(false);
  const isDeletingThreadRef = useRef(false);
  const { exit } = useApp();
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create agent instance once and reuse it
  const agentRef = useRef<any>(null);

  // Format tool results for better display - no need for useCallback, it's a pure function
  const formatToolResult = (
    toolName: string,
    args: any,
    result: any
  ): string => {
    if (result.error) {
      return `${toolName} failed: ${result.error}`;
    }

    if (!result.success && result.message) {
      return `${toolName}: ${result.message}`;
    }

    // Format based on tool type
    switch (toolName) {
      case 'listFiles':
        const fileList =
          result.files
            ?.slice(0, 8)
            .map((f: string) => `📄 ${f}`)
            .join('\n') || '';
        const moreFiles =
          result.files?.length > 8
            ? `\n... and ${result.files.length - 8} more files`
            : '';
        return `Listed ${result.fileCount || 0} files in ${
          result.directory || args.path || '.'
        }\n${fileList}${moreFiles}`;

      case 'listFolders':
        const folderList =
          result.folders
            ?.slice(0, 8)
            .map((f: string) => `📁 ${f}`)
            .join('\n') || '';
        const moreFolders =
          result.folders?.length > 8
            ? `\n... and ${result.folders.length - 8} more folders`
            : '';
        return `Listed ${result.folderCount || 0} folders in ${
          result.directory || args.path || '.'
        }\n${folderList}${moreFolders}`;

      case 'readFile':
        const content = result.content || '';
        const lines = content.split('\n').length;
        const sizeDesc =
          content.length > 1000
            ? `${Math.round(content.length / 1000)}KB`
            : `${content.length} chars`;
        return `Read ${result.path || args.path} (${lines} lines, ${sizeDesc})`;

      case 'writeFile':
        const sizeDesc2 =
          args.content?.length > 1000
            ? `${Math.round(args.content.length / 1000)}KB`
            : `${args.content?.length || 0} chars`;
        return `File written: ${args.path} (${sizeDesc2})`;

      case 'updateFile':
        return `File updated: ${args.path} (${args.operation}${
          result.linesModified ? `, ${result.linesModified} lines` : ''
        })`;

      case 'deleteFile':
        return `File deleted: ${args.path}`;

      case 'createFolder':
        return `Folder created: ${args.path}`;

      case 'deleteFolder':
        return `Folder deleted: ${args.path}${
          args.recursive ? ' (recursive)' : ''
        }`;

      case 'findFiles':
        const resultCount = result.resultCount || 0;
        const resultPreview =
          result.results
            ?.slice(0, 4)
            .map((r: any) => {
              const icon =
                r.type === 'filename'
                  ? '📄'
                  : r.type === 'folder'
                  ? '📁'
                  : '📝';
              return `${icon} ${r.path}${r.line ? `:${r.line}` : ''}${
                r.preview
                  ? ` - ${r.preview.substring(0, 50)}${
                      r.preview.length > 50 ? '...' : ''
                    }`
                  : ''
              }`;
            })
            .join('\n') || '';
        const searchTypeDesc =
          args.searchType === 'both'
            ? 'files & content'
            : args.searchType === 'content'
            ? 'content'
            : args.searchType === 'folders'
            ? 'folders'
            : args.searchType === 'all'
            ? 'files, folders & content'
            : 'files';
        const searchPath = args.path ? ` in ${args.path}` : '';
        const typeFilter = args.fileType ? ` (${args.fileType} files)` : '';
        return `🔍 Found ${resultCount} ${searchTypeDesc} matches for "${
          args.pattern
        }"${searchPath}${typeFilter}${
          result.hasMore ? ' (limited)' : ''
        }\n${resultPreview}${
          resultCount > 4 ? `\n... and ${resultCount - 4} more matches` : ''
        }`;

      case 'getFileInfo':
        return `File info: ${result.path}\nType: ${result.type} | Size: ${
          result.size
        } bytes | Modified: ${new Date(result.modified).toLocaleDateString()}`;

      case 'copyFile':
      case 'renameFile':
        return `${result.message}`;

      case 'todo_read':
        const todos = result.todos || [];
        const todoPreview =
          todos
            .slice(0, 4)
            .map(
              (t: any) =>
                `${
                  t.status === 'completed'
                    ? '✅'
                    : t.status === 'in-progress'
                    ? '🔄'
                    : '⭕'
                } ${t.content}`
            )
            .join('\n') || 'No todos found';
        return `Current todos (${todos.length}):\n${todoPreview}${
          todos.length > 4 ? `\n... and ${todos.length - 4} more` : ''
        }`;

      case 'todo_write':
        return `Updated todo list (${args.todos?.length || 0} items)`;

      case 'parseCSV':
        const rowCount = result.data?.length || 0;
        const colCount = result.headers?.length || 0;
        return `Parsed CSV: ${rowCount} rows, ${colCount} columns\nHeaders: ${result.headers
          ?.slice(0, 4)
          .join(', ')}${colCount > 4 ? '...' : ''}`;

      case 'writeCSV':
        return `CSV written to ${args.path} (${result.rowCount || 0} rows)`;

      case 'fetchWebContent':
        const contentLength = result.content?.length || 0;
        const sizeDesc3 =
          contentLength > 1000
            ? `${Math.round(contentLength / 1000)}KB`
            : `${contentLength} chars`;
        const title = result.title ? `\nTitle: ${result.title}` : '';
        return `Fetched ${args.url} (${sizeDesc3})${title}`;

      case 'downloadFile':
        if (result.success) {
          return `📥 Downloaded ${result.filename} (${result.sizeFormatted}) to ${result.filePath}`;
        }
        return `❌ Download failed: ${result.error || 'Unknown error'}`;

      case 'checkUrlStatus':
        if (result.success) {
          const status = result.accessible
            ? '✅ Accessible'
            : '❌ Not accessible';
          return `${status} - ${args.url} (${result.statusCode} ${result.statusText})\nContent-Type: ${result.contentType}\nSize: ${result.contentLength}`;
        }
        return `❌ URL check failed: ${result.error || 'Unknown error'}`;

      case 'extractLinksFromPage':
        if (result.success) {
          const linkCount = result.totalFound || 0;
          const summary = Object.entries(result.links || {})
            .map(
              ([type, links]: [string, any]) =>
                `${type}: ${Array.isArray(links) ? links.length : 0}`
            )
            .join(', ');
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

            resultPreview = itemsToShow
              .map((item: any) => {
                if (typeof item === 'string') {
                  // Simple string path
                  return `📄 ${item}`;
                } else if (item.path) {
                  // Object with metadata
                  const icon = item.dirent?.isDirectory() ? '📁' : '📄';
                  const sizeInfo = item.size
                    ? ` (${item.sizeFormatted || formatBytes(item.size)})`
                    : '';
                  return `${icon} ${item.path}${sizeInfo}`;
                } else {
                  return `📄 ${JSON.stringify(item)}`;
                }
              })
              .join('\n');

            if (results.length > displayLimit) {
              resultPreview += `\n... and ${
                results.length - displayLimit
              } more items`;
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

  // Handle model selection
  const handleModelSelect = useCallback((model: ModelId) => {
    setSelectedModel(model);
    setIsSelectingModel(false);
    setIsSelectingThread(true);
  }, []);

  // Load threads and create agent after model selection
  useEffect(() => {
    if (isSelectingModel) return; // Don't initialize until model is selected

    const initializeApp = async () => {
      try {
        // Check if database exists, if not, create it with migration
        if (!fs.existsSync(DATABASE_PATH)) {
          console.log('Setting up database for first time...');
          // For global installation, we need to create tables manually since we can't run migrations
          // The database will be created automatically when Prisma connects
        }

        // Create agent fresh each time to use current model
        agentRef.current = await createMakiAgent(
          (toolName: string, message: string) => {
            setMessages(prev => [
              ...prev,
              {
                role: 'assistant',
                content: message,
                isToolResult: true,
                toolName: toolName,
                showToolCalls: false
              } as DisplayMessage
            ]);
          }
        );

        const threadList = await ThreadDatabase.getAllThreads();
        setThreads(threadList);
        setIsLoadingThreads(false);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsLoadingThreads(false);
      }
    };

    initializeApp();
  }, [isSelectingModel]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, []);

  // Handle thread selection
  const handleThreadSelect = useCallback(
    async (threadIdOrNew: string | 'new') => {
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
    },
    [currentThreadId, threads]
  );

  // Handle thread management actions
  const handleContinueThread = useCallback(async () => {
    if (!selectedThread) return;

    try {
      setCurrentThreadId(selectedThread.id);

      // Load thread history
      const thread = await ThreadDatabase.getThread(selectedThread.id);
      if (thread && thread.messages.length > 0) {
        const loadedHistory = thread.messages.map(msg => ({
          role: msg.role.toLowerCase() as
            | 'user'
            | 'assistant'
            | 'system'
            | 'tool',
          content: msg.content,
          ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
          ...(msg.role === 'TOOL' &&
            msg.toolResponses?.[0] && {
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
  const generateThreadTitle = useCallback(
    async (userMessage: string, threadId: string) => {
      try {
        const titlePrompt = [
          {
            role: 'system' as const,
            content:
              "You are a helpful assistant that generates concise, descriptive titles for conversation threads. Based on the user's first message, create a short title (max 50 characters) that captures the main topic or request. Return only the title, nothing else."
          },
          {
            role: 'user' as const,
            content: `Generate a title for this conversation: "${userMessage}"`
          }
        ];

        const agent = await createMakiAgent();
        const response = await executeAgent(
          agent,
          `Generate a title for this conversation: "${userMessage}"`,
          []
        );
        const title = response.output?.trim() || 'Untitled';

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
    },
    [isSelectingThread, isManagingThread]
  );

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (!userInput.trim() || isProcessing) return;

      const trimmedInput = userInput.trim();

      if (
        trimmedInput.toLowerCase() === 'exit' ||
        trimmedInput.toLowerCase() === 'quit'
      ) {
        exit();
        return;
      }

      // Keep existing UI updates
      const userMessage: Message = {
        role: 'user',
        content: trimmedInput
      };

      setMessages(prev => [...prev, userMessage as DisplayMessage]);
      setIsProcessing(true);

      // Keep database persistence
      if (currentThreadId) {
        await ThreadDatabase.addMessage(currentThreadId, 'USER', trimmedInput);

        const isFirstMessage =
          conversationHistory.length === 1 &&
          conversationHistory[0].role === 'system';
        if (isFirstMessage && currentThreadId) {
          generateThreadTitle(trimmedInput, currentThreadId);
        }
      }

      try {
        let response: any;

        if (agentMode === 'multi') {
          // Use multi-agent system with conversation history
          const multiResponse = await executeMultiAgent(
            trimmedInput,
            (agentName: string, message: string) => {
              setMessages(prev => [
                ...prev,
                {
                  role: 'assistant',
                  content: `🤖 ${agentName}: ${message}`,
                  isToolResult: true,
                  toolName: agentName,
                  showToolCalls: false
                } as DisplayMessage
              ]);
            },
            conversationHistory
          );

          response = {
            output: multiResponse.output,
            usage: null // Multi-agent doesn't return usage yet
          };

          // Show which agents were used
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `✅ Task completed using: ${multiResponse.agents_used.join(
                ' → '
              )}`,
              isToolResult: true,
              showToolCalls: false
            } as DisplayMessage
          ]);
        } else {
          // Use single agent (existing flow)
          if (!agentRef.current) {
            throw new Error('Agent not initialized');
          }

          const chatHistory = createMemoryFromHistory(conversationHistory);

          // Execute agent with progress tracking handled by tool wrappers
          response = await executeAgentWithProgress(
            agentRef.current,
            trimmedInput,
            chatHistory
          );
        }

        // Note: Tool calls are now handled by callbacks above, no need for fallback processing

        // Store usage data
        if (response.usage) {
          setLastUsage(response.usage);
        }

        // Display assistant response
        if (response.output && response.output.trim()) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: response.output,
              showToolCalls: false
            } as DisplayMessage
          ]);
        }

        // Persist to database
        if (currentThreadId && response.output) {
          await ThreadDatabase.addMessage(
            currentThreadId,
            'ASSISTANT',
            response.output
          );
        }

        // Update conversation history
        const newHistory = [
          ...conversationHistory,
          userMessage,
          {
            role: 'assistant' as const,
            content: response.output
          }
        ];
        setConversationHistory(newHistory);
      } catch (error: any) {
        // Keep existing error handling
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `❗ Error: ${error.message}`
          } as DisplayMessage
        ]);
      } finally {
        setIsProcessing(false);
      }
    },
    [
      isProcessing,
      conversationHistory,
      formatToolResult,
      exit,
      currentThreadId,
      generateThreadTitle
    ]
  );

  const handleInputKeyChange = useCallback(() => {
    setInputKey(prev => prev + 1);
  }, []);

  useInput((input, key) => {
    if (isSelectingModel) {
      if (key.upArrow) {
        setSelectedModelIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow) {
        setSelectedModelIndex(prev =>
          Math.min(AVAILABLE_MODELS.length - 1, prev + 1)
        );
      } else if (key.return) {
        handleModelSelect(AVAILABLE_MODELS[selectedModelIndex]);
      } else if (key.ctrl && input === 'c') {
        exit();
      }
    } else if (isSelectingThread) {
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
      console.log('keystroke');
      if (key.upArrow && !isDeletingThread) {
        setThreadManagementIndex(prev => Math.max(0, prev - 1));
      } else if (key.downArrow && !isDeletingThread) {
        setThreadManagementIndex(prev => Math.min(2, prev + 1));
      } else if (key.return && !isDeletingThread) {
        const actions = [
          handleContinueThread,
          handleDeleteThread,
          handleBackToThreadList
        ];
        actions[threadManagementIndex]();
      } else if (key.ctrl && input === 'c') {
        exit();
      }
    } else {
      // Chat mode - TextInput component handles the input now
      if (key.ctrl && input === 'c') {
        exit();
      } else if (key.ctrl && input === 't') {
        // Toggle agent mode with Ctrl+T
        setAgentMode(prev => {
          const newMode = prev === 'single' ? 'multi' : 'single';
          console.log(`Toggled agent mode: ${prev} -> ${newMode}`);
          return newMode;
        });
      }
    }
  });

  if (isSelectingModel) {
    return (
      <Box flexDirection="column" height="100%">
        <Box paddingY={1}>
          <Text bold color="cyan">
            ▌maki
          </Text>
        </Box>

        <ModelSelector
          selectedIndex={selectedModelIndex}
          onSelect={handleModelSelect}
        />
      </Box>
    );
  }

  if (isLoadingThreads) {
    return (
      <Box
        flexDirection="column"
        height="100%"
        justifyContent="center"
        alignItems="center"
      >
        <Box flexDirection="column" alignItems="center">
          <Text bold color="cyan">
            ▌maki
          </Text>
          <Text>Loading...</Text>
        </Box>
      </Box>
    );
  }

  if (isSelectingThread) {
    return (
      <Box flexDirection="column" height="100%">
        <Box paddingY={1}>
          <Text bold color="cyan">
            ▌maki
          </Text>
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
          <Text bold color="cyan">
            ▌maki
          </Text>
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
      usage={lastUsage}
      agentMode={agentMode}
    />
  );
};

export function startInkInterface(): void {
  console.log('🚀 Starting maki...');
  console.log(`📁 Working directory: ${process.cwd()}`);

  // Check for API key before starting
  if (!OPENROUTER_API_KEY) {
    console.error(
      '❌ Error: OPENROUTER_API_KEY environment variable is required.'
    );
    console.error('');
    console.error('Please set your OpenRouter API key:');
    console.error('  export OPENROUTER_API_KEY="your-api-key-here"');
    console.error('');
    console.error(
      'Or add it to your shell profile (~/.bashrc, ~/.zshrc, etc.):'
    );
    console.error(
      '  echo \'export OPENROUTER_API_KEY="your-api-key-here"\' >> ~/.zshrc'
    );
    console.error('');
    console.error(
      'You can get an API key from: https://openrouter.ai/settings/keys'
    );
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
