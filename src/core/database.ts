import { PrismaClient } from '@prisma/client'
import { CONFIG_DIRECTORY, DATABASE_PATH } from './config.js'
import fs from 'fs'

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIRECTORY)) {
  fs.mkdirSync(CONFIG_DIRECTORY, { recursive: true })
}

// Set DATABASE_URL for Prisma
process.env.DATABASE_URL = `file:${DATABASE_PATH}`;

export const prisma = new PrismaClient()

// Track if database is initialized
let databaseInitialized = false

// Initialize database schema if it doesn't exist
async function initializeDatabase() {
  if (databaseInitialized) return
  
  try {
    // Try to create tables first
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "threads" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "threadId" TEXT NOT NULL,
        "role" TEXT NOT NULL CHECK ("role" IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
        "content" TEXT NOT NULL,
        "toolCalls" TEXT,
        "toolResponses" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("threadId") REFERENCES "threads" ("id") ON DELETE CASCADE
      );
    `)
    
    databaseInitialized = true
    console.log('Database initialized successfully!')
  } catch (error: any) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}

// Simple ID generation function
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

export interface StoredMessage {
  id: string
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL'
  content: string
  toolCalls?: any[]
  toolResponses?: any[]
  createdAt: Date
}

export interface StoredThread {
  id: string
  title?: string
  createdAt: Date
  updatedAt: Date
  messages: StoredMessage[]
}

export class ThreadDatabase {
  static async createThread(title?: string): Promise<string> {
    await initializeDatabase()
    const id = generateId()
    await prisma.$executeRawUnsafe(`
      INSERT INTO threads (id, title, createdAt, updatedAt) 
      VALUES (?, ?, datetime('now'), datetime('now'))
    `, id, title || null)
    return id
  }

  static async getAllThreads(): Promise<Array<{ id: string; title?: string; createdAt: Date; messageCount: number }>> {
    await initializeDatabase()
    const threads = await prisma.thread.findMany({
      include: {
        _count: {
          select: { messages: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
    
    console.log('📋 Raw threads from database:', threads.map(t => ({ id: t.id, title: t.title })))
    
    const result = threads.map((thread: any) => ({
      id: thread.id,
      title: thread.title || undefined,
      createdAt: thread.createdAt,
      messageCount: thread._count.messages
    }))
    
    console.log('📋 Processed threads for UI:', result.map(t => ({ id: t.id, title: t.title })))
    
    return result
  }

  static async getThread(threadId: string): Promise<StoredThread | null> {
    await initializeDatabase()
    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!thread) return null

    return {
      id: thread.id,
      title: thread.title || undefined,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      messages: thread.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role as any,
        content: msg.content,
        toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls as string) : undefined,
        toolResponses: msg.toolResponses ? JSON.parse(msg.toolResponses as string) : undefined,
        createdAt: msg.createdAt
      }))
    }
  }

  static async addMessage(
    threadId: string,
    role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL',
    content: string,
    toolCalls?: any[],
    toolResponses?: any[]
  ): Promise<void> {
    await initializeDatabase()
    const id = generateId()
    await prisma.$executeRawUnsafe(`
      INSERT INTO messages (id, threadId, role, content, toolCalls, toolResponses, createdAt) 
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, id, threadId, role, content, 
       toolCalls ? JSON.stringify(toolCalls) : null,
       toolResponses ? JSON.stringify(toolResponses) : null)

    // Update thread's updatedAt timestamp
    await prisma.$executeRawUnsafe(`
      UPDATE threads SET updatedAt = datetime('now') WHERE id = ?
    `, threadId)
  }

  static async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await initializeDatabase()
    await prisma.$executeRawUnsafe(`
      UPDATE threads SET title = ?, updatedAt = datetime('now') WHERE id = ?
    `, title, threadId)
  }

  static async deleteThread(threadId: string): Promise<void> {
    await initializeDatabase()
    console.log('🗑️ Attempting to delete thread with ID:', threadId)
    
    try {
      // Delete messages first (foreign key constraint)
      await prisma.$executeRawUnsafe(`DELETE FROM messages WHERE threadId = ?`, threadId)
      
      // Delete thread
      const result = await prisma.$executeRawUnsafe(`DELETE FROM threads WHERE id = ?`, threadId)
      
      console.log('✅ Thread deleted successfully')
    } catch (error: any) {
      console.error('❌ Failed to delete thread:', error)
      throw error
    }
  }

  static async disconnect(): Promise<void> {
    await prisma.$disconnect()
  }
}