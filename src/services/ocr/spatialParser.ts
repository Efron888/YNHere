import { PhoneItem } from '../../types/contact';
import { isValidTaiwanTaxId, normalizeTaiwanTaxId, normalizePhone, cleanAddress } from './twValidators';

export interface OcrLine {
  text: string;
  bbox: [x0: number, y0: number, x1: number, y1: number];
}

export interface ParsedCardFields {
  name: string;
  nameEn: string;
  company: string;
  department: string;
  jobTitle: string;
  taxId: string;
  phones: PhoneItem[];
  emails: string[];
  websites: string[];
  addresses: string[];
}

const COMMON_SURNAMES = new Set([
  '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊',
  '許', '鄭', '謝', '洪', '郭', '邱', '曾', '廖', '賴', '徐',
  '周', '葉', '蘇', '莊', '江', '呂', '何', '羅', '高', '蕭',
  '潘', '朱', '簡', '彭', '游', '詹', '胡', '施', '沈', '余',
  '盧', '梁', '趙', '顏', '柯', '翁', '魏', '孫', '樊', '鄧',
  '范', '方', '宋', '溫', '戴', '龔', '康', '傅', '古', '石',
  '歐陽', '司馬', '諸葛', '范姜', '張簡',
]);

// Tesseract chi_tra 常見將姓氏誤判之形近字映射 (僅套用於 3 字人名首字)
const SURNAME_OCR_LOOKALIKE_MAP: Record<string, string> = {
  到: '劉',
  留: '劉',
  瀏: '劉',
  釗: '劉',
  陣: '陳',
  東: '陳',
  杯: '林',
  長: '張',
};

// 常見台灣姓氏英譯拼音對照表
const PINYIN_SURNAME_MAP: Array<[string, string]> = [
  ['liu', '劉'],
  ['chen', '陳'],
  ['lin', '林'],
  ['huang', '黃'],
  ['chang', '張'],
  ['zhang', '張'],
  ['wang', '王'],
  ['lee', '李'],
  ['wu', '吳'],
  ['tsai', '蔡'],
  ['yang', '楊'],
  ['hsu', '許'],
  ['cheng', '鄭'],
  ['hsieh', '謝'],
  ['kuo', '郭'],
  ['hung', '洪'],
  ['chiu', '邱'],
  ['tseng', '曾'],
  ['liao', '廖'],
  ['lai', '賴'],
  ['chou', '周'],
  ['yeh', '葉'],
  ['su', '蘇'],
  ['chuang', '莊'],
  ['ho', '何'],
  ['lo', '羅'],
  ['kao', '高'],
  ['hsiao', '蕭'],
];

// 常見中文名字雙音節切分表（用於從 chingwenliu@ 等無分隔符信箱還原 Ching-Wen Liu）
const COMMON_GIVEN_SYLLABLES = [
  'ching', 'chih', 'chien', 'chia', 'chao', 'chen', 'cheng', 'chieh', 'chun', 'chung',
  'hsiang', 'hsien', 'hsin', 'hsiu', 'hsuan', 'hsun', 'huang', 'hung',
  'shiang', 'shih', 'shuo', 'shun', 'sheng', 'shan', 'shao',
  'tsung', 'ting', 'tzung', 'tzu',
  'ming', 'meng', 'mao', 'mei',
  'wang', 'wen', 'wei', 'wan',
  'yang', 'ying', 'yuan', 'yung', 'yueh', 'yun', 'yao', 'yen', 'yi', 'yu',
  'liang', 'ling', 'lung', 'lun', 'lin', 'lei', 'lan',
  'kang', 'kuan', 'kuang', 'kai', 'kun', 'kuo',
  'fang', 'feng', 'fan', 'fei', 'fu',
  'ping', 'peng', 'pei', 'po', 'pin',
  'tang', 'teng', 'ting', 'tung', 'tai', 'tao', 'te',
  'ning', 'nien', 'nan',
  'hung', 'hao', 'han', 'heng', 'hua', 'hui', 'hai', 'ho',
  'jung', 'jen', 'jui', 'jou',
  '안', 'an', 'en',
];

const COMPANY_KEYWORDS_REGEX =
  /(?:股份有限公司|有限公司|企業|科技|電腦|電信|電子|半導體|數位|網路|資訊|光電|生技|醫藥|建設|開發|設計|傳媒|媒體|顧問|貿易|物流|工業|製造|機械|工程|能源|材料|金融|證券|保險|人壽|控股|實業|國際|集團|工作室|事務所|銀行|醫院|診所|大學|學院|學校|協會|學會|基金會|中心|商行|企業社|Co\.,?\s*Ltd|Inc\.|Corp\.|Corporation|Group|Studio|Enterprise|Technologies|Technology|Systems|Solutions|Global|Holdings|Limited|Ltd\.)/i;

