import { ContactCard } from '../../types/contact';
import { normalizeTaiwanTaxId } from '../ocr/twValidators';

/**
 * 格式化 CSV 儲存格內容
 * @param val 欄位內容
 * @param forceText 是否強制以 Excel 文字公式 ="內容" 輸出
 * 
 * 關鍵作用：
 * 當使用者用 Microsoft Excel 開啟 CSV 時，Excel 會自動把純數字（如統編 04757891、郵遞區號 005、未帶符號電話 0912345678）
 * 辨識為數值並吃掉開頭的 0，變成 4757891、5、912345678！
 * 透過 ="內容" 語法，Excel 絕對強制解析為純文字，100% 保留開頭的 0。
 */
function formatCsvCell(val: string | undefined | null, forceText = false): string {
  const text = (val ?? '').toString().trim();
  if (!text) return '""';

  // 檢查是否需要文字保護以防 Excel 吃掉前導 0：
  // 1. 明確宣告 forceText
  // 2. 以 0 開頭且包含數字 (如 04757891, 0935..., 02...)
  // 3. 純數字且長度 >= 7 (如統編、純數字電話)
  const isZeroPrefixed = /^0\d+/.test(text);
  const isPureNumber = /^\d{7,}$/.test(text);

  if (forceText || isZeroPrefixed || isPureNumber) {
    return `="${text.replace(/"/g, '""')}"`;
  }

  // 一般文字欄位使用雙引號包裹並跳脫雙引號
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * 匯出 CSV 報表 (強制添加 \uFEFF UTF-8 BOM 避免 Windows Excel 開啟亂碼)
 * 統一編號、手機、公司電話、分機、傳真均受強制文字保護，確保開頭 0 絕不遺失。
 */
export function exportToCsv(contacts: ContactCard[]): string {
  const headers = [
    '姓名',
    '英文姓名',
    '公司',
    '部門',
    '職稱',
    '統一編號',
    '手機',
    '公司電話',
    '分機',
    '傳真',
    'Email',
    '網站',
    '地址',
    '標籤',
    '追蹤狀態',
    '待辦事項',
    '備註',
  ];

  const rows = contacts.map((c) => {
    const mobileObj = c.phones.find((p) => p.type === 'mobile');
    const workObj = c.phones.find((p) => p.type === 'work');
    const faxObj = c.phones.find((p) => p.type === 'fax');

    const mobile = mobileObj?.number || '';
    const work = workObj?.number || '';
    const extension = workObj?.extension || mobileObj?.extension || '';
    const fax = faxObj?.number || '';

    const emails = c.emails.join('; ');
    const websites = c.websites.join('; ');
    const addresses = c.addresses.join('; ');
    const tags = c.tags.join('; ');
    const ribbonStatus = c.ribbon.status;
    const ribbonTask = c.ribbon.taskTitle;
    const notes = c.timelineNotes.map((n) => n.content).join('; ');

    // 統編確保為 8 碼 (若為 7 碼純數字自動補 0)
    const normalizedTax = normalizeTaiwanTaxId(c.taxId);

    const cols = [
      formatCsvCell(c.name),
      formatCsvCell(c.nameEn),
      formatCsvCell(c.company),
      formatCsvCell(c.department),
      formatCsvCell(c.jobTitle),
      formatCsvCell(normalizedTax, true), // 統一編號：強制文字保護，保留開頭 0
      formatCsvCell(mobile, true),        // 手機：強制文字保護，保留開頭 0
      formatCsvCell(work, true),          // 公司電話：強制文字保護，保留開頭 0
      formatCsvCell(extension, true),     // 分機：強制文字保護
      formatCsvCell(fax, true),           // 傳真：強制文字保護，保留開頭 0
      formatCsvCell(emails),
      formatCsvCell(websites),
      formatCsvCell(addresses),
      formatCsvCell(tags),
      formatCsvCell(ribbonStatus),
      formatCsvCell(ribbonTask),
      formatCsvCell(notes),
    ];

    return cols.join(',');
  });

  return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
}

/**
 * 清理並還原 CSV 欄位值（處理 Excel 公式 ="04757891"、引號包裹等）
 */
function cleanFieldValue(raw: string): string {
  if (!raw) return '';
  let str = raw.trim();

  // 處理 Excel 強制文字格式：="內容" 或 =""
  if (str.startsWith('="') && str.endsWith('"')) {
    str = str.slice(2, -1);
  } else if (str.startsWith('=')) {
    str = str.slice(1);
  }

  // 處理一般 CSV 雙引號包裹
  if (str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }

  return str.replace(/""/g, '"').trim();
}

/**
 * 解析 CSV / CamCard 匯出表格
 */
export function parseCsvToContacts(csvText: string): ContactCard[] {
  const clean = csvText.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // CSV 分割器 (支援雙引號、Excel 公式 ="..." 欄位)
  function parseCsvLine(line: string): string[] {
    const res: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    res.push(cur.trim());
    return res;
  }

  const headerLine = parseCsvLine(lines[0]);
  const colIndexMap: Record<string, number> = {};

  headerLine.forEach((h, idx) => {
    const norm = cleanFieldValue(h).toLowerCase().replace(/[\s_]/g, '');
    colIndexMap[norm] = idx;
  });

  const getVal = (row: string[], ...aliases: string[]): string => {
    for (const a of aliases) {
      const idx = colIndexMap[a.toLowerCase()];
      if (idx !== undefined && row[idx] !== undefined) {
        const val = cleanFieldValue(row[idx]);
        if (val) return val;
      }
    }
    return '';
  };

  const results: ContactCard[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const name = getVal(row, '姓名', 'name', 'fullname') || '未命名聯絡人';
    const nameEn = getVal(row, '英文姓名', 'nameen', 'englishname');
    const company = getVal(row, '公司', 'company', 'organization');
    const department = getVal(row, '部門', 'department');
    const jobTitle = getVal(row, '職稱', '職位', 'title', 'jobtitle');

    // 統一編號：若被 Excel 破壞為 7 碼純數字，自動補 0 恢復 8 碼！
    let rawTax = getVal(row, '統一編號', '統編', 'taxid');
    const taxId = normalizeTaiwanTaxId(rawTax);

    let mobile = getVal(row, '手機', '行動電話', 'mobile', 'cellphone');
    let tel = getVal(row, '公司電話', '電話', 'tel', 'phone');
    let extension = getVal(row, '分機', 'ext', 'extension');
    let fax = getVal(row, '傳真', 'fax');
    const email = getVal(row, '電子郵件', 'email', 'e-mail', 'mail');
    const website = getVal(row, '網站', '網址', 'website', 'url');
    const address = getVal(row, '地址', 'address', 'addr');

    // 自動救援：若手機被 Excel 吃掉開頭 0 (如 935169153 為 9 碼純數字且 9 開頭)，自動補 0
    if (/^9\d{8}$/.test(mobile.replace(/[^\d]/g, ''))) {
      const digits = mobile.replace(/[^\d]/g, '');
      mobile = `0${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    // 自動救援：若市話被 Excel 吃掉開頭 0 (如 227863797 或 425545527 為 9 碼純數字且 2~8 開頭)，自動補 0
    if (/^[2-8]\d{8}$/.test(tel.replace(/[^\d]/g, ''))) {
      const digits = tel.replace(/[^\d]/g, '');
      tel = `0${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5)}`;
    }

    const phones = [];
    if (mobile) {
      phones.push({
        type: 'mobile' as const,
        number: mobile,
        normalizedDialString: mobile,
      });
    }
    if (tel) {
      phones.push({
        type: 'work' as const,
        number: tel,
        extension: extension || undefined,
        normalizedDialString: `${tel}${extension ? `,${extension}` : ''}`,
      });
    }
    if (fax) {
      phones.push({
        type: 'fax' as const,
        number: fax,
        normalizedDialString: fax,
      });
    }

    results.push({
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
      emails: email ? [email.toLowerCase()] : [],
      websites: website ? [website] : [],
      addresses: address ? [address] : [],
      socialLinks: {},
      tags: [],
      ribbon: { status: 'none', taskTitle: '' },
      timelineNotes: [],
      careerHistory: [],
      isMyDigitalCard: false,
    });
  }

  return results;
}
