import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from '@inkjs/ui';

interface DownloadProgressProps {
  url: string;
  filename: string;
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed?: number;
}

export function DownloadProgress({ 
  url, 
  filename, 
  progress, 
  downloadedSize, 
  totalSize,
  speed 
}: DownloadProgressProps) {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  return (
    <Box flexDirection="column" marginY={1}>
      <Text>
        Downloading: <Text bold color="blue">{filename}</Text>
      </Text>
      
      <Box marginY={1}>
        <Box width={50}>
          <ProgressBar value={progress} />
        </Box>
        <Text> {progress.toFixed(1)}%</Text>
      </Box>
      
      <Box justifyContent="space-between">
        <Text>
          {formatBytes(downloadedSize)} / {totalSize > 0 ? formatBytes(totalSize) : 'Unknown'}
        </Text>
        {speed && speed > 0 && (
          <Text color="gray">
            {formatSpeed(speed)}
          </Text>
        )}
      </Box>
      
      <Text color="gray" dimColor>
        {url}
      </Text>
    </Box>
  );
}