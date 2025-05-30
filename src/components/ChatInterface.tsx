import { Box, Static, Text } from 'ink';
import React from 'react';
import type { DisplayMessage } from '../core/types.js';
import { InputArea } from './InputArea.js';
import { MessageRenderer } from './MessageRenderer.js';
import { ProcessingIndicator } from './ProcessingIndicator.js';
import { UsageDisplay } from './UsageDisplay.js';

interface ChatInterfaceProps {
  messages: DisplayMessage[];
  isProcessing: boolean;
  inputKey: number;
  onSubmit: (value: string) => void;
  onInputKeyChange: () => void;
  agentMode?: 'single' | 'multi';
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    cached_tokens?: number;
    reasoning_tokens?: number;
  };
}

export const ChatInterface: React.FC<ChatInterfaceProps> = React.memo(
  ({
    messages,
    isProcessing,
    inputKey,
    onSubmit,
    onInputKeyChange,
    agentMode = 'single',
    usage
  }) => {
    return (
      <Box flexDirection="column" height="100%">
        {/* Header */}
        <Static items={[{ id: 'header' }]}>
          {item => (
            <Box key={item.id} flexDirection="column">
            <Text bold color="cyan">
              ▌maki
            </Text>
              <Box flexDirection="row" justifyContent="space-between">
              <Text color={agentMode === 'multi' ? 'green' : 'gray'}>
              Mode: {agentMode === 'multi' ? '🤖 Multi-Agent' : '🧠 Single Agent Mode'}
              </Text>
              <Text color="gray">(Ctrl+T to toggle)</Text>
            </Box>
            </Box>
          )}
        </Static>

        {/* Messages Container with stable positioning */}
        <Box
          flexDirection="column"
          paddingY={1}
          flexGrow={1}
          minHeight={0}
          overflowY="hidden"
        >
          {messages.map((msg, index) => (
            <Box key={msg.id || `msg-${index}`}>
              <MessageRenderer message={msg} />
            </Box>
          ))}
        </Box>

        {/* Processing Status */}
        <Box flexShrink={0}>
          <ProcessingIndicator isProcessing={isProcessing} />
        </Box>

        {/* Input */}
        <Box flexShrink={0}>
          <InputArea
            inputKey={inputKey}
            isProcessing={isProcessing}
            onSubmit={onSubmit}
            onInputKeyChange={onInputKeyChange}
          />
        </Box>

        {/* Usage - right below input with no gap */}
        {usage && (
          <Box flexShrink={0}>
            <UsageDisplay usage={usage} />
          </Box>
        )}
      </Box>
    );
  }
);

ChatInterface.displayName = 'ChatInterface';
