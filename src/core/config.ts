import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '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';
export const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODEL_ID = 'openai/gpt-4.1-mini';

export const WORKSPACE_DIRECTORY_NAME = 'file_assistant_workspace';
export const WORKSPACE_DIRECTORY = path.resolve(__dirname, '../../', WORKSPACE_DIRECTORY_NAME);
export const MAX_CONVERSATION_LENGTH = 100;