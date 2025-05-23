import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

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
    const thread = await prisma.thread.create({
      data: {
        title,
      },
    })
    return thread.id
  }

  static async getAllThreads(): Promise<Array<{ id: string; title?: string; createdAt: Date; messageCount: number }>> {
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
    await prisma.message.create({
      data: {
        threadId,
        role,
        content,
        toolCalls: toolCalls ? JSON.stringify(toolCalls) : undefined,
        toolResponses: toolResponses ? JSON.stringify(toolResponses) : undefined,
      },
    })

    // Update thread's updatedAt timestamp
    await prisma.thread.update({
      where: { id: threadId },
      data: { updatedAt: new Date() }
    })
  }

  static async updateThreadTitle(threadId: string, title: string): Promise<void> {
    await prisma.thread.update({
      where: { id: threadId },
      data: { title }
    })
  }

  static async deleteThread(threadId: string): Promise<void> {
    console.log('🗑️ Attempting to delete thread with ID:', threadId)
    
    try {
      const result = await prisma.thread.delete({
        where: { id: threadId }
      })
      
      console.log('✅ Thread deleted successfully:', result.id)
    } catch (error: any) {
      // If the thread doesn't exist, that's fine - it's already deleted
      if (error.code === 'P2025') {
        console.log('⚠️ Thread was already deleted or does not exist')
        return
      }
      
      // Re-throw other errors
      throw error
    }
  }

  static async disconnect(): Promise<void> {
    await prisma.$disconnect()
  }
}