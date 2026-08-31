import { Db, MongoClient, type Document } from "mongodb";

let client: MongoClient | null = null;
let database: Db | null = null;

export interface MemoryDocument extends Document {
  userId: string;
  key: string;
  value: string;
  source?: string | null;
  confidence?: number;
  updatedAt: Date;
}
export interface ConversationDocument extends Document {
  userId: string;
  platform: string;
  threadId: string | null;
  role: string;
  content: string;
  createdAt: Date;
}
export interface ScheduledTaskDocument extends Document {
  userId: string;
  label: string;
  prompt: string;
  schedule: string;
  recurring: boolean;
  mode: "message" | "agent";
  platform: string;
  channelId: string;
  active: boolean;
  lastFiredAt: Date | null;
  createdAt: Date;
}
export interface EventDocument extends Document {
  userId: string;
  type: string;
  payload: string | null;
  createdAt: Date;
}
export interface AgentSessionDocument extends Document {
  userId: string;
  platform: string;
  threadId: string | null;
  sessionId: string;
  updatedAt: Date;
}

function getDatabase(): Db {
  if (!database)
    throw new Error(
      "MongoDB is not initialized. Call initDatabase() before accessing data.",
    );
  return database;
}

export const collections = {
  memories: () => getDatabase().collection<MemoryDocument>("memories"),
  conversations: () =>
    getDatabase().collection<ConversationDocument>("conversations"),
  scheduledTasks: () =>
    getDatabase().collection<ScheduledTaskDocument>("scheduled_tasks"),
  events: () => getDatabase().collection<EventDocument>("events"),
  agentSessions: () =>
    getDatabase().collection<AgentSessionDocument>("agent_sessions"),
};

/** Connects to MongoDB Atlas and creates the indexes used by the application. */
export async function initDatabase(): Promise<void> {
  if (database) return;
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri)
    throw new Error(
      "MONGODB_URI is required. Add your MongoDB Atlas connection string to .env.",
    );

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(process.env.MONGODB_DB?.trim() || "companio");
  await Promise.all([
    collections.memories().createIndex({ userId: 1, key: 1 }, { unique: true }),
    collections.memories().createIndex({ userId: 1, updatedAt: -1 }),
    collections
      .conversations()
      .createIndex({ userId: 1, platform: 1, threadId: 1, createdAt: -1 }),
    collections.scheduledTasks().createIndex({ active: 1 }),
    collections
      .scheduledTasks()
      .createIndex({ userId: 1, active: 1, createdAt: 1 }),
    collections.events().createIndex({ createdAt: -1 }),
    collections
      .agentSessions()
      .createIndex({ userId: 1, platform: 1, threadId: 1 }, { unique: true }),
  ]);
}

export async function closeDatabase(): Promise<void> {
  await client?.close();
  client = null;
  database = null;
}
