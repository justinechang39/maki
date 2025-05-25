import React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@inkjs/ui';

interface InputAreaProps {
  inputKey: number;
  isProcessing: boolean;
  onSubmit: (value: string) => void;
  onInputKeyChange: () => void;
}

export const InputArea: React.FC<InputAreaProps> = React.memo(({ 
  inputKey, 
  isProcessing, 
  onSubmit, 
  onInputKeyChange 
}) => {
  return (
    <Box paddingY={1}>
      <Box flexDirection="row" alignItems="center">
        <Box borderStyle="single" borderColor={isProcessing ? 'yellow' : 'blue'} paddingX={1} flexGrow={1}>
          <TextInput
            key={inputKey}
            placeholder={isProcessing ? "processing..." : "ask me anything..."}
            isDisabled={isProcessing}
            onSubmit={(value) => {
              onSubmit(value);
              onInputKeyChange();
            }}
          />
        </Box>
        <Box marginLeft={1}>
          <Text dimColor>⏎ send • ^C exit</Text>
        </Box>
      </Box>
    </Box>
  );
});

InputArea.displayName = 'InputArea';