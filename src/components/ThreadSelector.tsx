import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ThreadListItem {
  id: string;
  title?: string;
  createdAt: Date;
  messageCount: number;
}

interface ThreadSelectorProps {
  threads: ThreadListItem[];
  selectedIndex: number;
  onSelect: (threadId: string | 'new') => void;
}

export const ThreadSelector: React.FC<ThreadSelectorProps> = ({ threads, selectedIndex, onSelect }) => {
  const items = [
    { name: 'Start a new thread', value: 'new', isNew: true } as const,
    ...threads.map(thread => ({
      name: `${thread.title || 'Untitled'}`,
      value: thread.id,
      subtitle: `${thread.messageCount} messages • ${thread.createdAt.toLocaleDateString()}`,
      isNew: false
    } as const))
  ];

  useInput((input, key) => {
    if (key.return) {
      onSelect(items[selectedIndex].value);
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box paddingBottom={1}>
        <Text bold color="cyan">▌threads</Text>
      </Box>
      
      <Box flexDirection="column">
        {items.map((item, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? 'blue' : 'white'} 
                  backgroundColor={index === selectedIndex ? 'blue' : undefined}
                  inverse={index === selectedIndex}>
              {index === selectedIndex ? '▶' : ' '} {item.isNew ? '+' : '•'} {item.name}
            </Text>
            {!item.isNew && 'subtitle' in item && item.subtitle && (
              <Box paddingLeft={2}>
                <Text dimColor>{item.subtitle}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>
      
      <Box paddingTop={1}>
        <Text dimColor>↑↓ • ⏎ • ^C</Text>
      </Box>
    </Box>
  );
};