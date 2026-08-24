/**
 * Development seed data. Idempotent: re-running replaces the seeded user's
 * workspace contents rather than piling up duplicates.
 *
 *   npm run seed
 */
import "dotenv/config";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { fromZonedTime } from "date-fns-tz";

loadEnv({ path: ".env.local", override: true });

import { User, defaultNotificationPrefs } from "../src/models/User";
import { Workspace, WorkspaceMember } from "../src/models/Workspace";
import { Project } from "../src/models/Project";
import { Tag } from "../src/models/Tag";
import { Task, TaskOccurrence } from "../src/models/Task";
import { Comment, Activity, Notification } from "../src/models/Social";
import { syncAllIndexes } from "./indexes";

const TZ = "Asia/Kolkata";
const PASSWORD = "flowdeck123";

/** Wall-clock helper: "day offset from today" + "HH:mm" in the seed timezone. */
function at(dayOffset: number, time: string): Date {
  const base = new Date();
  base.setUTCHours(12, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const date = base.toISOString().slice(0, 10);
  return fromZonedTime(`${date}T${time}:00`, TZ);
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (copy .env.example to .env.local)");
  await mongoose.connect(uri);
  console.log(`connected to ${uri}`);

  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const people = [
    { name: "Yash", username: "yash", email: "yash@bassforecast.com", bio: "Building Flowdeck and BassForecast." },
    { name: "Alex Rivera", username: "alex", email: "alex@example.com", bio: "Frontend. Design systems." },
    { name: "Rahul Menon", username: "rahul", email: "rahul@example.com", bio: "Backend and infrastructure." },
  ];

  const users = [];
  for (const person of people) {
    const user = await User.findOneAndUpdate(
      { email: person.email },
      {
        $set: {
          ...person,
          passwordHash,
          timezone: TZ,
          notificationPrefs: defaultNotificationPrefs(),
          lastSeenAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    users.push(user);
  }
  const [yash, alex, rahul] = users;
  if (!yash || !alex || !rahul) throw new Error("seed users could not be created");

  const workspace = await Workspace.findOneAndUpdate(
    { slug: "flowdeck-demo" },
    { $set: { name: "Flowdeck HQ", slug: "flowdeck-demo", ownerId: yash._id, color: "#6366f1" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Wipe previously seeded content so the dataset stays predictable.
  await Promise.all([
    Task.deleteMany({ workspaceId: workspace._id }),
    Project.deleteMany({ workspaceId: workspace._id }),
    Tag.deleteMany({ workspaceId: workspace._id }),
    Comment.deleteMany({ workspaceId: workspace._id }),
    Activity.deleteMany({ workspaceId: workspace._id }),
    Notification.deleteMany({ workspaceId: workspace._id }),
    TaskOccurrence.deleteMany({ workspaceId: workspace._id }),
  ]);

  for (const [index, user] of users.entries()) {
    await WorkspaceMember.findOneAndUpdate(
      { workspaceId: workspace._id, userId: user._id },
      { $set: { role: index === 0 ? "OWNER" : "MEMBER", joinedAt: new Date() } },
      { upsert: true },
    );
  }

  const tagSpecs = [
    { name: "frontend", color: "#0ea5e9" },
    { name: "backend", color: "#10b981" },
    { name: "bug", color: "#ef4444" },
    { name: "content", color: "#a855f7" },
    { name: "marketing", color: "#f59e0b" },
    { name: "personal", color: "#64748b" },
    { name: "urgent", color: "#dc2626" },
  ];
  const tags = new Map<string, Types.ObjectId>();
  for (const spec of tagSpecs) {
    const tag = await Tag.create({ ...spec, workspaceId: workspace._id, createdById: yash._id });
    tags.set(spec.name, tag._id);
  }

  const projectSpecs = [
    {
      key: "flowdeck",
      name: "Flowdeck",
      description: "The calendar-first command centre. Auth, calendar, recurrence, PWA.",
      icon: "Rocket",
      color: "#6366f1",
      status: "ACTIVE" as const,
      startDate: at(-21, "09:00"),
      targetDate: at(30, "18:00"),
      repoUrl: "https://github.com/yash/flowdeck",
      milestones: [
        { title: "Phase 1 — auth & calendar", targetDate: at(-7, "18:00"), completedAt: at(-7, "17:30") },
        { title: "Phase 2 — recurrence & PWA", targetDate: at(6, "18:00") },
        { title: "Public beta", targetDate: at(28, "18:00") },
      ],
    },
    {
      key: "bassforecast",
      name: "BassForecast",
      description: "Forecasting product work: ingestion, model QA, dashboards.",
      icon: "Waves",
      color: "#0ea5e9",
      status: "ACTIVE" as const,
      startDate: at(-40, "09:00"),
      targetDate: at(45, "18:00"),
      milestones: [{ title: "v2 ingestion pipeline", targetDate: at(14, "18:00") }],
    },
    {
      key: "brand",
      name: "Personal Brand",
      description: "Writing, talks and the long-term audience build.",
      icon: "Sparkles",
      color: "#f59e0b",
      status: "ACTIVE" as const,
      milestones: [],
    },
    {
      key: "social",
      name: "Social Media",
      description: "Content pipeline across LinkedIn, YouTube and Instagram.",
      icon: "Megaphone",
      color: "#a855f7",
      status: "ACTIVE" as const,
      isContentProject: true,
      milestones: [],
    },
  ];

  const projects = new Map<string, Types.ObjectId>();
  for (const spec of projectSpecs) {
    const { key, ...rest } = spec;
    const project = await Project.create({
      ...rest,
      workspaceId: workspace._id,
      ownerId: yash._id,
      memberIds: [yash._id, alex._id, rahul._id],
    });
    projects.set(key, project._id);
  }

  const base = {
    workspaceId: workspace._id,
    creatorId: yash._id,
    scheduleTimezone: TZ,
    visibility: "WORKSPACE" as const,
  };

  const tasks = [
    // --- Flowdeck: development work -----------------------------------------
    {
      ...base,
      title: "Build authentication",
      description: "Email/password auth with bcrypt hashing, JWT sessions and protected routes.",
      projectId: projects.get("flowdeck"),
      assigneeId: yash._id,
      status: "DONE" as const,
      priority: "HIGH" as const,
      startAt: at(-6, "10:00"),
      dueAt: at(-6, "13:00"),
      estimatedMinutes: 180,
      actualMinutes: 205,
      completedAt: at(-6, "13:20"),
      tagIds: [tags.get("backend")],
      dev: { branchName: "feat/auth", pullRequestUrl: "https://github.com/yash/flowdeck/pull/12" },
      subtasks: [
        { title: "Create User model", done: true, order: 0 },
        { title: "Create registration API", done: true, order: 1 },
        { title: "Create login API", done: true, order: 2 },
        { title: "Add password hashing", done: true, order: 3 },
        { title: "Add protected routes", done: true, order: 4 },
        { title: "Add tests", done: false, order: 5 },
      ],
    },
    {
      ...base,
      title: "Create MongoDB schemas",
      description: "User, Workspace, Project, Task, TaskOccurrence, Comment, Tag, Activity, Notification.",
      projectId: projects.get("flowdeck"),
      assigneeId: rahul._id,
      status: "DONE" as const,
      priority: "HIGH" as const,
      startAt: at(-5, "09:30"),
      dueAt: at(-5, "12:30"),
      estimatedMinutes: 180,
      actualMinutes: 150,
      completedAt: at(-5, "12:00"),
      tagIds: [tags.get("backend")],
    },
    {
      ...base,
      title: "Design dashboard",
      description: "Daily briefing, today timeline, overdue and inbox panels.",
      projectId: projects.get("flowdeck"),
      assigneeId: alex._id,
      status: "IN_PROGRESS" as const,
      priority: "HIGH" as const,
      startAt: at(0, "10:00"),
      dueAt: at(0, "13:00"),
      estimatedMinutes: 180,
      tagIds: [tags.get("frontend")],
      reminders: [{ minutesBefore: 15 }],
      subtasks: [
        { title: "Briefing header", done: true, order: 0 },
        { title: "Today timeline", done: true, order: 1 },
        { title: "Progress ring", done: false, order: 2 },
      ],
    },
    {
      ...base,
      title: "Fix drag-and-drop snapping on the week grid",
      projectId: projects.get("flowdeck"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "URGENT" as const,
      startAt: at(0, "15:00"),
      dueAt: at(0, "16:00"),
      estimatedMinutes: 60,
      tagIds: [tags.get("bug"), tags.get("urgent")],
      reminders: [{ minutesBefore: 10 }],
    },
    {
      ...base,
      title: "Plan next sprint",
      description: "Scope Phase 3: workspaces, comments, presence.",
      projectId: projects.get("flowdeck"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(2, "16:00"),
      dueAt: at(2, "17:00"),
      estimatedMinutes: 60,
    },
    {
      ...base,
      title: "Write API integration tests",
      projectId: projects.get("flowdeck"),
      assigneeId: rahul._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(-2, "11:00"),
      dueAt: at(-2, "13:00"),
      estimatedMinutes: 120,
      tagIds: [tags.get("backend")],
    },

    // --- BassForecast --------------------------------------------------------
    {
      ...base,
      title: "BassForecast development",
      description: "Ingestion pipeline hardening and model QA hooks.",
      projectId: projects.get("bassforecast"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "HIGH" as const,
      startAt: at(0, "14:00"),
      dueAt: at(0, "16:30"),
      estimatedMinutes: 150,
      tagIds: [tags.get("backend")],
    },
    {
      ...base,
      title: "Ship v2 ingestion pipeline",
      projectId: projects.get("bassforecast"),
      assigneeId: rahul._id,
      status: "TODO" as const,
      priority: "HIGH" as const,
      startAt: at(9, "10:00"),
      dueAt: at(9, "17:00"),
      estimatedMinutes: 420,
    },
    {
      ...base,
      title: "Investigate forecast drift on coastal stations",
      projectId: projects.get("bassforecast"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      // Deliberately overdue so the dashboard's overdue panel has content.
      startAt: at(-3, "09:00"),
      dueAt: at(-3, "11:00"),
      estimatedMinutes: 120,
      tagIds: [tags.get("bug")],
    },

    // --- Content -------------------------------------------------------------
    {
      ...base,
      title: "Write LinkedIn post",
      description: "Thread on building a calendar-first task app.",
      projectId: projects.get("social"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(0, "11:30"),
      dueAt: at(0, "12:15"),
      estimatedMinutes: 45,
      tagIds: [tags.get("content"), tags.get("marketing")],
      isContent: true,
      content: {
        platform: "LINKEDIN" as const,
        contentType: "POST" as const,
        contentStatus: "DRAFT" as const,
        caption: "Why I stopped using a to-do list and started scheduling everything.",
        publishAt: at(0, "19:00"),
      },
    },
    {
      ...base,
      title: "Record YouTube video",
      description: "Walkthrough: recurrence without duplicating rows.",
      projectId: projects.get("social"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(0, "17:00"),
      dueAt: at(0, "18:30"),
      estimatedMinutes: 90,
      tagIds: [tags.get("content")],
      isContent: true,
      content: {
        platform: "YOUTUBE" as const,
        contentType: "VIDEO" as const,
        contentStatus: "IDEA" as const,
        publishAt: at(4, "18:00"),
      },
    },
    {
      ...base,
      title: "Instagram carousel: my weekly planning ritual",
      projectId: projects.get("social"),
      assigneeId: alex._id,
      status: "TODO" as const,
      priority: "LOW" as const,
      startAt: at(3, "12:00"),
      dueAt: at(3, "13:00"),
      estimatedMinutes: 60,
      isContent: true,
      content: {
        platform: "INSTAGRAM" as const,
        contentType: "CAROUSEL" as const,
        contentStatus: "REVIEW" as const,
        publishAt: at(5, "10:00"),
      },
    },
    {
      ...base,
      title: "Publish newsletter issue #14",
      projectId: projects.get("brand"),
      assigneeId: yash._id,
      status: "DONE" as const,
      priority: "MEDIUM" as const,
      startAt: at(-4, "08:00"),
      dueAt: at(-4, "09:30"),
      estimatedMinutes: 90,
      actualMinutes: 100,
      completedAt: at(-4, "09:40"),
      isContent: true,
      content: {
        platform: "OTHER" as const,
        contentType: "ARTICLE" as const,
        contentStatus: "PUBLISHED" as const,
        publishAt: at(-4, "10:00"),
      },
    },

    // --- Recurring examples --------------------------------------------------
    {
      ...base,
      title: "Workout",
      description: "Strength session — Mon / Wed / Fri.",
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(-14, "07:00"),
      dueAt: at(-14, "08:00"),
      estimatedMinutes: 60,
      visibility: "PRIVATE" as const,
      tagIds: [tags.get("personal")],
      recurrence: { freq: "WEEKLY" as const, interval: 1, byWeekday: [1, 3, 5] },
      reminders: [{ minutesBefore: 15 }],
    },
    {
      ...base,
      title: "Post on LinkedIn",
      description: "Weekly cadence keeps the audience warm.",
      projectId: projects.get("social"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(-7, "19:00"),
      dueAt: at(-7, "19:30"),
      estimatedMinutes: 30,
      isContent: true,
      content: {
        platform: "LINKEDIN" as const,
        contentType: "POST" as const,
        contentStatus: "SCHEDULED" as const,
      },
      recurrence: { freq: "WEEKLY" as const, interval: 1, byWeekday: [2] },
      reminders: [{ minutesBefore: 30 }],
    },
    {
      ...base,
      title: "Review analytics",
      description: "Weekly numbers: traffic, signups, retention.",
      projectId: projects.get("brand"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "LOW" as const,
      startAt: at(-7, "10:00"),
      dueAt: at(-7, "11:00"),
      estimatedMinutes: 60,
      recurrence: { freq: "WEEKLY" as const, interval: 1, byWeekday: [0] },
    },
    {
      ...base,
      title: "Daily standup",
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "LOW" as const,
      startAt: at(-14, "09:30"),
      dueAt: at(-14, "09:45"),
      estimatedMinutes: 15,
      recurrence: { freq: "WEEKDAYS" as const, interval: 1 },
    },
    {
      ...base,
      title: "Pay hosting subscription",
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(-30, "09:00"),
      allDay: true,
      visibility: "PRIVATE" as const,
      tagIds: [tags.get("personal")],
      recurrence: { freq: "MONTHLY" as const, interval: 1, byMonthDay: 1 },
      reminders: [{ minutesBefore: 1440 }],
    },
    {
      ...base,
      title: "Sprint planning",
      projectId: projects.get("flowdeck"),
      assigneeId: yash._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
      startAt: at(-14, "16:00"),
      dueAt: at(-14, "17:00"),
      estimatedMinutes: 60,
      recurrence: { freq: "BIWEEKLY" as const, interval: 1, byWeekday: [1] },
    },

    // --- Inbox (unscheduled) -------------------------------------------------
    {
      ...base,
      title: "Maybe make a video about Next.js caching",
      visibility: "PRIVATE" as const,
      status: "TODO" as const,
      priority: "NONE" as const,
    },
    {
      ...base,
      title: "Try a dark-mode-first redesign of the calendar",
      visibility: "PRIVATE" as const,
      status: "TODO" as const,
      priority: "NONE" as const,
    },
    {
      ...base,
      title: "Read up on MongoDB change streams for presence",
      visibility: "PRIVATE" as const,
      status: "TODO" as const,
      priority: "LOW" as const,
    },
    {
      ...base,
      title: "Landing page copy rewrite",
      projectId: projects.get("brand"),
      assigneeId: alex._id,
      status: "TODO" as const,
      priority: "MEDIUM" as const,
    },
  ];

  const created = await Task.insertMany(tasks);
  console.log(`created ${created.length} tasks`);

  // Presence: pretend Alex and Rahul are mid-task right now.
  const dashboardTask = created.find((task) => task.title === "Design dashboard");
  const landingTask = created.find((task) => task.title === "Landing page copy rewrite");
  await User.updateOne({ _id: alex._id }, { $set: { activeTaskId: dashboardTask?._id, lastSeenAt: new Date() } });
  await User.updateOne({ _id: rahul._id }, { $set: { activeTaskId: landingTask?._id, lastSeenAt: new Date() } });
  await User.updateOne({ _id: yash._id }, { $set: { activeTaskId: null, lastSeenAt: new Date() } });

  if (dashboardTask) {
    await Comment.create([
      {
        taskId: dashboardTask._id,
        workspaceId: workspace._id,
        authorId: alex._id,
        body: "Pushed the briefing header. @yash can you check the contrast in dark mode?",
        mentionIds: [yash._id],
      },
      {
        taskId: dashboardTask._id,
        workspaceId: workspace._id,
        authorId: yash._id,
        body: "Looks good. Bump the muted text one step and it passes AA.",
        mentionIds: [],
      },
    ]);
  }

  await Activity.insertMany([
    {
      workspaceId: workspace._id,
      actorId: yash._id,
      kind: "TASK_COMPLETED",
      summary: "completed Build authentication",
      projectId: projects.get("flowdeck"),
      createdAt: at(-6, "13:20"),
    },
    {
      workspaceId: workspace._id,
      actorId: rahul._id,
      kind: "TASK_COMPLETED",
      summary: "completed Create MongoDB schemas",
      projectId: projects.get("flowdeck"),
      createdAt: at(-5, "12:00"),
    },
    {
      workspaceId: workspace._id,
      actorId: alex._id,
      kind: "TASK_STATUS_CHANGED",
      summary: "moved Design dashboard to in progress",
      projectId: projects.get("flowdeck"),
      createdAt: at(0, "10:05"),
    },
    {
      workspaceId: workspace._id,
      actorId: yash._id,
      kind: "TASK_SCHEDULED",
      summary: "scheduled Record YouTube video",
      projectId: projects.get("social"),
      createdAt: at(0, "09:40"),
    },
  ]);

  await syncAllIndexes();

  console.log("\nSeed complete.");
  console.log("  Sign in:", people.map((p) => p.email).join(", "));
  console.log("  Password:", PASSWORD);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  void mongoose.disconnect();
});
