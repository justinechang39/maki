import React from 'react';
import { Box, Text } from 'ink';
import type { DisplayMessage } from '../core/types.js';

interface MessageRendererProps {
  message: DisplayMessage;
}

export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(({ message: msg }) => {
  if (msg.isToolResult) {
    const isError = msg.content?.includes('❌');
    const isSuccess = msg.content?.includes('✅') || (!isError && msg.content);
    const borderColor = isError ? 'red' : isSuccess ? 'green' : 'cyan';
    const iconColor = isError ? 'red' : isSuccess ? 'green' : 'cyan';
    const icon = isError ? '❌' : '🔧';
    
    return (
      <Box paddingX={2} paddingY={1} borderStyle="round" borderColor={borderColor}>
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color={iconColor} bold>{icon} {msg.toolName || 'tool'}</Text>
          </Box>
          <Text color={iconColor} wrap="wrap">{msg.content?.replace(/^[✅❌⚠️]\s*/, '') || ''}</Text>
        </Box>
      </Box>
    );
  }
  
  if (msg.isToolExecution) {
    if (msg.toolName === 'think') {
      return (
        <Box paddingX={2} paddingY={1} borderStyle="round" borderColor="magenta">
          <Text color="magenta" italic bold>thinking: {msg.content}</Text>
        </Box>
      );
    }
    
    return (
      <Box paddingX={2} paddingY={1} borderStyle="round" borderColor="cyan">
        <Text color="cyan" bold>executing {msg.toolName}...</Text>
      </Box>
    );
  }
  
  if (msg.isThinking) {
    return (
      <Box paddingX={2} paddingY={1} borderStyle="round" borderColor="magenta">
        <Box flexDirection="column">
          <Box marginBottom={1}>
            <Text color="magenta" bold>💭 thinking</Text>
          </Box>
          <Text color="magenta" italic wrap="wrap">{msg.content}</Text>
        </Box>
      </Box>
    );
  }
  
  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';
  
  if (isUser) {
    return (
      <Box>
        <Text color="blue">▌{msg.content}</Text>
      </Box>
    );
  }
  
  if (isAssistant) {
    return (
      <Box>
        <Text color="green">▌{msg.content}</Text>
      </Box>
    );
  }
  
  return (
    <Box>
      <Text dimColor>{msg.content || ''}</Text>
    </Box>
  );
});

MessageRenderer.displayName = 'MessageRenderer';