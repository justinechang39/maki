import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ThreadListItem {
  id: string;
  title?: string;
  createdAt: Date;
  messageCount: number;
}

interface ThreadManagerProps {
  thread: ThreadListItem;
  selectedIndex: number;
  onContinue: () => void;
  onDelete: () => void;
  onBack: () => void;
  isDeleting?: boolean;
}

export const ThreadManager: React.FC<ThreadManagerProps> = ({ 
  thread, 
  selectedIndex, 
  onContinue, 
  onDelete, 
  onBack, 
  isDeleting = false 
}) => {
  const options = [
    { name: 'Continue conversation', icon: '▶️', action: onContinue, color: 'green' },
    { name: 'Delete thread', icon: '🗑️', action: onDelete, color: 'red' },
    { name: 'Back to list', icon: '⬅️', action: onBack, color: 'gray' }
  ];

  useInput((input, key) => {
    if (key.return && !isDeleting) {
      options[selectedIndex].action();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box paddingBottom={1}>
        <Text bold color="yellow">▌{thread.title || 'untitled'}</Text>
        <Text dimColor>{thread.messageCount} msgs • {thread.createdAt.toLocaleDateString()}</Text>
      </Box>
      
      <Box flexDirection="column">
        {options.map((option, index) => (
          <Box key={index}>
            <Text color={index === selectedIndex ? option.color : 'white'} 
                  backgroundColor={index === selectedIndex ? option.color : undefined}
                  inverse={index === selectedIndex}>
              {index === selectedIndex ? '▶' : ' '} {option.icon} {option.name}
              {index === 1 && isDeleting ? ' ⏳' : ''}
            </Text>
          </Box>
        ))}
      </Box>
      
      <Box paddingTop={1}>
        <Text dimColor>↑↓ • ⏎ • ^C</Text>
      </Box>
    </Box>
  );
};