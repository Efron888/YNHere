import { ContactCard, PhoneItem } from '../../types/contact';

/**
 * 匯出為 vCard 3.0 (高相容性標準，含自訂 X-YNHERE 擴充欄位)
 */
export function exportToVCard(contacts: ContactCard[]): string {
  const cards: string[] = [];

  for (const c of contacts) {
    const lines: string[] = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `PRODID:-//YNHere//Business Card Manager//ZH`,
      `FN:${c.name}`,
      `N:${c.name};;;;`,
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

  return cards.join('\r\n\r\n');
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
 * 從 vCard 2.1 / 3.0 / 4.0 字串解析出聯絡人列表
 */
export function importFromVCard(vcfString: string): ContactCard[] {
  const contacts: ContactCard[] = [];
  const rawCards = vcfString.split(/BEGIN:VCARD/i).filter((s) => s.trim().length > 0);

  for (const raw of rawCards) {
    const lines = raw.split(/\r?\n/);
    let name = '未命名聯絡人';
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

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // 處理多行折行 (RFC 75-byte folding)
      while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
        i++;
        line += lines[i].trim();
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;

      const propHeader = line.slice(0, colonIdx).toUpperCase();
      const val = line.slice(colonIdx + 1).trim();

      if (propHeader === 'FN') {
        name = val;
      } else if (propHeader === 'X-YNHERE-NAME-EN') {
        nameEn = val;
      } else if (propHeader.startsWith('ORG')) {
        const parts = val.split(';');
        company = parts[0] || '';
        department = parts[1] || '';
      } else if (propHeader.startsWith('TITLE')) {
        jobTitle = val;
      } else if (propHeader.startsWith('X-YNHERE-TAXID') || propHeader.startsWith('X-TAXID')) {
        taxId = val;
      } else if (propHeader.startsWith('TEL')) {
        const isCell = propHeader.includes('CELL') || propHeader.includes('MOBILE');
        const isFax = propHeader.includes('FAX');
        phones.push({
          type: isCell ? 'mobile' : isFax ? 'fax' : 'work',
          number: val,
          normalizedDialString: val,
        });
      } else if (propHeader.startsWith('EMAIL')) {
        emails.push(val.toLowerCase());
      } else if (propHeader.startsWith('URL')) {
        websites.push(val);
      } else if (propHeader.startsWith('ADR')) {
        const parts = val.split(';');
        const street = parts[2] || parts.filter(Boolean).join(' ');
        if (street) addresses.push(street);
      } else if (propHeader.startsWith('CATEGORIES')) {
        tags.push(...val.split(',').map((t) => t.trim()).filter(Boolean));
      }
    }

    contacts.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name,
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
