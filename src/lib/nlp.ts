import * as chrono from "chrono-node";
import type { Priority, RecurrenceFreq } from "@/lib/types";
import type { RecurrenceRule } from "@/models/Task";

export interface ParsedTask {
  title: string;
  startAt: Date | null;
  dueAt: Date | null;
  allDay: boolean;
  estimatedMinutes: number | null;
  priority: Priority;
  recurrence: RecurrenceRule | null;
  tagNames: string[];
  projectName: string | null;
  /** Questions to ask before creating. Non-empty means the input was ambiguous. */
  clarifications: string[];
  matchedText: string[];
}

const WEEKDAY_WORDS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const PRIORITY_WORDS: Array<[RegExp, Priority]> = [
  [/\b(urgent|asap|critical|p0)\b/i, "URGENT"],
  [/\b(high priority|important|p1)\b/i, "HIGH"],
  [/\b(medium priority|p2)\b/i, "MEDIUM"],
  [/\b(low priority|whenever|someday|p3)\b/i, "LOW"],
];

const DURATION_PATTERN =
  /\bfor\s+(\d+(?:\.\d+)?)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/i;

/** "every monday and friday", "every 2 weeks", "daily", "on the 1st of every month" */
function parseRecurrence(text: string): { rule: RecurrenceRule; matched: string } | null {
  const lower = text.toLowerCase();

  const monthDay = lower.match(/\bon the (\d{1,2})(?:st|nd|rd|th)? of (?:every|each) month\b/);
  if (monthDay?.[1]) {
    return {
      rule: { freq: "MONTHLY", interval: 1, byMonthDay: Number(monthDay[1]) },
      matched: monthDay[0],
    };
  }

  const everyN = lower.match(/\bevery (\d+) (day|days|week|weeks|month|months|year|years)\b/);
  if (everyN?.[1] && everyN[2]) {
    const n = Number(everyN[1]);
    const unit = everyN[2];
    const freq: RecurrenceFreq = unit.startsWith("day")
      ? "DAILY"
      : unit.startsWith("week")
        ? "WEEKLY"
        : unit.startsWith("month")
          ? "MONTHLY"
          : "YEARLY";
    return { rule: { freq, interval: n }, matched: everyN[0] };
  }

  if (/\bevery (weekday|working day|business day)s?\b/.test(lower)) {
    const m = lower.match(/\bevery (weekday|working day|business day)s?\b/);
    return { rule: { freq: "WEEKDAYS", interval: 1 }, matched: m?.[0] ?? "every weekday" };
  }

  const weekdayList = lower.match(
    /\bevery\s+((?:mon|tue|tues|wed|thu|thurs|fri|sat|sun)[a-z]*(?:\s*(?:,|and|&)\s*(?:mon|tue|tues|wed|thu|thurs|fri|sat|sun)[a-z]*)*)/,
  );
  if (weekdayList?.[1]) {
    const days = weekdayList[1]
      .split(/\s*(?:,|and|&)\s*/)
      .map((w) => WEEKDAY_WORDS[w.trim()])
      .filter((d): d is number => d !== undefined);
    if (days.length > 0) {
      return { rule: { freq: "WEEKLY", interval: 1, byWeekday: [...new Set(days)] }, matched: weekdayList[0] };
    }
  }

  if (/\b(every ?day|daily)\b/.test(lower)) {
    const m = lower.match(/\b(every ?day|daily)\b/);
    return { rule: { freq: "DAILY", interval: 1 }, matched: m?.[0] ?? "daily" };
  }
  if (/\b(every other week|biweekly|fortnightly)\b/.test(lower)) {
    const m = lower.match(/\b(every other week|biweekly|fortnightly)\b/);
    return { rule: { freq: "BIWEEKLY", interval: 1 }, matched: m?.[0] ?? "biweekly" };
  }
  if (/\bweekly\b/.test(lower)) return { rule: { freq: "WEEKLY", interval: 1 }, matched: "weekly" };
  if (/\bmonthly\b/.test(lower)) return { rule: { freq: "MONTHLY", interval: 1 }, matched: "monthly" };
  if (/\byearly|annually\b/.test(lower)) return { rule: { freq: "YEARLY", interval: 1 }, matched: "yearly" };

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Removes matched fragments from the text. Longest fragments go first so
 * overlapping matches ("Friday for 3 hours" and "for 3 hours") cannot corrupt
 * each other, and matching is boundary-aware so "on" never eats the "on" inside
 * "subscription".
 */
function stripAll(text: string, fragments: string[]): string {
  let out = text;
  const ordered = [...fragments].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const fragment of ordered) {
    // Lookarounds, not \b: a fragment starting with "on" must not match the
    // "on" inside "subscription".
    const leadBoundary = /^[a-z0-9]/i.test(fragment) ? "(?<![a-z0-9])" : "";
    const tailBoundary = /[a-z0-9]$/i.test(fragment) ? "(?![a-z0-9])" : "";
    const pattern = new RegExp(`${leadBoundary}${escapeRegex(fragment)}${tailBoundary}`, "i");
    out = out.replace(pattern, " ");
  }
  return out.replace(/\s{2,}/g, " ").replace(/\s+([,.])/g, "$1").trim();
}

