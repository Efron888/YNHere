import { describe, it, expect } from 'vitest';
import { ContactCard } from '../src/types/contact';
import { exportToVCard, importFromVCard, generateCompactVCardForQr } from '../src/services/exchange/vcardCodec';
import { exportToYnpack, importFromYnpack } from '../src/services/exchange/ynpackArchive';
import { exportToCsv, parseCsvToContacts } from '../src/services/exchange/tabularCodec';
import { exportRibbonToIcs } from '../src/services/exchange/calendarIcs';
import { encodeContactsToUrlHash, decodeContactsFromUrlHash } from '../src/services/exchange/urlShareCodec';

function createDummyContact(partial: Partial<ContactCard>): ContactCard {
  return {
    id: crypto.randomUUID(),
    createdAt: '2026-11-02T12:00:00.000Z',
    updatedAt: '2026-11-02T12:00:00.000Z',
    name: '王大明',
    nameEn: 'David Wang',
    company: '台灣微軟股份有限公司',
    department: '雲端架構處',
    jobTitle: '資深解決方案架構師',
    taxId: '22099131',
    phones: [
      { type: 'mobile', number: '0912-345-678', normalizedDialString: '+886-912-345-678' },
      { type: 'work', number: '02-2345-6789', extension: '101', normalizedDialString: '+886-2-2345-6789,101' },
    ],
    emails: ['david.wang@microsoft.com'],
    websites: ['https://microsoft.com'],
    addresses: ['台北市信義區信義路五段7號'],
    socialLinks: { line: 'david_line' },
    tags: ['A級客戶', '雲端'],
    ribbon: { status: 'in_progress', taskTitle: '下週二拜訪確認 PoC', dueDate: '2026-11-10T14:00:00.000Z' },
    timelineNotes: [{ id: crypto.randomUUID(), content: '初次電話洽談順利', createdAt: '2026-11-02T12:30:00.000Z', category: 'call' }],
    careerHistory: [],
    isMyDigitalCard: false,
    ...partial,
  };
}

describe('vCard 3.0 編解碼器 (vcardCodec)', () => {
  it('單張名片應能雙向無損序列化與反序列化', () => {
    const contact = createDummyContact({});
    const vcfString = exportToVCard([contact]);

    expect(vcfString).toContain('BEGIN:VCARD');
    expect(vcfString).toContain('VERSION:3.0');
    expect(vcfString).toContain('FN:王大明');
    expect(vcfString).toContain('ORG:台灣微軟股份有限公司;雲端架構處');
    expect(vcfString).toContain('TITLE:資深解決方案架構師');
    expect(vcfString).toContain('X-YNHERE-TAXID:22099131');

    const imported = importFromVCard(vcfString);
    expect(imported.length).toBe(1);
    expect(imported[0].name).toBe('王大明');
    expect(imported[0].company).toBe('台灣微軟股份有限公司');
    expect(imported[0].taxId).toBe('22099131');
    expect(imported[0].phones.length).toBe(2);
    expect(imported[0].emails).toContain('david.wang@microsoft.com');
  });

  it('多張名片勾選或全選應合併於單一 vcf 檔案中', () => {
    const c1 = createDummyContact({ name: '聯絡人A' });
    const c2 = createDummyContact({ name: '聯絡人B' });
    const vcf = exportToVCard([c1, c2]);
    const imported = importFromVCard(vcf);
    expect(imported.length).toBe(2);
  });

  it('應能正確匯入 Android (vCard 2.1 Quoted-Printable 軟換行) 與 iOS (item1.TEL 群組前綴) 的多人通訊錄 .vcf 檔', () => {
    const mobileVcf = [
      'BEGIN:VCARD',
      'VERSION:2.1',
      'N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=8A=89;=E6=99=AF=E6=96=87;;;',
      'FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=E5=8A=89=E6=99=AF=',
      '=E6=96=87',
      'TEL;CELL:0935-169-153',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:蔡;金波;;;',
      'FN:蔡金波',
      'item1.TEL;type=CELL;type=VOICE;type=pref:0972-761-915',
      'item2.EMAIL;type=INTERNET:tsai@spil.com.tw',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'N:詹;睿源;;;',
      'TEL;TYPE=CELL:0978-893-537',
      'END:VCARD',
    ].join('\r\n');

    const imported = importFromVCard(mobileVcf);
    expect(imported.length).toBe(3);
    expect(imported[0].name).toBe('劉景文');
    expect(imported[0].phones[0].number).toBe('0935-169-153');
    expect(imported[1].name).toBe('蔡金波');
    expect(imported[1].phones[0].number).toBe('0972-761-915');
    expect(imported[1].emails[0]).toBe('tsai@spil.com.tw');
    expect(imported[2].name).toBe('詹睿源');
    expect(imported[2].phones[0].number).toBe('0978-893-537');
  });

  it('QR Code 精簡版 vCard 必須控制在 700 Bytes 以內', () => {
    const contact = createDummyContact({});
    const compactVcf = generateCompactVCardForQr(contact);
    const byteLength = new TextEncoder().encode(compactVcf).length;
    expect(byteLength).toBeLessThanOrEqual(700);
    expect(compactVcf).toContain('王大明');
  });
});

