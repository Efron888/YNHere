import { describe, it, expect } from 'vitest';
import { calculateDuplicateScore, mergeContacts } from '../src/services/deduplication/duplicateMatcher';
import { ContactCard } from '../src/types/contact';

function createDummyContact(partial: Partial<ContactCard>): ContactCard {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: '王小明',
    nameEn: '',
    company: '台灣微軟',
    department: '',
    jobTitle: '軟體工程師',
    taxId: '',
    phones: [],
    emails: [],
    websites: [],
    addresses: [],
    socialLinks: {},
    tags: [],
    ribbon: { status: 'none', taskTitle: '' },
    timelineNotes: [],
    careerHistory: [],
    isMyDigitalCard: false,
    ...partial,
  };
}

describe('多維度名片碰撞計分 (calculateDuplicateScore)', () => {
  it('相同統編且相同姓名應給予極高相似度 0.95', () => {
    const a = createDummyContact({ name: '王智翔', taxId: '22099131', company: '台積電' });
    const b = createDummyContact({ name: '王智翔', taxId: '22099131', company: '台灣積體電路製造' });
    const score = calculateDuplicateScore(a, b);
    expect(score).toBeGreaterThanOrEqual(0.95);
  });

  it('相同個人手機且姓名相同應給予 0.88', () => {
    const a = createDummyContact({
      name: '李小華',
      phones: [{ type: 'mobile', number: '0912-345-678', normalizedDialString: '+886-912-345-678' }],
    });
    const b = createDummyContact({
      name: '李小華',
      phones: [{ type: 'mobile', number: '0912-345-678', normalizedDialString: '+886-912-345-678' }],
      company: '新公司',
    });
    const score = calculateDuplicateScore(a, b);
    expect(score).toBeGreaterThanOrEqual(0.88);
  });

  it('跨公司跳槽：姓名相同且手機相同，但公司完全不同，應偵測出 0.82', () => {
    const a = createDummyContact({
      name: '陳建宏',
      company: '公司A',
      phones: [{ type: 'mobile', number: '0988-777-666', normalizedDialString: '+886-988-777-666' }],
    });
    const b = createDummyContact({
      name: '陳建宏',
      company: '公司B',
      phones: [{ type: 'mobile', number: '0988-777-666', normalizedDialString: '+886-988-777-666' }],
    });
    const score = calculateDuplicateScore(a, b);
    expect(score).toBeGreaterThanOrEqual(0.82);
  });

  it('空字串防呆：兩者皆無統編或 Email 時不得誤判高分', () => {
    const a = createDummyContact({ name: '張三', taxId: '', company: '甲公司' });
    const b = createDummyContact({ name: '李四', taxId: '', company: '乙公司' });
    const score = calculateDuplicateScore(a, b);
    expect(score).toBe(0);
  });
});

describe('無損職涯歷史合併 (mergeContacts)', () => {
  it('升遷或跳槽時應自動將舊職務移入 careerHistory 且不丟失電話與標籤', () => {
    const existing = createDummyContact({
      name: '林志玲',
      company: '名模經紀A',
      jobTitle: '模特兒',
      tags: ['VIP'],
      phones: [{ type: 'mobile', number: '0911-000-111', normalizedDialString: '+886-911-000-111' }],
    });

    const incoming = createDummyContact({
      name: '林志玲',
      company: '慈善基金會B',
      jobTitle: '董事長',
      tags: ['公益'],
      emails: ['chiling@charity.org'],
      phones: [{ type: 'work', number: '02-2345-6789', normalizedDialString: '+886-2-2345-6789' }],
    });

    const merged = mergeContacts(existing, incoming);

    // 主欄位應更新為新名片資訊
    expect(merged.company).toBe('慈善基金會B');
    expect(merged.jobTitle).toBe('董事長');

    // 舊公司與舊職稱應完整保留在 careerHistory
    expect(merged.careerHistory.length).toBe(1);
    expect(merged.careerHistory[0].company).toBe('名模經紀A');
    expect(merged.careerHistory[0].jobTitle).toBe('模特兒');

    // 集合欄位應無損合併 (聯集)
    expect(merged.tags).toContain('VIP');
    expect(merged.tags).toContain('公益');
    expect(merged.emails).toContain('chiling@charity.org');
    expect(merged.phones.length).toBe(2);
  });
});
