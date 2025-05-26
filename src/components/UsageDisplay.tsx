import { Box, Text } from 'ink';
import React from 'react';

interface UsageData {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
}

interface UsageDisplayProps {
  usage: UsageData;
}

export const UsageDisplay: React.FC<UsageDisplayProps> = ({ usage }) => {
  return (
    <Box flexDirection="row" gap={2}>
      <Text dimColor>📊</Text>
      <Text color="green">{usage.total_tokens} tokens</Text>
      <Text dimColor>•</Text>
      <Text dimColor>In: {usage.prompt_tokens}</Text>
      <Text dimColor>Out: {usage.completion_tokens}</Text>
      {usage.cached_tokens && usage.cached_tokens > 0 && (
        <>
          <Text dimColor>•</Text>
          <Text color="cyan">{usage.cached_tokens} cached</Text>
        </>
      )}
      {usage.reasoning_tokens && usage.reasoning_tokens > 0 && (
        <>
          <Text dimColor>•</Text>
          <Text color="magenta">{usage.reasoning_tokens} reasoning</Text>
        </>
      )}
    </Box>
  );
};