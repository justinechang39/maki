import React, { useState, useRef, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

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
  const [input, setInput] = useState('');
  const cursorRef = useRef(0);

  // Reset input when key changes
  useEffect(() => {
    setInput('');
    cursorRef.current = 0;
  }, [inputKey]);

  useInput((inputChar, key) => {
    if (isProcessing) return;

    if (key.return) {
      if (input.trim()) {
        onSubmit(input);
        onInputKeyChange();
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (input.length > 0) {
        setInput(prev => prev.slice(0, -1));
      }
      return;
    }

    if (inputChar && !key.ctrl && !key.meta) {
      setInput(prev => prev + inputChar);
    }
  });

  const placeholder = isProcessing ? "processing..." : "ask me anything...";
  const displayText = input || placeholder;
  const showCursor = !isProcessing;
  const isPlaceholderShown = !input;

  return (
    <Box paddingY={1}>
      <Box flexDirection="row" alignItems="center">
        <Box borderStyle="single" borderColor={isProcessing ? 'yellow' : 'blue'} paddingX={1} flexGrow={1}>
          <Text>
            <Text color={isPlaceholderShown ? 'gray' : undefined}>
              {displayText}
            </Text>
            {showCursor && <Text color="cyan">▌</Text>}
          </Text>
        </Box>
        <Box marginLeft={1}>
          <Text dimColor>⏎ send • ^C exit</Text>
        </Box>
      </Box>
    </Box>
  );
});

InputArea.displayName = 'InputArea';