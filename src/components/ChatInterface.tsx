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
    <Box flexDirection="column">
      {/* Header */}
      <Static items={[{ id: 'header' }]}>
        {(item) => <Text key={item.id} bold color="cyan">▌maki</Text>}
      </Static>
      
      {/* Messages */}
      <Box flexDirection="column" paddingY={1}>
        {messages.map((msg, index) => (
          <Box key={index}>
            <MessageRenderer message={msg} />
          </Box>
        ))}
      </Box>
      
      {/* Processing Status */}
      <ProcessingIndicator isProcessing={isProcessing} />
      
      {/* Input */}
      <InputArea
        inputKey={inputKey}
        isProcessing={isProcessing}
        onSubmit={onSubmit}
        onInputKeyChange={onInputKeyChange}
      />
    </Box>
  );
});

ChatInterface.displayName = 'ChatInterface';