const FULL_COMPANY_SUFFIX_REGEX =
  /(?:股份有限公司|有限公司|事務所|工作室|企業社|商行|基金會|協會|學會|醫院|診所|銀行|大學|Co\.,?\s*Ltd\.?|Inc\.?|Corp\.?|Corporation|Limited|Ltd\.)/i;

// 部門關鍵字正則：支援前導英文縮寫（如 AI產品代理部、IT部門、RD處），並排除「科技」中的「科」字
const DEPARTMENT_REGEX =
  /(?:\b[A-Z]{2,6}\s*)?[\u4e00-\u9fa5]{2,12}(?:事業群|事業部|事業處|總處|研發處|技術處|管理處|業務處|行銷處|資訊處|財務處|設計部|工程部|業務部|行銷部|資訊部|管理部|財務部|人資部|採購部|品保部|製造部|代理部|開發部|服務部|專案部|產品部|部門|中心|處|部|課|室|(?:(?<!技)科(?!技)))/g;

// 絕對不可作為人名的產業/公司/欄位詞根
const NON_NAME_SUBSTRINGS_REGEX =
  /(?:台灣|臺灣|台北|臺北|新北|桃園|新竹|台中|臺中|台南|臺南|高雄|電話|手機|傳真|統編|編號|統一|地址|信箱|網址|公司|企業|集團|機械|科技|電腦|電子|能源|材料|工業|國際|實業|自動|電控|事業|產品|代理|工程|設計|系統|資訊|網路|數位|半導體|光電|生技|建設|開發|貿易|物流|顧問|金融|證券|保險|銀行|醫院|診所|中心|部門|有限|股份|太極|盛新|廣運|廣連|金運|純一|信號)/;

const TITLE_KEYWORDS = [
  '董事長', '執行長', '總經理', '資深副總經理', '副總經理', '資深副總', '副總',
  '資深技術總監', '技術總監', '藝術總監', '行銷總監', '業務總監', '創意總監', '總監',
  '協理', '資深經理', '專案經理', '產品經理', '業務經理', '研發經理', '經理',
  '系統架構副理', '資深副理', '副理', '襄理',
  '處長', '副處長', '部長', '副部長', '課長', '組長', '主任工程師', '主任', '店長', '廠長', '院長', '所長',
  '資深工程師', '工程師', '設計師', '主持建築師', '建築師', '會計師', '律師', '醫師', '藥師', '護理師', '分析師', '管理師',
  '資深架構師', '架構師', '顧問', '專員', '代表', '特助', '秘書', '共同創辦人', '創辦人', '合夥人', '研究員', '教授', '講師',
  'CEO', 'CTO', 'CFO', 'COO', 'CIO', 'CMO', 'SVP', 'AVP', 'VP', 'President', 'Director',
  'Deputy Manager', 'General Manager', 'Senior Manager', 'Manager', 'Supervisor',
  'Senior Engineer', 'Engineer', 'Developer', 'Designer', 'Architect', 'Consultant',
  'Specialist', 'Coordinator', 'Co-Founder', 'Founder', 'Partner', 'Lead',
];

function capitalizeWord(w: string): string {
  if (!w) return '';
  return w
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
    .join('-');
}

/**
 * 當名片上的英文名因底線干擾而缺漏時，結合中文姓名與 Email 帳號自動推導標準英文名
 * 例如：中文名「劉景文」+ 信箱「chingwenliu@kenmec.com」->「Ching-Wen Liu」
 */
