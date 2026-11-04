import { PhoneItem } from '../../types/contact';

/**
 * 台灣統一編號正規化 (8 碼數字)
 * 若輸入為 7 碼純數字 (例如被 Excel 誤當數值吞掉開頭 0，或 OCR 遺漏前導 0)，自動補齊為 8 碼 '0xxxxxxx'
 */
export function normalizeTaiwanTaxId(raw: string | number | undefined | null): string {
  if (raw === undefined || raw === null) return '';
  const cleaned = String(raw).trim().replace(/[^\d]/g, '');
  if (!cleaned) return '';
  if (cleaned.length === 7) {
    return cleaned.padStart(8, '0');
  }
  return cleaned;
}

/**
 * 台灣統一編號 2023 新制 (Mod 5) 檢核演算法
 * 同時相容舊制 (Mod 10，因能整除 10 必能整除 5)
 */
export function isValidTaiwanTaxId(taxId: string): boolean {
  const norm = normalizeTaiwanTaxId(taxId);
  if (!/^\d{8}$/.test(norm)) {
    return false;
  }

  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  let sumOthers = 0;
  let s6 = 0;

  for (let i = 0; i < 8; i++) {
    const digit = parseInt(norm[i], 10);
    const prod = digit * weights[i];
    const sumDigits = Math.floor(prod / 10) + (prod % 10);

    if (i === 6) {
      s6 = sumDigits;
    } else {
      sumOthers += sumDigits;
    }
  }

  if (norm[6] === '7') {
    // 第 7 碼為 7 時，乘積為 28 (2+8=10)，權重和可取 0 或 1
    return (sumOthers + 0) % 5 === 0 || (sumOthers + 1) % 5 === 0;
  } else {
    return (sumOthers + s6) % 5 === 0;
  }
}

/**
 * 電話與分機正規化
 */
export function normalizePhone(raw: string, typeHint: PhoneItem['type'] = 'work'): PhoneItem {
  if (!raw) {
    return {
      type: typeHint,
      number: '',
      normalizedDialString: '',
    };
  }

  let text = raw.trim();
  let extension: string | undefined;

  // 1. 提取分機 (例如: #101, ext 20, ext. 9, 分機 205, 轉 123)
  const extRegex = /(?:(?:#|ext\.?|分機|轉)\s*)(\d+)(?:[\/~-]\d+)?$/i;
  const extMatch = text.match(extRegex);
  if (extMatch) {
    extension = extMatch[1];
    text = text.replace(extRegex, '').trim();
  }

  // 2. 清除非數字與非+字元，但保留用於格式化的資訊
  const cleanDigits = text.replace(/[^\d+]/g, '');

  // 3. 判斷台灣手機 (09xx-xxx-xxx 或 +886 9xx...)
  const twMobileMatch = cleanDigits.match(/^(?:\+?886|0)9(\d{2})(\d{3})(\d{3})$/);
  if (twMobileMatch) {
    const p1 = twMobileMatch[1];
    const p2 = twMobileMatch[2];
    const p3 = twMobileMatch[3];
    const displayNum = `09${p1}-${p2}-${p3}`;
    const dialStr = `+886-9${p1}-${p2}-${p3}${extension ? `,${extension}` : ''}`;
    return {
      type: 'mobile',
      number: displayNum,
      extension,
      normalizedDialString: dialStr,
    };
  }

  // 4. 判斷台灣市話區碼
  // 3/4 碼優先，再比對 2 碼
  const specialAreas = ['0836', '037', '049', '082', '089'];
  const twoDigitAreas = ['02', '03', '04', '05', '06', '07', '08'];

  let matchedArea = '';
  let localNum = '';

  // 檢查去碼後純數字
  let digitsOnly = cleanDigits.startsWith('+886')
    ? '0' + cleanDigits.slice(4)
    : cleanDigits.replace(/^\+/, '');

  for (const area of specialAreas) {
    if (digitsOnly.startsWith(area)) {
      matchedArea = area;
      localNum = digitsOnly.slice(area.length);
      break;
    }
  }

  if (!matchedArea) {
    for (const area of twoDigitAreas) {
      if (digitsOnly.startsWith(area)) {
        matchedArea = area;
        localNum = digitsOnly.slice(area.length);
        break;
      }
    }
  }

  if (matchedArea && localNum.length >= 6) {
    const areaWithoutZero = matchedArea.replace(/^0/, '');
    // 格式化為 4-4 或 3-3 等
    const formattedLocal = localNum.length === 8
      ? `${localNum.slice(0, 4)}-${localNum.slice(4)}`
      : localNum;

    const displayNum = `${matchedArea}-${formattedLocal}`;
    const dialStr = `+886-${areaWithoutZero}-${formattedLocal}${extension ? `,${extension}` : ''}`;

    return {
      type: typeHint === 'fax' ? 'fax' : 'work',
      number: displayNum,
      extension,
      normalizedDialString: dialStr,
    };
  }

  // 5. 外國或其他電話
  const dialStr = `${cleanDigits}${extension ? `,${extension}` : ''}`;
  return {
    type: typeHint,
    number: text,
    extension,
    normalizedDialString: dialStr,
  };
}

/**
 * 地址前綴清洗
 */
export function cleanAddress(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^.*?(?:總公司|分公司|公司地址|台北公司|營業所|聯絡處|工廠地址|工廠|門市|地址|Address|ADD)[：:\s]+/i, '')
    .trim();
}
