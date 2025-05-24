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

// Initialize database schema automatically
async function initializeDatabase() {
  if (databaseInitialized) return
  
  try {
    // Enable foreign key constraints
    await prisma.$executeRaw`PRAGMA foreign_keys = ON;`
    
    // Try to query existing tables to see if schema exists
    try {
      await prisma.thread.findFirst()
      databaseInitialized = true
      console.log('Database connection established!')
      return
    } catch (schemaError: any) {
      // Schema doesn't exist, apply it using the bundled migration
      console.log('Setting up database schema...')
      await applyMigration()
      
      // Verify the schema was created successfully
      try {
        // Small delay to ensure schema is fully applied
        await new Promise(resolve => setTimeout(resolve, 100))
        await prisma.thread.findFirst()
        databaseInitialized = true
        console.log('Database initialized successfully!')
      } catch (verifyError: any) {
        console.error('Schema creation failed verification:', verifyError)
        // Try one more time with a direct table check
        try {
          await prisma.$queryRaw`SELECT name FROM sqlite_master WHERE type='table' AND name='threads'`
          console.log('Tables exist but Prisma client needs regeneration')
          databaseInitialized = true
          console.log('Database initialized successfully!')
        } catch (fallbackError: any) {
          console.error('Fallback verification also failed:', fallbackError)
          throw new Error('Database schema creation failed')
        }
      }
    }
  } catch (error: any) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}

// Apply the database migration (this is the same SQL that Prisma would generate)
// This is a one-time bootstrap, after which we use pure Prisma methods
async function applyMigration() {
  try {
    console.log('Creating threads table...')
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "threads" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "title" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    console.log('Creating messages table...')
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "messages" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "threadId" TEXT NOT NULL,
        "role" TEXT NOT NULL CHECK ("role" IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
        "content" TEXT NOT NULL,
        "toolCalls" TEXT,
        "toolResponses" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "threads" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `)
    
    console.log('Creating indexes...')
    await prisma.$executeRawUnsafe(`CREATE INDEX "messages_threadId_idx" ON "messages"("threadId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX "threads_updatedAt_idx" ON "threads"("updatedAt")`)
    
    console.log('Schema creation completed, refreshing Prisma client...')
    
    // Force Prisma to refresh its schema understanding
    await prisma.$disconnect()
    await prisma.$connect()
    
    console.log('Prisma client refreshed')
  } catch (error: any) {
    console.error('Error during schema creation:', error)
    throw error
  }
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
    const thread = await prisma.thread.create({
      data: {
        title: title || undefined
      }
    })
    return thread.id
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
    
    // console.log(`Found ${threads.length} threads in database:`, threads.map(t => ({ id: t.id, title: t.title })))
    
    return threads.map(thread => ({
      id: thread.id,
      title: thread.title || undefined,
      createdAt: thread.createdAt,
      messageCount: thread._count.messages
    }))
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
      messages: thread.messages.map(msg => ({
        id: msg.id,
        role: msg.role as any,
        content: msg.content,
        toolCalls: msg.toolCalls ? (msg.toolCalls as any[]) : undefined,
        toolResponses: msg.toolResponses ? (msg.toolResponses as any[]) : undefined,
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
    
    await prisma.message.create({
      data: {
        threadId,
        role,
        content,
        toolCalls: toolCalls || undefined,
        toolResponses: toolResponses || undefined
      }
    })

    // Update thread's updatedAt timestamp
    await prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() }
    })
  }

  static async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await initializeDatabase()
    await prisma.thread.update({
      where: { id: threadId },
      data: { 
        title,
        updatedAt: new Date()
      }
    })
  }

  static async deleteThread(threadId: string): Promise<void> {
    await initializeDatabase()
    
    try {
      // First check if the thread exists
      const existingThread = await prisma.thread.findUnique({
        where: { id: threadId }
      })
      
      if (!existingThread) {
        console.log(`Thread ${threadId} not found, skipping deletion`)
        return // Thread doesn't exist, nothing to delete
      }
      
      // Prisma will handle cascade deletion due to the schema
      await prisma.thread.delete({
        where: { id: threadId }
      })
    } catch (error: any) {
      console.error('❌ Failed to delete thread:', error)
      // If it's a "record not found" error, don't throw - thread is already gone
      if (error.code === 'P2025') {
        console.log('Thread was already deleted, continuing...')
        return
      }
      throw error
    }
  }

  static async disconnect(): Promise<void> {
    await prisma.$disconnect()
  }
}