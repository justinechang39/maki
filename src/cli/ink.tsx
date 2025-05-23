#!/usr/bin/env node
import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp } from 'ink';
import { Spinner } from '@inkjs/ui';
import chalk from 'chalk';
import { MAX_CONVERSATION_LENGTH } from '../core/config.js';
import { validateConversationHistory } from '../core/utils.js';
import { callOpenRouterAPI } from '../core/api.js';
import { tools, toolImplementations } from '../tools/index.js';
import type { Message, DisplayMessage, ToolCall } from '../core/types.js';

interface AppProps {}

const App: React.FC<AppProps> = () => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<Message[]>([
    {
      role: 'system',
      content: 'You are a helpful file management assistant. You have access to tools for working with files, CSV data, todos, and web content within a designated workspace. Use the available tools to help users with their requests. Be concise and helpful in your responses.'
    }
  ]);
  const { exit } = useApp();

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

    // Show tool execution
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: `🛠️ Executing ${name}...`,
      isProcessing: true
    } as DisplayMessage]);

    try {
      const result = await implementation(args);
      
      // Special display for 'think' tool
      if (name === 'think') {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `💭 ${args.thoughts.substring(0, 150)}${args.thoughts.length > 150 ? '...' : ''}`,
          isThinking: true
        } as DisplayMessage]);
      } else {
        // Show completion for other tools
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `✅ ${name} completed`,
          isProcessing: false
        } as DisplayMessage]);
      }
      
      return result;
    } catch (error: any) {
      return { error: error.message };
    }
  }, []);

  const processAssistantResponse = useCallback(async (response: any): Promise<Message[]> => {
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
      }

      // Get follow-up response from assistant after tool execution
      const updatedHistory = [...conversationHistory, ...newMessages];
      const followUpResponse = await callOpenRouterAPI(updatedHistory, tools);
      const followUpMessages = await processAssistantResponse(followUpResponse);
      newMessages.push(...followUpMessages);
    }

    return newMessages;
  }, [conversationHistory, executeToolCall]);

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
    if (key.return) {
      handleSubmit();
    } else if (key.ctrl && input === 'c') {
      exit();
    } else if (key.backspace || key.delete) {
      setInputText(prev => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setInputText(prev => prev + input);
    }
  });

  const formatMessage = (msg: DisplayMessage) => {
    const prefix = msg.role === 'user' ? '👤' : 
                  msg.role === 'assistant' ? '🤖' : 
                  msg.isThinking ? '💭' : '⚙️';
    
    const color = msg.role === 'user' ? 'blue' :
                 msg.role === 'assistant' ? 'green' :
                 msg.isThinking ? 'magenta' : 'gray';
    
    return `${prefix} ${chalk[color](msg.content || '')}`;
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box borderStyle="round" borderColor="gray" padding={1} marginBottom={1}>
        <Text bold>OpenRouter Agent CLI (Ink Interface)</Text>
      </Box>
      
      <Box flexDirection="column" flexGrow={1} marginBottom={1} padding={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={0}>
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
  render(<App />);
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startInkInterface();
}