describe('YNHere 完整封裝 ZIP 備份 (.ynpack)', () => {
  it('應能將名片資料與圖片二進位打包為 ZIP，並無損解壓還原', async () => {
    const contact = createDummyContact({
      frontImageId: 'img-front-1',
      thumbnailDataUrl: 'data:image/webp;base64,mockthumb',
    });

    const mockImages = new Map<string, Uint8Array>();
    mockImages.set('img-front-1', new TextEncoder().encode('fake-webp-image-binary'));

    const ynpackBytes = await exportToYnpack([contact], mockImages);
    expect(ynpackBytes.length).toBeGreaterThan(0);

    const { contacts, images } = await importFromYnpack(ynpackBytes);
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe('王大明');
    expect(images.has('img-front-1')).toBe(true);
  });
});

describe('CSV 報表與 CamCard 映射 (tabularCodec)', () => {
  it('匯出 CSV 必須包含 UTF-8 BOM 標頭以防止 Excel 亂碼', () => {
    const contact = createDummyContact({});
    const csv = exportToCsv([contact]);
    // 檢查開頭包含 BOM \uFEFF
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('姓名,英文姓名,公司,部門,職稱,統一編號');
    expect(csv).toContain('王大明');
  });

  it('匯出 CSV 對統一編號、手機、市話等開頭為0之欄位必須強制以 ="..." 包裹以防 Excel 吞0', () => {
    const contact = createDummyContact({
      company: '廣運機械工程股份有限公司',
      taxId: '04757891', // 開頭為 0 之 8 碼統編
      phones: [
        { type: 'mobile', number: '0935-169-153', normalizedDialString: '+886-935-169-153' },
        { type: 'work', number: '02-2786-3797', extension: '136', normalizedDialString: '+886-2-2786-3797,136' },
        { type: 'fax', number: '02-2788-5170', normalizedDialString: '+886-2-2788-5170' },
      ],
    });

    const csv = exportToCsv([contact]);
    // 驗證 Excel 強制文字格式 ="04757891"
    expect(csv).toContain('="04757891"');
    expect(csv).toContain('="0935-169-153"');
    expect(csv).toContain('="02-2786-3797"');
    expect(csv).toContain('="136"');
    expect(csv).toContain('="02-2788-5170"');
  });

  it('應支援解析 CSV 檔案（包含中英文欄位映射與 Excel ="..." 格式去除）', () => {
    const sampleCsv = `姓名,公司,職稱,統一編號,手機,公司電話,分機,電子郵件\n"劉景文","廣運機械工程股份有限公司","副理",="04757891",="0935-169-153",="02-2786-3797",="136",chingwenliu@kenmec.com`;
    const contacts = parseCsvToContacts(sampleCsv);
    expect(contacts.length).toBe(1);
    expect(contacts[0].name).toBe('劉景文');
    expect(contacts[0].company).toBe('廣運機械工程股份有限公司');
    expect(contacts[0].jobTitle).toBe('副理');
    expect(contacts[0].taxId).toBe('04757891');
    expect(contacts[0].phones.find((p) => p.type === 'work')?.extension).toBe('136');
    expect(contacts[0].phones.find((p) => p.type === 'mobile')?.number).toBe('0935-169-153');
  });

  it('匯入被 Excel 吞掉開頭0的舊 CSV (如 7碼統編 4757891、9碼手機 935169153) 應自動補0救援', () => {
    const brokenCsv = `姓名,公司,職稱,統一編號,手機\n"劉景文","廣運機械","副理",4757891,935169153`;
    const contacts = parseCsvToContacts(brokenCsv);
    expect(contacts.length).toBe(1);
    // 統編 7 碼純數字自動補 0 恢復為 04757891
    expect(contacts[0].taxId).toBe('04757891');
    // 手機 9 碼純數字自動補 0 恢復為 0935-169-153
    expect(contacts[0].phones.find((p) => p.type === 'mobile')?.number).toBe('0935-169-153');
  });
});

describe('商務追蹤行事曆連動 (calendarIcs)', () => {
  it('應能將絲帶待辦事項轉換為標準 .ics 檔案', () => {
    const contact = createDummyContact({});
    const ics = exportRibbonToIcs(contact);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:名片追蹤: 王大明 - 下週二拜訪確認 PoC');
    expect(ics).toContain('END:VCALENDAR');
  });
});

describe('零後端 URL Hash 加密分享 (urlShareCodec)', () => {
  it('應能將名片核心純文字資料壓縮編碼為 URL Hash，並解碼還原', () => {
    const contact = createDummyContact({});
    const hash = encodeContactsToUrlHash([contact]);
    expect(hash.startsWith('#card=')).toBe(true);

    const decoded = decodeContactsFromUrlHash(hash);
    expect(decoded.length).toBe(1);
    expect(decoded[0].name).toBe('王大明');
    expect(decoded[0].company).toBe('台灣微軟股份有限公司');
  });

  it('若傳入超過 10 張名片應拋出容量上限保護錯誤', () => {
    const manyContacts = Array.from({ length: 11 }, (_, i) => createDummyContact({ name: `聯絡人${i}` }));
    expect(() => encodeContactsToUrlHash(manyContacts)).toThrowError(/超過 10 張/);
  });
});
