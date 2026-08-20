import { WorshipLeaderScheduleItem } from "../types";

/**
 * Formats a date string (YYYY-MM-DD) into a human-readable date.
 */
export function formatRosterDate(dateStr: string, short: boolean = false): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    if (short) {
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    }
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Returns the readable role label for a ministry schedule item.
 */
export function getRoleLabel(item: Partial<WorshipLeaderScheduleItem>): string {
  const cat = item.category || "worship_leader";
  if (cat === "preacher") {
    return item.preacherServiceType === "midweek" ? "Mid-week Preacher" : "Sunday Preacher";
  }
  if (cat === "youth_facilitator") {
    return "Youth Facilitator";
  }
  return "Worship Leader";
}

/**
 * Formats a list of Ministry/Worship schedule items into clean, copyable text.
 */
export function formatMinistryScheduleForClipboard(
  items: WorshipLeaderScheduleItem[],
  options?: {
    title?: string;
    subtitle?: string;
    shortDate?: boolean;
  }
): string {
  if (!items || items.length === 0) {
    return "📋 MINISTRY SCHEDULE\nNo scheduled ministry assignments found.";
  }

  // Filter out any without dates and sort ascending
  const sorted = [...items]
    .filter((it) => !!it.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return "📋 MINISTRY SCHEDULE\nNo scheduled ministry assignments found.";
  }

  // Group by date
  const dateGroups: Record<string, WorshipLeaderScheduleItem[]> = {};
  sorted.forEach((it) => {
    if (!dateGroups[it.date]) dateGroups[it.date] = [];
    dateGroups[it.date].push(it);
  });

  const lines: string[] = [];

  // Title Header
  lines.push(options?.title || "📋 MINISTRY SCHEDULE");
  if (options?.subtitle) {
    lines.push(options.subtitle);
  }
  lines.push("");

  const dates = Object.keys(dateGroups).sort();
  dates.forEach((dateKey, idx) => {
    const groupItems = dateGroups[dateKey];
    const formattedDate = formatRosterDate(dateKey, options?.shortDate ?? false);
    lines.push(`🗓️ ${formattedDate}`);

    groupItems.forEach((it) => {
      const role = getRoleLabel(it);
      let person = it.worshipLeader?.trim() || "Unassigned";
      if (it.isGuestSpeaker) {
        person += " (Guest)";
      }

      let line = `• ${role}: ${person}`;

      const extras: string[] = [];
      if ((it.category === "worship_leader" || !it.category) && it.backupSingers && it.backupSingers.length > 0) {
        const backups = it.backupSingers.filter(Boolean);
        if (backups.length > 0) {
          extras.push(`Backups: ${backups.join(", ")}`);
        }
      }
      if (it.category === "preacher" && it.sermonTitle?.trim()) {
        extras.push(`Sermon: "${it.sermonTitle.trim()}"`);
      }
      if (it.category === "youth_facilitator" && it.topicSharing?.trim()) {
        extras.push(`Topic: "${it.topicSharing.trim()}"`);
      }

      if (extras.length > 0) {
        line += ` (${extras.join(" | ")})`;
      }

      lines.push(line);

      if (it.notes?.trim()) {
        lines.push(`  Note: ${it.notes.trim()}`);
      }
    });

    if (idx < dates.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

/**
 * Copies text to the clipboard with fallback for older browser environments.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    console.warn("navigator.clipboard.writeText failed, trying fallback:", err);
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    return successful;
  } catch (err) {
    console.error("Fallback copy failed:", err);
    return false;
  }
}
