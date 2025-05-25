import React from 'react';
import { Box, Text, Static } from 'ink';
import { MessageRenderer } from './MessageRenderer.js';
import { ProcessingIndicator } from './ProcessingIndicator.js';
import { InputArea } from './InputArea.js';
import type { DisplayMessage } from '../core/types.js';

interface ChatInterfaceProps {
  messages: DisplayMessage[];
  isProcessing: boolean;
  inputKey: number;
  onSubmit: (value: string) => void;
  onInputKeyChange: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = React.memo(({ 
  messages, 
  isProcessing, 
  inputKey, 
  onSubmit, 
  onInputKeyChange 
}) => {
  return (
    <Box flexDirection="column" height="100%">
      {/* Header */}
      <Static items={[{ id: 'header' }]}>
        {(item) => <Text key={item.id} bold color="cyan">▌maki</Text>}
      </Static>
      
      {/* Messages Container with stable positioning */}
      <Box flexDirection="column" paddingY={1} flexGrow={1} minHeight={0} overflowY="hidden">
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
    </Box>
  );
});

ChatInterface.displayName = 'ChatInterface';