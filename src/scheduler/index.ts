import { ObjectId } from "mongodb";
import { collections, type ScheduledTaskDocument } from "../db/schema.ts";

export interface ScheduledTask { id: string; userId: string; label: string; prompt: string; schedule: string; recurring: boolean; mode: "message" | "agent"; platform: string; channelId: string; active: boolean; lastFiredAt: string | null; createdAt: string; }
function serializeTask(task: ScheduledTaskDocument): ScheduledTask { return { id: task._id.toHexString(), userId: task.userId, label: task.label, prompt: task.prompt, schedule: task.schedule, recurring: task.recurring, mode: task.mode, platform: task.platform, channelId: task.channelId, active: task.active, lastFiredAt: task.lastFiredAt?.toISOString() ?? null, createdAt: task.createdAt.toISOString() }; }
function objectId(id: string): ObjectId | null { return ObjectId.isValid(id) ? new ObjectId(id) : null; }
export async function createTask(userId: string, label: string, prompt: string, schedule: string, recurring: boolean, mode: "message" | "agent", platform: string, channelId: string): Promise<ScheduledTask> { const task = { userId, label, prompt, schedule, recurring, mode, platform, channelId, active: true, lastFiredAt: null, createdAt: new Date() }; const result = await collections.scheduledTasks().insertOne(task); return serializeTask({ ...task, _id: result.insertedId }); }
export async function getTask(id: string): Promise<ScheduledTask | null> { const _id = objectId(id); const task = _id ? await collections.scheduledTasks().findOne({ _id }) : null; return task ? serializeTask(task) : null; }
export async function getActiveTasks(): Promise<ScheduledTask[]> { return (await collections.scheduledTasks().find({ active: true }).toArray()).map(serializeTask); }
export async function listTasks(userId: string): Promise<ScheduledTask[]> { return (await collections.scheduledTasks().find({ userId, active: true }).sort({ createdAt: 1 }).toArray()).map(serializeTask); }
export async function deactivateTask(id: string): Promise<void> { const _id = objectId(id); if (_id) await collections.scheduledTasks().updateOne({ _id }, { $set: { active: false } }); }
export async function deleteTask(id: string): Promise<void> { const _id = objectId(id); if (_id) await collections.scheduledTasks().deleteOne({ _id }); }
export async function touchFiredAt(id: string): Promise<void> { const _id = objectId(id); if (_id) await collections.scheduledTasks().updateOne({ _id }, { $set: { lastFiredAt: new Date() } }); }
