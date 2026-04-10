import { Cron } from "croner";
import { getActiveTasks, deactivateTask, touchFiredAt, type ScheduledTask } from "./index.ts";
import { respond } from "../router/respond.ts";
import { db } from "../db/schema.ts";

// Tracks live croner jobs by task ID so we can stop them on delete
const activeJobs = new Map<number, Cron>();

function isIsoDatetime(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(s);
}

async function fireTask(task: ScheduledTask): Promise<void> {
  try {
    if (task.mode === "agent") {
      // Dynamic import breaks the circular dep with companion.ts
      const { runCompanion } = await import("../agent/companion.ts");
      const result = await runCompanion({
        trigger: "cron",
        userId: task.userId,
        channelId: task.channelId,
        platform: task.platform,
        message: task.prompt,
        threadId: task.channelId,
      });
      await respond(task.platform, task.channelId, result);
    } else {
      await respond(task.platform, task.channelId, task.prompt);
    }

    touchFiredAt(task.id);
    db.run(
      `INSERT INTO events (userId, type, payload) VALUES (?, 'task_fired', ?)`,
      [task.userId, JSON.stringify({ taskId: task.id, label: task.label })]
    );
  } catch (err) {
    console.error(`Failed to fire task ${task.id} (${task.label}):`, err);
    db.run(
      `INSERT INTO events (userId, type, payload) VALUES (?, 'error', ?)`,
      [task.userId, JSON.stringify({ error: String(err), taskId: task.id })]
    );
  } finally {
    if (!task.recurring) {
      deactivateTask(task.id);
      activeJobs.delete(task.id);
    }
  }
}

export function registerTask(task: ScheduledTask): void {
  // Stop any existing job for this task first
  unregisterTask(task.id);

  const schedule: string | Date = isIsoDatetime(task.schedule)
    ? new Date(task.schedule)
    : task.schedule;

  const job = new Cron(schedule, () => {
    fireTask(task).catch((err) => console.error("fireTask uncaught:", err));
  });

  activeJobs.set(task.id, job);
  console.log(`  ↳ task ${task.id} "${task.label}" scheduled: ${task.schedule}`);
}

export function unregisterTask(id: number): void {
  const job = activeJobs.get(id);
  if (job) {
    job.stop();
    activeJobs.delete(id);
  }
}

/**
 * Get list of all active cron jobs currently running in memory.
 * Includes next fire time if available.
 */
export function getActiveJobs(): Array<{ id: number; nextFireTime: Date | null }> {
  const jobs: Array<{ id: number; nextFireTime: Date | null }> = [];
  for (const [id, job] of activeJobs) {
    jobs.push({
      id,
      nextFireTime: job.nextRun(),
    });
  }
  return jobs;
}

export function startScheduler(): void {
  const tasks = getActiveTasks();
  console.log(`⏰ Scheduler: loading ${tasks.length} task(s) from DB`);
  for (const task of tasks) {
    registerTask(task);
  }
}
