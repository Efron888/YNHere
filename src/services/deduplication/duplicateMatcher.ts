import { ContactCard, CareerSnapshot, PhoneItem } from '../../types/contact';

function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

function cleanString(str: string): string {
  return str.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
}

/**
 * 多維度名片碰撞相似度計分 (0 ~ 1)
 */
export function calculateDuplicateScore(a: ContactCard, b: ContactCard): number {
  const scores: number[] = [0];

  const nameA = cleanString(a.name);
  const nameB = cleanString(b.name);
  const isDefaultNameA = a.name === '未命名聯絡人' || !a.name;
  const isDefaultNameB = b.name === '未命名聯絡人' || !b.name;
  const namesEqual = !isDefaultNameA && !isDefaultNameB && nameA === nameB;
  const nameMatchWithDefault = namesEqual || isDefaultNameA || isDefaultNameB;

  const taxIdA = a.taxId.trim();
  const taxIdB = b.taxId.trim();
  const compA = cleanString(a.company);
  const compB = cleanString(b.company);

  // 規則 1: 相同統編 + 相同姓名 -> 0.95
  if (taxIdA && taxIdB && taxIdA === taxIdB && namesEqual) {
    scores.push(0.95);
  }

  // 規則 2: 相同 Email + 姓名相同(或一方為預設) -> 0.90
  const emailsA = a.emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const emailsB = b.emails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  const hasCommonEmail = emailsA.some((e) => emailsB.includes(e));
  if (hasCommonEmail && nameMatchWithDefault) {
    scores.push(0.90);
  }

  // 規則 3: 相同手機號碼 + 姓名相同(或一方為預設) -> 0.88
  const mobilesA = a.phones
    .filter((p) => p.type === 'mobile')
    .map((p) => p.normalizedDialString || p.number.replace(/[^\d+]/g, ''))
    .filter(Boolean);
  const mobilesB = b.phones
    .filter((p) => p.type === 'mobile')
    .map((p) => p.normalizedDialString || p.number.replace(/[^\d+]/g, ''))
    .filter(Boolean);
  const hasCommonMobile = mobilesA.some((m) => mobilesB.includes(m));
  if (hasCommonMobile && nameMatchWithDefault) {
    scores.push(0.88);
  }

  // 規則 4: 同名且同公司 (編輯距離 <= 2) -> 0.85
  if (namesEqual && compA && compB) {
    const dist = levenshteinDistance(compA, compB);
    if (dist <= 2) {
      scores.push(0.85);
    }
  }

  // 規則 5: 姓名相同且公司不同，但手機相同或 Email 相同或英文名相同 -> 0.82 (跨公司跳槽/異動)
  if (namesEqual && compA !== compB) {
    const nameEnA = cleanString(a.nameEn);
    const nameEnB = cleanString(b.nameEn);
    const hasCommonEn = nameEnA && nameEnB && nameEnA === nameEnB;
    if (hasCommonMobile || hasCommonEmail || hasCommonEn) {
      scores.push(0.82);
    }
  }

  return Math.max(...scores);
}

/**
 * 職涯歷史無損合併
 */
export function mergeContacts(existing: ContactCard, incoming: ContactCard): ContactCard {
  const merged: ContactCard = {
    ...existing,
    updatedAt: new Date().toISOString(),
  };

  // 1. 職涯快照：如果公司或職稱變更，把舊有的存入 careerHistory
  const companyChanged = incoming.company && incoming.company !== existing.company;
  const titleChanged = incoming.jobTitle && incoming.jobTitle !== existing.jobTitle;

  if (existing.company && (companyChanged || titleChanged)) {
    const isAlreadyArchived = existing.careerHistory.some(
      (c) => c.company === existing.company && c.jobTitle === existing.jobTitle
    );

    if (!isAlreadyArchived) {
      const snapshot: CareerSnapshot = {
        id: crypto.randomUUID(),
        company: existing.company,
        department: existing.department || '',
        jobTitle: existing.jobTitle || '',
        frontImageId: existing.frontImageId,
        backImageId: existing.backImageId,
        archivedAt: new Date().toISOString(),
      };
      merged.careerHistory = [...existing.careerHistory, snapshot];
    }
  }

  // 2. 主欄位覆蓋（採用最新 incoming 之非空值）
  if (incoming.name && incoming.name !== '未命名聯絡人') merged.name = incoming.name;
  if (incoming.nameEn) merged.nameEn = incoming.nameEn;
  if (incoming.company) merged.company = incoming.company;
  if (incoming.department) merged.department = incoming.department;
  if (incoming.jobTitle) merged.jobTitle = incoming.jobTitle;
  if (incoming.taxId) merged.taxId = incoming.taxId;
  if (incoming.frontImageId) merged.frontImageId = incoming.frontImageId;
  if (incoming.backImageId) merged.backImageId = incoming.backImageId;
  if (incoming.thumbnailDataUrl) merged.thumbnailDataUrl = incoming.thumbnailDataUrl;

  // 3. 集合欄位聯集去重
  // Phones: 依 normalizedDialString 去重
  const phoneMap = new Map<string, PhoneItem>();
  for (const p of [...existing.phones, ...incoming.phones]) {
    const key = p.normalizedDialString || p.number;
    if (key && !phoneMap.has(key)) {
      phoneMap.set(key, p);
    }
  }
  merged.phones = Array.from(phoneMap.values());

  // Emails: 轉小寫去重
  merged.emails = Array.from(new Set([...existing.emails, ...incoming.emails].map((e) => e.toLowerCase())));

  // Websites
  merged.websites = Array.from(new Set([...existing.websites, ...incoming.websites]));

  // Addresses
  merged.addresses = Array.from(new Set([...existing.addresses, ...incoming.addresses]));

  // Tags
  merged.tags = Array.from(new Set([...existing.tags, ...incoming.tags]));

  // Social Links
  merged.socialLinks = { ...existing.socialLinks, ...incoming.socialLinks };

  // Timeline Notes
  const noteIds = new Set(existing.timelineNotes.map((n) => n.id));
  const newNotes = incoming.timelineNotes.filter((n) => !noteIds.has(n.id));
  merged.timelineNotes = [...existing.timelineNotes, ...newNotes];

  // Ribbon: incoming 若有指定優先採用
  if (incoming.ribbon && incoming.ribbon.status !== 'none') {
    merged.ribbon = incoming.ribbon;
  }

  return merged;
}
