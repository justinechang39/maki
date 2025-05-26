import { DynamicTool } from "langchain/tools";
import { toolImplementations, tools } from '../tools/index.js';
import type { DisplayMessage } from './types.js';

export const createLangChainTools = (
  setMessages: Function,
  formatToolResult: Function
) => {
  return tools.map(tool => new DynamicTool({
    name: tool.function.name,
    description: tool.function.description,
    func: async (input: string) => {
      let args: any;
      try {
        args = typeof input === 'string' ? JSON.parse(input) : input;
      } catch {
        args = input;
      }

      // Show executing state in UI (keep real-time feedback)
      const toolId = `tool-${Date.now()}-${Math.random()}`;
      setMessages((prev: DisplayMessage[]) => [...prev, {
        role: 'assistant',
        content: tool.function.name === 'think' ? args.thoughts : tool.function.name,
        isToolExecution: true,
        toolName: tool.function.name,
        isProcessing: true,
        id: toolId
      } as DisplayMessage]);

      try {
        // Execute original tool implementation
        const result = await toolImplementations[tool.function.name](args);
        
        // Update UI with formatted result (keep custom formatting)
        setMessages((prev: DisplayMessage[]) => prev.map(msg => 
          msg.id === toolId ? {
            role: 'assistant',
            content: tool.function.name === 'think' ? args.thoughts : formatToolResult(tool.function.name, args, result),
            isProcessing: false,
            isToolResult: tool.function.name !== 'think',
            isThinking: tool.function.name === 'think',
            id: toolId
          } as DisplayMessage : msg
        ));

        return JSON.stringify(result);
      } catch (error: any) {
        // Update UI with error (keep error formatting)
        setMessages((prev: DisplayMessage[]) => prev.map(msg => 
          msg.id === toolId ? {
            role: 'assistant',
            content: `❌ ${tool.function.name} failed: ${error.message}`,
            isProcessing: false,
            isToolResult: true,
            id: toolId
          } as DisplayMessage : msg
        ));
        throw error;
      }
    }
  }));
};