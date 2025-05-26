import { Box, Text } from 'ink';
import React from 'react';
import { AVAILABLE_MODELS } from '../core/config.js';
import type { ModelId } from '../core/config.js';

interface ModelSelectorProps {
  selectedIndex: number;
  onSelect: (model: ModelId) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedIndex,
  onSelect
}) => {
  return (
    <Box flexDirection="column" paddingX={2}>
      <Box marginBottom={1}>
        <Text bold color="yellow">Select a model to use:</Text>
      </Box>
      
      {AVAILABLE_MODELS.map((model, index) => (
        <Box key={model} paddingY={0}>
          <Text color={index === selectedIndex ? 'cyan' : 'white'}>
            {index === selectedIndex ? '❯ ' : '  '}
            {model}
          </Text>
        </Box>
      ))}
      
      <Box marginTop={1}>
        <Text dimColor>
          Use ↑↓ arrows to navigate, Enter to select, Ctrl+C to exit
        </Text>
      </Box>
    </Box>
  );
};