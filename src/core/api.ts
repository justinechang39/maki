import { OPENROUTER_API_KEY, API_URL, MODEL_ID } from './config.js';
import type { Message, Tool } from './types.js';

export async function callOpenRouterAPI(
  messages: Message[],
  tools: Tool[]
): Promise<any> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_ID,
      messages,
      tools,
      tool_choice: 'auto',
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}