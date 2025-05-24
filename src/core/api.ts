import { OPENROUTER_API_KEY, API_URL, MODEL_ID } from './config.js';
import type { Message, Tool } from './types.js';

export async function callOpenRouterAPI(
  messages: Message[],
  tools: Tool[]
): Promise<any> {
  // Create an AbortController for timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

  try {
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
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage: string;
      
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorData.message || `${response.status} ${response.statusText}`;
      } catch {
        errorMessage = `${response.status} ${response.statusText}`;
      }

      // Handle specific error types
      if (response.status === 429) {
        throw new Error(`Rate limit exceeded. Please wait a moment before trying again.`);
      } else if (response.status === 401) {
        throw new Error(`Invalid API key. Please check your OPENROUTER_API_KEY.`);
      } else if (response.status === 403) {
        throw new Error(`Access forbidden. Your API key may not have permission for this model.`);
      } else if (response.status >= 500) {
        throw new Error(`OpenRouter server error (${response.status}). Please try again later.`);
      } else {
        throw new Error(`OpenRouter API error: ${errorMessage}`);
      }
    }

    const data = await response.json();
    
    // Validate response structure
    if (!data || !data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('OpenRouter returned an empty or invalid response. Please try again.');
    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The AI model is taking too long to respond. Please try again.');
    }
    
    if (error.message.includes('fetch')) {
      throw new Error('Network error. Please check your internet connection and try again.');
    }
    
    throw error; // Re-throw other errors as-is
  }
}