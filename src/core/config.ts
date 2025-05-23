import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import dotenv from 'dotenv';

// Load .env file for local development
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODEL_ID = 'openai/gpt-4.1';

// Use system config directory for database and workspace operates in current directory
export const CONFIG_DIRECTORY = path.join(os.homedir(), '.config', 'openrouter-agent');
export const DATABASE_PATH = path.join(CONFIG_DIRECTORY, 'database.sqlite');
export const WORKSPACE_DIRECTORY = process.cwd(); // Current working directory
export const WORKSPACE_DIRECTORY_NAME = 'workspace'; // For descriptions only
export const MAX_CONVERSATION_LENGTH = 100;