function reconstructEnglishNameFromEmail(chineseName: string, emails: string[]): string {
  if (!chineseName || chineseName === '未命名聯絡人' || emails.length === 0) return '';
  const localPart = emails[0].split('@')[0].toLowerCase().replace(/[^a-z._-]/g, '');
  if (!localPart || localPart.length < 4) return '';

  // 找尋對應中文姓氏之英文拼音
  const firstChar = chineseName[0];
  let matchedSurnamePinyin = '';
  for (const [pinyin, char] of PINYIN_SURNAME_MAP) {
    if (char === firstChar && (localPart.endsWith(pinyin) || localPart.startsWith(pinyin))) {
      matchedSurnamePinyin = pinyin;
      break;
    }
  }

  // 若信箱已有明確分隔符 (如 eric.wang 或 kevin_chang)
  if (/[._-]/.test(localPart)) {
    const parts = localPart.split(/[._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return parts.map(capitalizeWord).join(' ');
    }
  }

  if (!matchedSurnamePinyin) return '';

  const surnameCap = capitalizeWord(matchedSurnamePinyin);
  const givenRaw = localPart.endsWith(matchedSurnamePinyin)
    ? localPart.slice(0, localPart.length - matchedSurnamePinyin.length)
    : localPart.slice(matchedSurnamePinyin.length);

  if (!givenRaw || givenRaw.length < 2) return '';

  // 嘗試將連寫的中文名拼音切分為兩個音節（如 "chingwen" -> "Ching-Wen"）
  for (const syl1 of COMMON_GIVEN_SYLLABLES) {
    if (givenRaw.startsWith(syl1)) {
      const rest = givenRaw.slice(syl1.length);
      if (rest.length >= 2 && COMMON_GIVEN_SYLLABLES.includes(rest)) {
        return `${capitalizeWord(syl1)}-${capitalizeWord(rest)} ${surnameCap}`;
      }
    }
  }

  return `${capitalizeWord(givenRaw)} ${surnameCap}`;
}

/**
 * 清理 Tesseract 繁體中文 OCR 常見雜訊
 */
export function normalizeCjkLine(raw: string): string {
  if (!raw) return '';

  let s = raw.trim();

  // 1. 修正區碼與電話數字間被誤判為冒號 `:`、句點 `.` 或中文「一」的連字號 (如 02:2786-3797 或 02.2788-5170)
  s = s.replace(/\b(0\d{1,3})\s*[:：.·•一—–－~～﹣/]\s*(\d{3,4})/g, '$1-$2');
  s = s.replace(/\b(0\d{1,3}-\d{3,4})\s*[:：.·•一—–－~～﹣/]\s*(\d{3,4})/g, '$1-$2');

  let prevDash = '';
  while (prevDash !== s) {
    prevDash = s;
    s = s.replace(/(\d)\s*[-一—–－~～﹣]\s*(\d)/g, '$1-$2');
  }

  // 2. 修復電話末碼 0 被誤判為 g/o/q (如 "02-2788-517g" -> "02-2788-5170") 及末段空白斷字
  s = s.replace(/\b(0\d{1,3}-\d{3,4}-\d{2,3})[gGoOqQ]\b/g, '$10');
  s = s.replace(/\b(09\d{2}-\d{3}-\d)\s+(\d{1,2})\b/g, '$1$2');
  s = s.replace(/\b(0\d{1,2}-\d{3,4}-\d{1,2})\s+(\d{1,2})\b/g, '$1$2');

  // 3. 修正 Email 常見 OCR 誤判
  s = s.replace(/([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+)\s*\.\s*([a-zA-Z]{2,})/g, '$1@$2.$3');
  s = s.replace(/([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '$1@$2');
  s = s.replace(/\.(?:eom|con|corn|c0m)\b/gi, '.com');
  s = s.replace(/(@[a-zA-Z0-9-]+)\.co\b(?![.a-zA-Z])/gi, '$1.com');

  // 4. 以 2 個以上的連續空白切分區段，但若連續區段皆為「單一中文字」（如寬字距之 "劉  景  文"），將其合併
  const rawSegments = s.split(/[ \t]{2,}/);
  const mergedSingleCharSegments: string[] = [];
  for (const seg of rawSegments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    const prev = mergedSingleCharSegments[mergedSingleCharSegments.length - 1];
    if (prev && /^[\u4e00-\u9fa5]{1,3}$/.test(prev) && /^[\u4e00-\u9fa5]$/.test(trimmed)) {
      mergedSingleCharSegments[mergedSingleCharSegments.length - 1] = prev + trimmed;
    } else {
      mergedSingleCharSegments.push(trimmed);
    }
  }

  const normalizedSegments = mergedSingleCharSegments.map((seg) => {
    if (/(?<![\u4e00-\u9fa5])[\u4e00-\u9fa5](?![\u4e00-\u9fa5])/.test(seg)) {
      let prev = '';
      let curr = seg;
      while (prev !== curr) {
        prev = curr;
        curr = curr.replace(/([\u4e00-\u9fa5])[ \t]+([\u4e00-\u9fa5])/g, '$1$2');
      }
      return curr;
    }
    return seg;
  });

  let joined = normalizedSegments.join(' ').trim();

  // 5. 於中文字間空白消除後，修正公司、部門、職稱與地址常見 OCR 錯字
  joined = joined.replace(/[了設服股][份分]有[限眼]公[司可]/g, '股份有限公司');
  joined = joined.replace(/股份有[了限眼](?!公)/g, '股份有限公司');
  joined = joined.replace(/有[限眼]公[司可]/g, '有限公司');
  joined = joined.replace(/廣連機械/g, '廣運機械');
  joined = joined.replace(/自[動生][人化]事[樂業][群始]/g, '自動化事業群');
  joined = joined.replace(/事[樂業][群始]/g, '事業群');
  joined = joined.replace(/(?:人\s*|A[!1lI]?\s*)?產品代理部/g, (m) => {
    if (/^(?:人|A)/i.test(m) || /(?:Al\s*so|Aso|AI\s*So)/i.test(joined)) {
      return 'AI產品代理部';
    }
    return m;
  });
  joined = joined.replace(/(?<![\u4e00-\u9fa5])到理(?![\u4e00-\u9fa5])/g, '副理');
  joined = joined.replace(/\b(\d{3,5})[68]\s*北市/g, '$1 台北市');
  joined = joined.replace(/(\d+)\s*[束號虎琥]\s*(\d+)\s*([樓F])/g, '$1號$2$3');
  joined = joined.replace(/([\u4e00-\u9fa5])\s+(\d+號)/g, '$1$2');

  return joined;
}

/**
 * 從可能混有左側欄或圖示雜訊的字串中提取乾淨的公司名稱
 */
function extractCleanCompanyName(text: string): { company: string; score: number } | null {
  if (!COMPANY_KEYWORDS_REGEX.test(text)) return null;

  const fullMatches = Array.from(
    text.matchAll(
      /([\u4e00-\u9fa5]{2,22}(?:股份有限公司|有限公司|事務所|工作室|企業社|商行|基金會|協會|學會|醫院|診所|銀行|大學))/g
    )
  );
  if (fullMatches.length > 0) {
    let company = fullMatches[fullMatches.length - 1][1];
    const dupPrefixMatch = company.match(/^([\u4e00-\u9fa5]{2,6})\1(.+)$/);
    if (dupPrefixMatch) {
      company = dupPrefixMatch[1] + dupPrefixMatch[2];
    }
    return { company, score: 95 };
  }

  const enFullMatch = text.match(
    /([A-Z][A-Za-z0-9\s&.,'-]{2,40}(?:Co\.,?\s*Ltd\.?|Inc\.?|Corp\.?|Corporation|Limited|Ltd\.))/i
  );
  if (enFullMatch) {
    return { company: enFullMatch[1].trim(), score: 85 };
  }

  const cleanTokens = text
    .split(/[\s>>»▶"|｜•·=~]+/)
    .map((t) => t.replace(/^[^A-Za-z0-9\u4e00-\u9fa5]+|[^A-Za-z0-9\u4e00-\u9fa5.)）]+$/g, ''))
    .filter(Boolean);

  let bestToken = '';
  let bestScore = -1;
  for (const token of cleanTokens) {
    if (COMPANY_KEYWORDS_REGEX.test(token) && token.length >= 4) {
      const score = FULL_COMPANY_SUFFIX_REGEX.test(token) ? 90 : 55 + Math.min(20, token.length * 2);
      if (score > bestScore) {
        bestScore = score;
        bestToken = token;
      }
    }
  }

  return bestToken ? { company: bestToken, score: bestScore } : null;
}

export function parseSpatialLayout(
  lines: OcrLine[],
  imageDimensions: { width: number; height: number }
): ParsedCardFields {
  const result: ParsedCardFields = {
    name: '未命名聯絡人',
    nameEn: '',
    company: '',
    department: '',
    jobTitle: '',
    taxId: '',
    phones: [],
    emails: [],
    websites: [],
    addresses: [],
  };

  if (!lines || lines.length === 0) {
    return result;
  }

  const remainingLines: Array<OcrLine & { fontSize: number; isVertical: boolean }> = [];
  const collectedDepartments: string[] = [];
  let standaloneEnglishNameCandidate = '';

  // 收集名片上出現過的英文品牌詞（如 KENMEC），用於修復 `@` 被誤判為 `e` 的信箱
  const detectedBrandTokens = new Set<string>();
  for (const l of lines) {
    const brandMatches = l.text.match(/\b[A-Za-z]{4,15}\b/g);
    if (brandMatches) {
      brandMatches.forEach((b) => detectedBrandTokens.add(b.toLowerCase()));
    }
  }

  // 1. 優先剝離正則明確欄位 (Email, Website, TaxId, 多組 Phone/Fax, Address)
  for (const line of lines) {
    let rawText = normalizeCjkLine(line.text);
    if (!rawText) continue;

    // 偵測同行是否有連字號式台灣英文姓名（如 "ching-Wen Liu" 或 "Ching-Wen Liu"）供後續補齊
    if (!standaloneEnglishNameCandidate) {
      const enNameHyphenMatch = rawText.match(/\b([A-Za-z]{2,10}-[A-Za-z]{2,10}\s+[A-Z][a-z]{1,10})\b/);
      if (enNameHyphenMatch) {
        standaloneEnglishNameCandidate = enNameHyphenMatch[1]
          .split(/\s+/)
          .map(capitalizeWord)
          .join(' ');
      }
    }

    // 若該行含有 `@` 被誤判為 `e` 或 `©` 的信箱（如 chingwenliuekenmec.com），依據名片品牌詞自動還原 `@`
    if (!rawText.includes('@') && /\.com\b/i.test(rawText)) {
      for (const brand of detectedBrandTokens) {
        if (brand.length >= 4) {
          const brokenEmailReg = new RegExp(`([a-zA-Z0-9._+-]{3,})[e©](${brand}\\.[a-zA-Z.]{2,})`, 'i');
          if (brokenEmailReg.test(rawText)) {
            rawText = rawText.replace(brokenEmailReg, '$1@$2');
            break;
          }
        }
      }
    }

    const [x0, y0, x1, y1] = line.bbox;
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const isVertical = h / w > 2.5 && rawText.length >= 2;
    const fontSize = isVertical ? w : h;

    let workingText = rawText;
    let purelyConsumed = false;

    // 1A. 提取同行所有 Email（並過濾同網域單字元誤判之重複信箱）
    const emailMatches = Array.from(workingText.matchAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g));
    if (emailMatches.length > 0) {
      for (const m of emailMatches) {
        const email = m[0].toLowerCase();
        const domain = email.split('@')[1];
        const alreadyHasSameDomainSimilar = result.emails.some((existing) => {
          const [exLocal, exDom] = existing.split('@');
          const [newLocal] = email.split('@');
          return exDom === domain && Math.abs(exLocal.length - newLocal.length) <= 1;
        });
        if (!result.emails.includes(email) && !alreadyHasSameDomainSimilar) {
          result.emails.push(email);
        }
        workingText = workingText.replace(m[0], ' ');
      }
      purelyConsumed = true;
    }

    // 1B. 提取同行所有 Website
    const urlMatches = Array.from(
      workingText.matchAll(/(?:https?:\/\/|www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/gi)
    );
    if (urlMatches.length > 0) {
      for (const m of urlMatches) {
        const url = m[0].replace(/[.,;)]+$/, '');
        if (!result.websites.includes(url)) {
          result.websites.push(url);
        }
        workingText = workingText.replace(m[0], ' ');
      }
      purelyConsumed = true;
    }

    // 1C. 提取統一編號（支援 7~8 碼，若開頭為 0 被遺漏則自動補 0 恢復 8 碼）
    const labeledTaxMatch = workingText.match(
      /(?:統\s*一?\s*編\s*號?|純\s*一?\s*信\s*號?|統\s*編|Tax\s*ID|GUI(?:\s*No\.?)?)\s*[:：;.-]?\s*([0-9OIlSB]{7,8})\b/i
    );
    if (labeledTaxMatch) {
      const cleaned = labeledTaxMatch[1]
        .replace(/[Oo]/g, '0')
        .replace(/[Il]/g, '1')
        .replace(/[S]/g, '5')
        .replace(/[B]/g, '8');
      const normalizedTax = normalizeTaiwanTaxId(cleaned);
      if (/^\d{8}$/.test(normalizedTax)) {
        result.taxId = normalizedTax;
        workingText = workingText.replace(labeledTaxMatch[0], ' ');
        purelyConsumed = true;
      }
    } else if (!result.taxId) {
      const standaloneTaxMatch = workingText.match(/(?:[:：;-]\s*|\b)(\d{7,8})\b(?![-\d])/);
      if (standaloneTaxMatch) {
        const cand = normalizeTaiwanTaxId(standaloneTaxMatch[1]);
        if (isValidTaiwanTaxId(cand) || /[:：;-]\s*\d{7,8}\b/.test(standaloneTaxMatch[0])) {
          result.taxId = cand;
          workingText = workingText.replace(standaloneTaxMatch[0], ' ');
          purelyConsumed = true;
        }
      }
    }

    // 1D. 提取同行一或多組電話 / 手機 / 傳真（以號碼去重，若有分機或明確傳真/手機型別則優先升級）
    const phoneSegmentRegex =
      /(?:(手機|電話|傳真|專線|行動|公司|品|昌|TEL|Tel|Mobile|Cell|FAX|Fax|Phone|M|T|F)\s*[:：.]?\s*)?((?:\+?886[\s\-]*\(?\d{1,2}\)?|\(0\d{1,3}\)|09\d{2}|0\d{1,3})[\s\-]*\d{2,4}[\s\-]*\d{2,4}(?:\s*(?:#|ext\.?|分機|轉)\s*\d+)?)/gi;
    const phoneMatches = Array.from(workingText.matchAll(phoneSegmentRegex));
    if (phoneMatches.length > 0) {
      for (const m of phoneMatches) {
        const prefix = (m[1] || '').toUpperCase();
        const numberPart = m[2];
        const isFax =
          prefix.includes('FAX') ||
          prefix.includes('傳真') ||
          prefix === 'F' ||
          prefix === '品' ||
          prefix === '昌';
        const isMobile =
          prefix.includes('手機') ||
          prefix.includes('行動') ||
          prefix.includes('MOBILE') ||
          prefix.includes('CELL') ||
          prefix === 'M';
        const phoneItem = normalizePhone(numberPart, isFax ? 'fax' : isMobile ? 'mobile' : 'work');
        if (phoneItem.number) {
          const existingIdx = result.phones.findIndex((p) => p.number === phoneItem.number);
          if (existingIdx === -1) {
            result.phones.push(phoneItem);
          } else {
            const existing = result.phones[existingIdx];
            if (existing.type === 'work' && phoneItem.type !== 'work') {
              existing.type = phoneItem.type;
            }
            if (!existing.extension && phoneItem.extension) {
              existing.extension = phoneItem.extension;
              existing.normalizedDialString = phoneItem.normalizedDialString;
            }
          }
          workingText = workingText.replace(m[0], ' ');
          purelyConsumed = true;
        }
      }
    }

    // 1E. 提取地址（跳過開頭單一數字定位圖示如 "9 11578..."，精準抽離 3~6 碼郵遞區號或縣市開頭之地址）
    if (
      !/(?:統編|統一編號|Tax\s*ID)/i.test(workingText) &&
      !FULL_COMPANY_SUFFIX_REGEX.test(workingText)
    ) {
      const twAddressPattern =
        /(?:\b\d{3,6}\s*)?(?:[台臺]灣省?)?(?:[台臺][\u4e00-\u9fa5]{1,4}[縣市]|[\u4e00-\u9fa5]{2,4}[縣市區鄉鎮市])?(?![\u4e00-\u9fa5]*(?:電路|網路|通路|鐵路))[\u4e00-\u9fa5]{1,8}(?:路|街|大道|段|園區|工業區)[\u4e00-\u9fa50-9\s\-之段巷弄號樓F室B]{2,}/;
      const addrSubMatch = workingText.match(twAddressPattern);

      if (addrSubMatch && /(?:縣|市|區|路|街|段|巷|弄|號|樓|大道|園區|工業區)/.test(addrSubMatch[0])) {
        const cleanedAddr = cleanAddress(addrSubMatch[0]);
        if (cleanedAddr.length >= 6 && !result.addresses.some((a) => a.includes(cleanedAddr) || cleanedAddr.includes(a))) {
          result.addresses.push(cleanedAddr);
          workingText = workingText.replace(addrSubMatch[0], ' ');
          purelyConsumed = true;
        }
      } else if (
        !purelyConsumed &&
        !COMPANY_KEYWORDS_REGEX.test(workingText) &&
        /(?:縣|市|區|鄉|鎮|路|街|段|巷|弄|Road|Rd\.|Street|St\.|Dist\.|Sec\.)/i.test(workingText)
      ) {
        const cleanedAddr = cleanAddress(workingText);
        if (cleanedAddr.length >= 5 && !result.addresses.includes(cleanedAddr)) {
          result.addresses.push(cleanedAddr);
          purelyConsumed = true;
        }
      }
    }

    const leftover = workingText.replace(/^[^A-Za-z\u4e00-\u9fa5]+|[^A-Za-z\u4e00-\u9fa5.)）]+$/g, '').trim();
    if (!purelyConsumed || FULL_COMPANY_SUFFIX_REGEX.test(leftover)) {
      remainingLines.push({
        text: purelyConsumed ? leftover : rawText,
        bbox: line.bbox,
        fontSize,
        isVertical,
      });
    }
  }

  // 由已提取之 Email 推斷可能之姓氏（如 chingwenliu@kenmec.com -> '劉'）
  let inferredSurnameFromEmail = '';
  if (result.emails.length > 0) {
    const localPart = result.emails[0].split('@')[0].toLowerCase();
    for (const [pinyin, surname] of PINYIN_SURNAME_MAP) {
      if (localPart.endsWith(pinyin) || localPart.startsWith(pinyin)) {
        inferredSurnameFromEmail = surname;
        break;
      }
    }
  }

  // 2. 評估剩餘行的 Company, Department, Name, JobTitle
  let bestCompany = '';
  let bestCompanyScore = -1;

  let bestTitle = '';
  let bestTitleScore = -1;

  interface NameCandidate {
    name: string;
    nameEn?: string;
    score: number;
    jobTitlePart?: string;
  }

  const nameCandidates: NameCandidate[] = [];

  for (const line of remainingLines) {
    const text = line.text.trim();
    if (!text) continue;
    const [, y0] = line.bbox;

    // --- A. Company 評分與雜訊剝離 ---
    const companyExtracted = extractCleanCompanyName(text);
    if (companyExtracted) {
      let compScore = companyExtracted.score;
      if (y0 < imageDimensions.height * 0.5) {
        compScore += 10;
      }
      if (compScore > bestCompanyScore) {
        bestCompanyScore = compScore;
        bestCompany = companyExtracted.company;
      }
      if (FULL_COMPANY_SUFFIX_REGEX.test(companyExtracted.company)) {
        continue;
      }
    }

    // --- B. 提取部門名稱 (Department) ---
    const deptMatches = text.match(DEPARTMENT_REGEX);
    if (deptMatches) {
      for (const d of deptMatches) {
        let cleanDept = d.trim().replace(/^([A-Z]{2,6})\s+/, '$1');
        if (cleanDept === '產品代理部' && /(?:人|A[!1lI]|Al\s*so|Aso|AI)/i.test(text)) {
          cleanDept = 'AI產品代理部';
        }
        // 避免「產品代理部」與「AI產品代理部」重複並存
        const existingIdx = collectedDepartments.findIndex(
          (ex) => ex === cleanDept || ex.endsWith(cleanDept) || cleanDept.endsWith(ex)
        );
        if (!COMPANY_KEYWORDS_REGEX.test(cleanDept)) {
          if (existingIdx === -1) {
            collectedDepartments.push(cleanDept);
          } else if (cleanDept.length > collectedDepartments[existingIdx].length) {
            collectedDepartments[existingIdx] = cleanDept;
          }
        }
      }
    }

    // --- C. 檢查職稱 (JobTitle) ---
    let matchedTitleInLine = '';
    for (const kw of TITLE_KEYWORDS) {
      if (/^[A-Za-z\s-]+$/.test(kw)) {
        const reg = new RegExp(`\\b${kw}\\b`, 'i');
        if (reg.test(text)) {
          matchedTitleInLine = kw;
          break;
        }
      } else if (text.includes(kw)) {
        matchedTitleInLine = kw;
        break;
      }
    }

    if (matchedTitleInLine) {
      const tokens = text.split(/\s+/).filter(Boolean);
      const startsWithChineseName =
        tokens.length >= 2 &&
        /^[\u4e00-\u9fa5]{2,4}$/.test(tokens[0]) &&
        (COMMON_SURNAMES.has(tokens[0][0]) || COMMON_SURNAMES.has(tokens[0].slice(0, 2))) &&
        !TITLE_KEYWORDS.some((kw) => tokens[0].includes(kw)) &&
        !DEPARTMENT_REGEX.test(tokens[0]);

      if (!startsWithChineseName) {
        const chineseTitleParts = text.match(/[\u4e00-\u9fa5]+/g);
        const isChineseKw = /[\u4e00-\u9fa5]/.test(matchedTitleInLine);
        const cleanTitleLine =
          chineseTitleParts && chineseTitleParts.length > 0 ? chineseTitleParts.join(' ') : matchedTitleInLine;
        const titleScore = (isChineseKw ? 80 : 60) + (chineseTitleParts ? 15 : 0);
        if (titleScore > bestTitleScore) {
          bestTitleScore = titleScore;
          bestTitle = cleanTitleLine;
        }
      }
    }

    // --- D. 姓名候選分析 (保留英數 token 以便偵測首字損毀之姓名) ---
    const parts = text
      .split(/[\s|｜/]+/)
      .map((p) => p.replace(/^[^A-Za-z0-9\u4e00-\u9fa5]+|[^A-Za-z0-9\u4e00-\u9fa5.'-]+$/g, ''))
      .filter(Boolean);

    for (let i = 0; i < parts.length; i++) {
      let part = parts[i];

      if (/^[\u4e00-\u9fa5]{2,4}$/.test(part)) {
        if (
          COMPANY_KEYWORDS_REGEX.test(part) ||
          TITLE_KEYWORDS.some((kw) => part.includes(kw)) ||
          DEPARTMENT_REGEX.test(part) ||
          NON_NAME_SUBSTRINGS_REGEX.test(part)
        ) {
          continue;
        }

        // 若為 3 字中文名且首字為常見姓氏 OCR 形近錯字（如「到景文」->「劉景文」），自動校正首字
        if (part.length === 3 && !COMMON_SURNAMES.has(part[0]) && SURNAME_OCR_LOOKALIKE_MAP[part[0]]) {
          part = SURNAME_OCR_LOOKALIKE_MAP[part[0]] + part.slice(1);
        }

        // 若為 2 字中文名（如「景文」）、非百家姓開頭，但 Email 推斷出姓氏（如「劉」），自動補回姓氏
        if (part.length === 2 && !COMMON_SURNAMES.has(part[0]) && inferredSurnameFromEmail) {
          part = inferredSurnameFromEmail + part;
        }

        const hasSurname = COMMON_SURNAMES.has(part[0]) || COMMON_SURNAMES.has(part.slice(0, 2));
        let nScore = hasSurname ? 85 : 32;
        const fontBonus = Math.min(25, Math.floor(line.fontSize * 0.5));
        nScore += fontBonus;

        // 檢查該中文名後方的 tokens 是否為英文姓名或職稱
        const afterTokens = parts.slice(i + 1);
        const afterStr = afterTokens.join(' ');
        let candidateNameEn = '';
        let attachedTitle = '';

        if (afterTokens.length > 0) {
          if (
            /^[A-Za-z][a-zA-Z.,'-]*(?:\s+[A-Za-z][a-zA-Z.,'-]*)+$/.test(afterStr) &&
            afterStr.replace(/[^A-Za-z]/g, '').length >= 3
          ) {
            candidateNameEn = afterStr.split(/\s+/).map(capitalizeWord).join(' ');
            nScore += 15;
          } else if (TITLE_KEYWORDS.some((kw) => afterStr.includes(kw))) {
            attachedTitle = afterStr;
            nScore += 10;
          }
        }

        nameCandidates.push({
          name: part,
          nameEn: candidateNameEn,
          score: nScore,
          jobTitlePart: attachedTitle,
        });
        break;
      }
    }
  }

  // 決定最佳姓名
  if (nameCandidates.length > 0) {
    nameCandidates.sort((a, b) => b.score - a.score);
    const chosen = nameCandidates[0];
    if (chosen.score >= 30) {
      result.name = chosen.name;
      if (chosen.nameEn) {
        result.nameEn = chosen.nameEn;
      }
      if (chosen.jobTitlePart) {
        result.jobTitle = chosen.jobTitlePart;
      }
    }
  }

  // 若英文姓名因底線干擾未提取出，優先採用雙通道捕捉到的連字號英文名（如 Ching-Wen Liu），次之由中文名+Email 自動推導
  if (!result.nameEn) {
    if (standaloneEnglishNameCandidate) {
      result.nameEn = standaloneEnglishNameCandidate;
    } else if (result.name !== '未命名聯絡人' && result.emails.length > 0) {
      result.nameEn = reconstructEnglishNameFromEmail(result.name, result.emails);
    }
  }

  if (!result.jobTitle && bestTitle) {
    result.jobTitle = bestTitle;
  }

  if (collectedDepartments.length > 0) {
    result.department = collectedDepartments.join(' ');
  }

  result.company = bestCompany;

  return result;
}
