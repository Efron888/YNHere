import { ContactCard } from '../../types/contact';

/**
 * 將絲帶待辦事項轉換為標準 iCalendar (.ics RFC 5545) 格式
 */
export function exportRibbonToIcs(c: ContactCard): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formatIcsDate = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

  const dtStamp = formatIcsDate(now);
  const dueDate = c.ribbon.dueDate ? new Date(c.ribbon.dueDate) : new Date(now.getTime() + 24 * 3600 * 1000);
  const dtStart = formatIcsDate(dueDate);
  const dtEnd = formatIcsDate(new Date(dueDate.getTime() + 30 * 60 * 1000)); // 預設 30 分鐘

  const uid = `ynhere-ribbon-${c.id}-${now.getTime()}@ynhere.app`;
  const summary = `名片追蹤: ${c.name}${c.ribbon.taskTitle ? ` - ${c.ribbon.taskTitle}` : ''}`;
  const description = `聯絡人: ${c.name}\\n公司: ${c.company}\\n職稱: ${c.jobTitle}\\n追蹤狀態: ${c.ribbon.status}\\n備註: ${c.timelineNotes.map((n) => n.content).join('; ')}`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//YNHere//Card Ribbon Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    c.addresses[0] ? `LOCATION:${c.addresses[0]}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:名片追蹤提醒',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}
