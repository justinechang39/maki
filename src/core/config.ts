import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file for local development
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Available models for user selection
export const AVAILABLE_MODELS = [
  'meta-llama/llama-4-scout',
  'meta-llama/llama-4-maverick:free',
  'nousresearch/deephermes-3-mistral-24b-preview:free',
  'anthropic/claude-3.7-sonnet',
] as const;

export type ModelId = (typeof AVAILABLE_MODELS)[number];

// Selected model (will be set during app initialization)
export let SELECTED_MODEL: ModelId = AVAILABLE_MODELS[0];

export function setSelectedModel(model: ModelId) {
  SELECTED_MODEL = model;
}

// Database path based on environment
const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.npm_lifecycle_event === 'dev';
export const CONFIG_DIRECTORY = isDev
  ? path.join(path.dirname(__dirname), '..', 'data') // Store in repo/data during development
  : path.join(os.homedir(), '.config', 'maki'); // System config in production
export const DATABASE_PATH = path.join(CONFIG_DIRECTORY, 'database.sqlite');
export const WORKSPACE_DIRECTORY = process.cwd(); // Current working directory
export const WORKSPACE_DIRECTORY_NAME = 'workspace'; // For descriptions only
export const MAX_CONVERSATION_LENGTH = 100;