/**
 * Parses "Build auth API tomorrow at 10am for 2 hours #backend !urgent" into
 * structured fields. Deterministic — no model call. Anything it is unsure about
 * is surfaced as a clarification rather than guessed.
 */
export function parseTaskText(input: string, referenceDate: Date): ParsedTask {
  const matched: string[] = [];
  const clarifications: string[] = [];
  let working = input.trim();

  // Tags: #frontend
  const tagNames = [...working.matchAll(/#([a-z0-9-_]{1,32})/gi)].map((m) => m[1]!.toLowerCase());
  for (const tag of [...working.matchAll(/#[a-z0-9-_]{1,32}/gi)].map((m) => m[0])) matched.push(tag);

  // Project: @Flowdeck or "in Flowdeck" is too ambiguous, so only +Project.
  const projectMatch = working.match(/\+([A-Za-z0-9][\w -]{0,40})/);
  const projectName = projectMatch?.[1]?.trim() ?? null;
  if (projectMatch) matched.push(projectMatch[0]);

  // Priority: !urgent or natural wording.
  let priority: Priority = "NONE";
  const bangMatch = working.match(/!(urgent|high|medium|low|none)\b/i);
  if (bangMatch?.[1]) {
    priority = bangMatch[1].toUpperCase() as Priority;
    matched.push(bangMatch[0]);
  } else {
    for (const [pattern, value] of PRIORITY_WORDS) {
      const found = working.match(pattern);
      if (found) {
        priority = value;
        matched.push(found[0]);
        break;
      }
    }
  }

  // Duration: "for 2 hours"
  let estimatedMinutes: number | null = null;
  const durationMatch = working.match(DURATION_PATTERN);
  if (durationMatch?.[1] && durationMatch[2]) {
    const amount = Number(durationMatch[1]);
    estimatedMinutes = /^(h|hr|hrs|hour|hours)$/i.test(durationMatch[2])
      ? Math.round(amount * 60)
      : Math.round(amount);
    matched.push(durationMatch[0]);
  }

  // Recurrence before date parsing, so "every Tuesday" is not read as one date.
  const recurrenceHit = parseRecurrence(working);
  const recurrence = recurrenceHit?.rule ?? null;
  if (recurrenceHit) matched.push(recurrenceHit.matched);

  // Dates: parse the text with recurrence wording removed so chrono sees a single
  // occurrence ("every Tuesday at 7pm" -> "at 7pm").
  const noiseForChrono = [recurrenceHit?.matched, durationMatch?.[0]].filter(
    (v): v is string => Boolean(v),
  );
  const forChrono = noiseForChrono.length > 0 ? stripAll(working, noiseForChrono) : working;
  const results = chrono.parse(forChrono, referenceDate, { forwardDate: true });

  let startAt: Date | null = null;
  let dueAt: Date | null = null;
  let allDay = false;

  if (results.length > 0) {
    const first = results[0]!;
    startAt = first.start.date();
    allDay = !first.start.isCertain("hour");
    if (first.end) dueAt = first.end.date();
    matched.push(first.text);
    if (results.length > 1) {
      clarifications.push(
        `Found more than one date ("${results.map((r) => r.text).join('", "')}"). Which one is the schedule?`,
      );
    }
  }

  if (recurrence && !startAt) {
    // A recurring task with no time-of-day is fine, but it needs a first date.
    startAt = referenceDate;
    allDay = true;
  }

  if (recurrence && startAt && recurrence.freq === "WEEKLY" && !recurrence.byWeekday) {
    recurrence.byWeekday = [startAt.getDay()];
  }

  if (!dueAt && startAt && estimatedMinutes && !allDay) {
    dueAt = new Date(startAt.getTime() + estimatedMinutes * 60_000);
  }

  const title = stripAll(working, matched)
    .replace(/^\s*(?:at|on|for|by|in)\s+/i, "")
    // Trailing dangling preposition only when it stands as its own word.
    .replace(/(?:^|\s)(?:at|on|by|for)\s*$/i, "")
    .trim();

  if (!title) clarifications.push("What should this task be called?");
  if (!startAt && !recurrence) {
    // Not an error: it lands in the inbox unscheduled.
  }
  if (allDay && estimatedMinutes) {
    clarifications.push(`You set a duration of ${estimatedMinutes} minutes but no start time. What time should it start?`);
  }

  return {
    title: title || input.trim(),
    startAt,
    dueAt,
    allDay,
    estimatedMinutes,
    priority,
    recurrence,
    tagNames: [...new Set(tagNames)],
    projectName,
    clarifications,
    matchedText: matched,
  };
}
