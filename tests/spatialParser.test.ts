import { describe, it, expect } from 'vitest';
import { parseSpatialLayout, OcrLine } from '../src/services/ocr/spatialParser';

describe('2D 空間幾何欄位解析大腦 (spatialParser)', () => {
  it('應正確解析標準橫書名片之公司、姓名、職稱、統編、電話與地址', () => {
    // 模擬一張 900x540 的標準名片
    const lines: OcrLine[] = [
      {
        text: '台灣積體電路製造股份有限公司',
        bbox: [50, 40, 450, 70], // h = 30
      },
      {
        text: '王智翔 Eric Wang',
        bbox: [50, 120, 300, 170], // h = 50 (字體最大)
      },
      {
        text: '研發處 資深副總經理',
        bbox: [50, 180, 260, 205], // h = 25
      },
      {
        text: '統一編號：22099131',
        bbox: [50, 380, 220, 400],
      },
      {
        text: '手機: 0912-345-678',
        bbox: [50, 410, 250, 430],
      },
      {
        text: '電話: (03) 567-8888 #1234',
        bbox: [50, 440, 310, 460],
      },
      {
        text: 'Email: eric.wang@tsmc.com',
        bbox: [50, 470, 320, 490],
      },
      {
        text: '新竹科學園區新竹市東區力行六路8號',
        bbox: [50, 500, 480, 520],
      },
    ];

    const result = parseSpatialLayout(lines, { width: 900, height: 540 });

    expect(result.company).toBe('台灣積體電路製造股份有限公司');
    expect(result.name).toBe('王智翔');
    expect(result.nameEn).toBe('Eric Wang');
    expect(result.jobTitle).toBe('研發處 資深副總經理');
    expect(result.taxId).toBe('22099131');
    expect(result.emails).toContain('eric.wang@tsmc.com');
    expect(result.phones.some((p) => p.type === 'mobile' && p.number === '0912-345-678')).toBe(true);
    expect(result.phones.some((p) => p.extension === '1234')).toBe(true);
    expect(result.addresses[0]).toContain('新竹市東區');
  });

  it('應正確解析同一行同時含有姓名與職稱的情況', () => {
    const lines: OcrLine[] = [
      {
        text: '聯發科技股份有限公司',
        bbox: [60, 50, 380, 80],
      },
      {
        text: '陳建宏 系統架構副理',
        bbox: [60, 140, 350, 190], // h = 50
      },
    ];

    const result = parseSpatialLayout(lines, { width: 800, height: 500 });
    expect(result.name).toBe('陳建宏');
    expect(result.jobTitle).toBe('系統架構副理');
    expect(result.company).toBe('聯發科技股份有限公司');
  });

  it('應正確處理直書（垂直排版）名片', () => {
    // 直式排版名片: 姓名垂直排列，height/width 比例極高
    const lines: OcrLine[] = [
      {
        text: '林子傑',
        // 直書: 寬 40, 高 150 -> 比例 150/40 = 3.75 > 2.5
        bbox: [400, 100, 440, 250],
      },
      {
        text: '大元建築師事務所',
        bbox: [500, 80, 530, 320], // 直書公司
      },
      {
        text: '主持建築師',
        bbox: [350, 120, 375, 230], // 直書職稱
      },
    ];

    const result = parseSpatialLayout(lines, { width: 600, height: 900 });
    expect(result.name).toBe('林子傑');
    expect(result.company).toBe('大元建築師事務所');
    expect(result.jobTitle).toBe('主持建築師');
  });

  it('若無姓名時應自動 Fallback 為「未命名聯絡人」且不拋出例外', () => {
    const lines: OcrLine[] = [
      {
        text: '電話: 02-2345-6789',
        bbox: [50, 50, 200, 70],
      },
    ];

    const result = parseSpatialLayout(lines, { width: 500, height: 300 });
    expect(result.name).toBe('未命名聯絡人');
    expect(result.phones.length).toBe(1);
  });

  it('應能處理真實 Tesseract OCR 常見的中文字間空白、同行多組電話傳真與無前綴號碼', () => {
    const noisyLines: OcrLine[] = [
      {
        text: '華 碩 電 腦 股 份 有 限 公 司',
        bbox: [40, 30, 520, 65],
      },
      {
        text: '張 家 豪  Kevin Chang',
        bbox: [40, 110, 380, 165],
      },
      {
        text: '智 慧 雲 端 事 業 群  技 術 總 監',
        bbox: [40, 175, 360, 205],
      },
      {
        text: '(02) 2894-3447 #6789  FAX: (02) 2890-7654',
        bbox: [40, 320, 540, 345],
      },
      {
        text: '0933 - 123 - 456   統編 23638777',
        bbox: [40, 355, 480, 380],
      },
      {
        text: 'kevin_chang@asus.com   www.asus.com.tw',
        bbox: [40, 390, 520, 415],
      },
      {
        text: '112 台 北 市 北 投 區 立 德 路 15 號',
        bbox: [40, 425, 500, 450],
      },
    ];

    const result = parseSpatialLayout(noisyLines, { width: 900, height: 540 });
    expect(result.company).toBe('華碩電腦股份有限公司');
    expect(result.name).toBe('張家豪');
    expect(result.nameEn).toBe('Kevin Chang');
    expect(result.jobTitle).toContain('技術總監');
    expect(result.taxId).toBe('23638777');
    expect(result.phones.some((p) => p.type === 'mobile' && p.number === '0933-123-456')).toBe(true);
    expect(result.phones.some((p) => p.type === 'work' && p.extension === '6789')).toBe(true);
    expect(result.phones.some((p) => p.type === 'fax')).toBe(true);
    expect(result.emails).toContain('kevin_chang@asus.com');
    expect(result.websites).toContain('www.asus.com.tw');
    expect(result.addresses[0]).toBe('112 台北市北投區立德路 15 號');
  });

  it('應能精準解析雙欄複雜版面與含 OCR 雜訊之真實名片 (廣運機械 KENMEC 劉景文案例)', () => {
    // 模擬真實 Tesseract 對雙欄名片產生的跨欄合併、破折號變「一」、股變「了」、圖示雜訊等情況
    const kenmecNoisyLines: OcrLine[] = [
      {
        text: 'KENMEC 劉 景 文 Ching-Wen Liu',
        bbox: [40, 40, 780, 95],
      },
      {
        text: 'The Leader of Automation 自動化事業群 Automation Business Group',
        bbox: [40, 105, 820, 130],
      },
      {
        text: '電控設計部 副理 Electrical control Dept. Deputy Manager',
        bbox: [320, 135, 820, 160],
      },
      {
        text: '">> 廣運機械  "= RATRI 廣運機械工程了份有限公司',
        bbox: [40, 185, 780, 215],
      },
      {
        text: '>> 金運科技  統一編號 : 04757691',
        bbox: [40, 225, 620, 250],
      },
      {
        text: '>> 太極能源  @ 11578台北市南港路二段97號5樓',
        bbox: [40, 265, 720, 290],
      },
      {
        text: '>> 盛新材料  © 02一2786一3797 ext 136',
        bbox: [40, 300, 650, 325],
      },
      {
        text: '下革玉 rm  8 02-2788-7868',
        bbox: [40, 335, 580, 360],
      },
      {
        text: '日 0935一169一153',
        bbox: [320, 370, 580, 395],
      },
      {
        text: 'M chingwenliu @ kenmec.com',
        bbox: [320, 405, 640, 430],
      },
    ];

    const result = parseSpatialLayout(kenmecNoisyLines, { width: 900, height: 540 });
    expect(result.name).toBe('劉景文');
    expect(result.nameEn).toBe('Ching-Wen Liu');
    expect(result.company).toBe('廣運機械工程股份有限公司');
    expect(result.department).toContain('自動化事業群');
    expect(result.jobTitle).toContain('副理');
    expect(result.taxId).toBe('04757691');
    expect(result.addresses[0]).toContain('11578');
    expect(result.addresses[0]).toContain('台北市南港路二段');
    expect(result.phones.some((p) => p.number === '02-2786-3797' && p.extension === '136')).toBe(true);
    expect(result.phones.some((p) => p.number === '02-2788-7868')).toBe(true);
    expect(result.phones.some((p) => p.type === 'mobile' && p.number === '0935-169-153')).toBe(true);
    expect(result.emails).toContain('chingwenliu@kenmec.com');
  });

  it('應能處理真實 Tesseract 對金屬反光名片產生的極端誤判 (到景文/冒號區碼/115786北市/@變e/太極能源干擾)', () => {
    const rawTesseractLines: OcrLine[] = [
      { text: 'KENMEC 到 景 文 eewenuu |', bbox: [230, 142, 633, 172] },
      { text: 'Ra— 7 自 動 化 事 樂 群 Asor 7', bbox: [233, 171, 492, 192] },
      { text: 'AI 產 品 代 理 部 副 理', bbox: [250, 187, 490, 215] },
      { text: '» 廣 運 機 械 廣 運 機 械 工程 股份 有 了', bbox: [234, 206, 483, 237] },
      { text: '++ 金 運 科技 #ia8; 04757891', bbox: [230, 233, 485, 257] },
      { text: '»> 太極 能 源 9? 115786 北 市 南港 路 二 段 97 號 5 樓', bbox: [233, 254, 633, 287] },
      { text: 'yy 盛 新 材料  02:2786-3797 ext 136', bbox: [233, 281, 633, 307] },
      { text: '品 02:2788-5170', bbox: [388, 304, 633, 321] },
      { text: '0 0935-169-1 53', bbox: [390, 325, 494, 348] },
      { text: '& chingwenliuekenmec.eom', bbox: [387, 347, 566, 366] },
    ];

    const result = parseSpatialLayout(rawTesseractLines, { width: 900, height: 540 });
    expect(result.name).toBe('劉景文');
    expect(result.company).toBe('廣運機械工程股份有限公司');
    expect(result.department).toContain('自動化事業群');
    expect(result.department).toContain('AI產品代理部');
    expect(result.department).not.toContain('金運科');
    expect(result.jobTitle).toContain('副理');
    expect(result.taxId).toBe('04757891');
    expect(result.addresses[0]).toContain('11578 台北市南港路二段');
    expect(result.phones.some((p) => p.type === 'work' && p.number === '02-2786-3797' && p.extension === '136')).toBe(
      true
    );
    expect(result.phones.some((p) => p.type === 'fax' && p.number === '02-2788-5170')).toBe(true);
    expect(result.phones.some((p) => p.type === 'mobile' && p.number === '0935-169-153')).toBe(true);
    expect(result.emails).toContain('chingwenliu@kenmec.com');
  });

  it('應能在雙通道掃描 (右欄專區 + 全圖區) 與姓名首字損毀情況下 100% 完整還原所有 9 大欄位 (含 Ching-Wen Liu 與 AI產品代理部)', () => {
    const dualZoneLines: OcrLine[] = [
      // Pass 1: 右欄專區 (PSM 6)
      { text: '劉 景 文 chme.wenuiu', bbox: [350, 115, 610, 155] },
      { text: '自 動人 事業 群 Auomaton Busness gu', bbox: [350, 160, 610, 180] },
      { text: '產品 代理 部 Asoions Distibuton Depariment', bbox: [350, 182, 610, 202] },
      { text: '副 理 Ospdy Manager', bbox: [350, 204, 520, 224] },
      { text: '廣 運 機 械 工程 股份 有 限 公司', bbox: [350, 230, 610, 255] },
      { text: 'Has- 04757891', bbox: [350, 258, 500, 275] },
      { text: '9 11578 台 北市 南港 路 二 段 97 束 5 樓', bbox: [350, 280, 610, 300] },
      { text: 'V 02-2786-3797 ext 136', bbox: [350, 302, 560, 320] },
      { text: '品 02-2788-517g', bbox: [350, 322, 520, 340] },
      { text: '{ 0935-169-153', bbox: [350, 342, 520, 360] },
      { text: '= chingwenliu@kenmec.com', bbox: [350, 362, 580, 380] },
      // Pass 2: 全圖區 (PSM 3)
      { text: 'KENMEC $ 景 3 ching-Wen Liu', bbox: [194, 115, 620, 155] },
      { text: '廣 連 機 械 工程 股份 有 限 公司', bbox: [194, 230, 610, 255] },
    ];

    const result = parseSpatialLayout(dualZoneLines, { width: 650, height: 400 });
    expect(result.name).toBe('劉景文');
    expect(result.nameEn).toBe('Ching-Wen Liu');
    expect(result.company).toBe('廣運機械工程股份有限公司');
    expect(result.department).toBe('自動化事業群 AI產品代理部');
    expect(result.jobTitle).toBe('副理');
    expect(result.taxId).toBe('04757891');
    expect(result.addresses[0]).toBe('11578 台北市南港路二段97號5樓');
    expect(result.phones.length).toBe(3);
    expect(result.phones.some((p) => p.type === 'work' && p.number === '02-2786-3797' && p.extension === '136')).toBe(
      true
    );
    expect(result.phones.some((p) => p.type === 'fax' && p.number === '02-2788-5170')).toBe(true);
    expect(result.phones.some((p) => p.type === 'mobile' && p.number === '0935-169-153')).toBe(true);
    expect(result.emails).toEqual(['chingwenliu@kenmec.com']);
  });
});
