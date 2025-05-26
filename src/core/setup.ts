#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { CONFIG_DIRECTORY, DATABASE_PATH } from './config.js';

export async function setupDatabase() {
  // Ensure config directory exists
  if (!fs.existsSync(CONFIG_DIRECTORY)) {
    fs.mkdirSync(CONFIG_DIRECTORY, { recursive: true });
  }

  // Check if database already exists
  if (fs.existsSync(DATABASE_PATH)) {
    console.log('Database already exists at:', DATABASE_PATH);
    return;
  }

  console.log('Setting up database at:', DATABASE_PATH);

  // Set the DATABASE_URL environment variable for Prisma
  process.env.DATABASE_URL = `file:${DATABASE_PATH}`;

  try {
    // Run Prisma migrations to create the database
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    const projectRoot = path.resolve(__dirname, '../..');

    console.log('Running Prisma migrations...');
    execSync('npx prisma migrate deploy', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: `file:${DATABASE_PATH}` }
    });

    console.log('Database setup complete!');
  } catch (error) {
    console.error('Failed to setup database:', error);
    throw error;
  }
}

// Run setup if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase().catch(console.error);
}
