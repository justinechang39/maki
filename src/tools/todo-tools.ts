import * as fs from 'fs/promises';
import { WORKSPACE_DIRECTORY_NAME } from '../core/config.js';
import { getSafeWorkspacePath } from '../core/utils.js';
import type { Tool } from '../core/types.js';

export const todoTools: Tool[] = [
  {
    type: 'function',
    function: {
      name: 'readTodo',
      description: `TASK TRACKING: View current todo list and task status. Essential for understanding what work needs to be done, checking progress, and planning next steps. Shows all tasks with their current status markers.`,
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'writeTodo',
      description: `TASK MANAGEMENT: Create or completely rewrite the todo list. Use for initial task planning, major reorganization, or starting fresh. WARNING: This replaces the entire todo.md file. Use updateTodoItem for individual changes.`,
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: "Complete todo list content in Markdown format. Use '- [ ]' for pending, '- [x]' for completed, '- [/]' for in-progress tasks." }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateTodoItem',
      description: `PROGRESS TRACKING: Update individual task status or description. Use this to mark tasks as completed, in-progress, or modify task descriptions. More precise than rewriting entire todo list.`,
      parameters: {
        type: 'object',
        properties: {
          itemIndex: { type: 'number', description: 'Line number (1-based) of the task to update. Use readTodo first to see current line numbers.' },
          newStatus: {
            type: 'string',
            description: 'Task status: "pending" ([ ]), "in_progress" ([/]), "completed" ([x]), "cancelled" ([~])',
            enum: ['pending', 'in_progress', 'completed', 'cancelled']
          },
          newText: { type: 'string', description: 'Optional: Update task description. Leave blank to keep current text and only change status.' }
        },
        required: ['itemIndex', 'newStatus']
      }
    }
  }
];

export const todoToolImplementations: Record<string, (args: any) => Promise<any>> = {
  readTodo: async () => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      try {
        await fs.access(todoPath);
        const content = await fs.readFile(todoPath, 'utf-8');
        return { success: true, content, exists: true };
      } catch {
        return { success: true, content: '', exists: false, message: "No 'todo.md' found. Use writeTodo to create one." };
      }
    } catch (error: any) {
      return { error: error.message };
    }
  },

  writeTodo: async (args: { content: string }) => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      await fs.writeFile(todoPath, args.content, 'utf-8');
      return { success: true, message: "'todo.md' created/updated." };
    } catch (error: any) {
      return { error: error.message };
    }
  },

  updateTodoItem: async (args: { itemIndex: number; newStatus: string; newText?: string }) => {
    try {
      const todoPath = getSafeWorkspacePath('todo.md');
      let content;
      try {
        content = await fs.readFile(todoPath, 'utf-8');
      } catch {
        return { error: "'todo.md' not found. Use writeTodo first." };
      }

      const lines = content.split('\n');
      if (args.itemIndex < 1 || args.itemIndex > lines.length) {
        return { error: `Invalid itemIndex. 'todo.md' has ${lines.length} lines.` };
      }

      const lineIndex = args.itemIndex - 1;
      const currentLine = lines[lineIndex];

      const statusMarkers: Record<string, string> = {
        pending: '[ ]', in_progress: '[/]', completed: '[x]', cancelled: '[~]'
      };
      const marker = statusMarkers[args.newStatus as keyof typeof statusMarkers];
      if (!marker) return { error: `Invalid newStatus: ${args.newStatus}` };

      const textContent = args.newText !== undefined
        ? args.newText
        : currentLine.replace(/^\s*-\s*\[[ x/~]\]\s*/, '').trim();

      lines[lineIndex] = `- ${marker} ${textContent}`;
      await fs.writeFile(todoPath, lines.join('\n'), 'utf-8');
      return { success: true, message: `Todo item ${args.itemIndex} updated.`, updatedLine: lines[lineIndex] };
    } catch (error: any) {
      return { error: error.message };
    }
  }
};