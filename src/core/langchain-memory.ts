import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Message } from './types.js';

export const createMemoryFromHistory = (conversationHistory: Message[]) => {
  return conversationHistory.map(msg => {
    switch (msg.role) {
      case 'user':
        return new HumanMessage(msg.content || '');
      case 'assistant':
        return new AIMessage(msg.content || '');
      case 'system':
        return new SystemMessage(msg.content || '');
      default:
        return new AIMessage(msg.content || '');
    }
  });
};