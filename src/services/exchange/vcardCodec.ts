import { ContactCard, PhoneItem } from '../../types/contact';

/**
 * 解碼 Quoted-Printable UTF-8 字串 (常見於 Android / 舊版 Outlook 匯出之 vCard 2.1)
 */
function decodeQuotedPrintable(input: string): string {
  try {
    // 移除軟換行
    const cleaned = input.replace(/=\r?\n/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '=' && i + 2 < cleaned.length) {
        const hex = cleaned.slice(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
      }
      const code = cleaned.charCodeAt(i);
      bytes.push(code);
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return input;
  }
}

/**
 * 解碼 Base64 UTF-8 字串
 */
function decodeBase64Utf8(input: string): string {
  try {
    const binary = atob(input.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return input;
  }
}

/**
 * 依據 vCard 屬性標頭解碼欄位值
 */
function decodeVCardValue(propHeader: string, rawVal: string): string {
  let val = rawVal.trim();
  if (propHeader.includes('QUOTED-PRINTABLE')) {
    val = decodeQuotedPrintable(val);
  } else if (propHeader.includes('ENCODING=B') || propHeader.includes('BASE64')) {
    val = decodeBase64Utf8(val);
  }
  return val.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
}

/**
 * 匯出為 vCard 3.0 (高相容性標準，支援 iPhone / Android 多筆聯絡人一次匯入)
 */
export function exportToVCard(contacts: ContactCard[]): string {
  const cards: string[] = [];

  for (const c of contacts) {
    const cleanName = (c.name || '未命名聯絡人').trim();
    const lastName = cleanName.length >= 2 ? cleanName.slice(0, 1) : cleanName;
    const firstName = cleanName.length >= 2 ? cleanName.slice(1) : '';

    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'PRODID:-//YNHere//Business Card Manager//ZH',
      `FN:${cleanName}`,
      `N:${lastName};${firstName};;;`,
    ];

    if (c.nameEn) {
      lines.push(`X-YNHERE-NAME-EN:${c.nameEn}`);
    }

    if (c.company || c.department) {
      lines.push(`ORG:${c.company || ''};${c.department || ''}`);
    }

    if (c.jobTitle) {
      lines.push(`TITLE:${c.jobTitle}`);
    }

    if (c.taxId) {
      lines.push(`X-YNHERE-TAXID:${c.taxId}`);
    }

    // 電話
    for (const p of c.phones) {
      const type = p.type === 'mobile' ? 'CELL' : p.type === 'fax' ? 'FAX' : 'WORK';
      const dial = p.normalizedDialString || p.number;
      lines.push(`TEL;TYPE=${type}:${dial}`);
    }

    // Email
    for (const e of c.emails) {
      lines.push(`EMAIL;TYPE=INTERNET:${e}`);
    }

    // URL
    for (const w of c.websites) {
      lines.push(`URL:${w}`);
    }

    // 地址
    for (const addr of c.addresses) {
      lines.push(`ADR;TYPE=WORK:;;${addr};;;;`);
    }

    // 標籤
    if (c.tags.length > 0) {
      lines.push(`CATEGORIES:${c.tags.join(',')}`);
    }

    // Ribbon
    if (c.ribbon && c.ribbon.status !== 'none') {
      lines.push(`X-YNHERE-RIBBON:${JSON.stringify(c.ribbon)}`);
    }

    // 備註
    if (c.timelineNotes.length > 0) {
      const notesSummary = c.timelineNotes.map((n) => `[${n.createdAt.slice(0, 10)}] ${n.content}`).join('\\n');
      lines.push(`NOTE:${notesSummary}`);
    }

    lines.push('END:VCARD');
    cards.push(lines.join('\r\n'));
  }

  // RFC 2426 標準：多筆 VCARD 之間以單一 CRLF 銜接，確保 iOS / Android 完整讀取所有聯絡人而不中斷於第一筆
  return cards.join('\r\n');
}

/**
 * 產生控制在 700 Bytes 以內的 QR Code 專用精簡版 vCard 3.0
 */
export function generateCompactVCardForQr(c: ContactCard): string {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${c.name}`,
    `ORG:${c.company}`,
  ];

  if (c.jobTitle) lines.push(`TITLE:${c.jobTitle}`);
  if (c.taxId) lines.push(`X-TAXID:${c.taxId}`);

  // 手機優先，最多放兩支電話
  const phones = [...c.phones].sort((a) => (a.type === 'mobile' ? -1 : 1)).slice(0, 2);
  for (const p of phones) {
    const type = p.type === 'mobile' ? 'CELL' : 'WORK';
    lines.push(`TEL;TYPE=${type}:${p.normalizedDialString || p.number}`);
  }

  // 最多 1 個 Email
  if (c.emails.length > 0) {
    lines.push(`EMAIL:${c.emails[0]}`);
  }

  // 最多 1 個地址
  if (c.addresses.length > 0) {
    lines.push(`ADR:;;${c.addresses[0]};;;;`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

/**
 * 從 vCard 2.1 / 3.0 / 4.0 字串解析出所有聯絡人列表
 * 完整支援 iPhone (item1.TEL 群組前綴) 與 Android (CHARSET=UTF-8 / QUOTED-PRINTABLE 多筆匯出)
 */
export function importFromVCard(vcfString: string): ContactCard[] {
  const contacts: ContactCard[] = [];
  const rawCards = vcfString
    .split(/BEGIN:VCARD/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /END:VCARD/i.test(s));

  for (const raw of rawCards) {
    const rawLines = raw.split(/\r\n|\r|\n/);
    // 預先合併 RFC 折行與 Quoted-Printable 軟換行 (行尾為 =)
    const unfoldedLines: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (!line.trim()) continue;

      if (unfoldedLines.length > 0 && (line.startsWith(' ') || line.startsWith('\t'))) {
        unfoldedLines[unfoldedLines.length - 1] += line.slice(1);
      } else if (
        unfoldedLines.length > 0 &&
        unfoldedLines[unfoldedLines.length - 1].endsWith('=') &&
        /QUOTED-PRINTABLE/i.test(unfoldedLines[unfoldedLines.length - 1])
      ) {
        unfoldedLines[unfoldedLines.length - 1] =
          unfoldedLines[unfoldedLines.length - 1].slice(0, -1) + line.trim();
      } else {
        unfoldedLines.push(line.trim());
      }
    }

    let name = '';
    let fallbackN = '';
    let nameEn = '';
    let company = '';
    let department = '';
    let jobTitle = '';
    let taxId = '';
    const phones: PhoneItem[] = [];
    const emails: string[] = [];
    const websites: string[] = [];
    const addresses: string[] = [];
    const tags: string[] = [];

    for (const line of unfoldedLines) {
      if (/^END:VCARD/i.test(line)) break;

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      // 去除 iOS 常見的 item1. / item2. 前綴
      const rawHeader = line.slice(0, colonIdx).trim().replace(/^item\d+\./i, '');
      const propHeader = rawHeader.toUpperCase();
      const propName = propHeader.split(';')[0].trim();
      const rawVal = line.slice(colonIdx + 1);
      const val = decodeVCardValue(propHeader, rawVal);

      if (!val) continue;

      if (propName === 'FN') {
        name = val;
      } else if (propName === 'N') {
        const nParts = val.split(';').map((s) => s.trim()).filter(Boolean);
        if (nParts.length > 0) {
          fallbackN = nParts.join('');
        }
      } else if (propName === 'X-YNHERE-NAME-EN') {
        nameEn = val;
      } else if (propName === 'ORG') {
        const parts = val.split(';');
        company = (parts[0] || '').trim();
        department = (parts[1] || '').trim();
      } else if (propName === 'TITLE') {
        jobTitle = val;
      } else if (propName === 'X-YNHERE-TAXID' || propName === 'X-TAXID') {
        taxId = val;
      } else if (propName === 'TEL') {
        const isCell =
          propHeader.includes('CELL') ||
          propHeader.includes('MOBILE') ||
          propHeader.includes('IPHONE') ||
          /^09\d/.test(val.replace(/[^\d]/g, ''));
        const isFax = propHeader.includes('FAX');
        phones.push({
          type: isCell ? 'mobile' : isFax ? 'fax' : 'work',
          number: val,
          normalizedDialString: val,
        });
      } else if (propName === 'EMAIL') {
        emails.push(val.toLowerCase());
      } else if (propName === 'URL') {
        websites.push(val);
      } else if (propName === 'ADR') {
        const parts = val.split(';').map((s) => s.trim());
        const street = parts[2] || parts.filter(Boolean).join('');
        if (street) addresses.push(street);
      } else if (propName === 'CATEGORIES') {
        tags.push(...val.split(',').map((t) => t.trim()).filter(Boolean));
      }
    }

    const finalName = name || fallbackN || '未命名聯絡人';

    contacts.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: finalName,
      nameEn,
      company,
      department,
      jobTitle,
      taxId,
      phones,
      emails,
      websites,
      addresses,
      socialLinks: {},
      tags,
      ribbon: { status: 'none', taskTitle: '' },
      timelineNotes: [],
      careerHistory: [],
      isMyDigitalCard: false,
    });
  }

  return contacts;
}
