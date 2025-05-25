import React from 'react';
import { Box, Text } from 'ink';

interface ProcessingIndicatorProps {
  isProcessing: boolean;
}

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = React.memo(({ isProcessing }) => {
  if (!isProcessing) return null;

  return (
    <Box paddingY={1}>
      <Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
        <Text color="yellow" bold>processing your request...</Text>
      </Box>
    </Box>
  );
});

ProcessingIndicator.displayName = 'ProcessingIndicator';