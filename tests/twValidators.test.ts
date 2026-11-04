import { describe, it, expect } from 'vitest';
import { isValidTaiwanTaxId, normalizeTaiwanTaxId, normalizePhone, cleanAddress } from '../src/services/ocr/twValidators';
import { resolveTaiwanDistrictCoords } from '../src/services/map/twDistrictCoords';

describe('台灣統一編號 2023 新制 Mod 5 驗證演算法與前導0自動修復', () => {
  it('應正確驗證標準合法統編 (包含開頭為0之號碼)', () => {
    // 廣運機械: 04757891 (開頭為 0)
    expect(isValidTaiwanTaxId('04757891')).toBe(true);
    // 鴻海: 04541302 (開頭為 0)
    expect(isValidTaiwanTaxId('04541302')).toBe(true);
    // 台積電: 22099131
    expect(isValidTaiwanTaxId('22099131')).toBe(true);
    // 聯發科: 84149961
    expect(isValidTaiwanTaxId('84149961')).toBe(true);
    // 中華電信: 96979933
    expect(isValidTaiwanTaxId('96979933')).toBe(true);
  });

  it('若統編開頭0被Excel吞掉變成7碼純數字，normalizeTaiwanTaxId 與驗證應自動補0救援', () => {
    // 廣運機械開頭0被吞掉: 4757891
    expect(normalizeTaiwanTaxId('4757891')).toBe('04757891');
    expect(isValidTaiwanTaxId('4757891')).toBe(true);

    // 鴻海開頭0被吞掉: 4541302
    expect(normalizeTaiwanTaxId('4541302')).toBe('04541302');
    expect(isValidTaiwanTaxId('4541302')).toBe(true);

    // 數值型別傳入亦能妥善處理
    expect(normalizeTaiwanTaxId(4757891)).toBe('04757891');
  });

  it('應正確處理第 7 碼為 7 的雙路徑合法統編', () => {
    // 第 7 碼為 7 的合法公司統編案例
    expect(isValidTaiwanTaxId('10458575')).toBe(true);
    expect(isValidTaiwanTaxId('10458574')).toBe(true);
  });

  it('應阻擋非 8 碼、含字母或非法的數字', () => {
    expect(isValidTaiwanTaxId('')).toBe(false);
    expect(isValidTaiwanTaxId('1234567')).toBe(false);
    expect(isValidTaiwanTaxId('123456789')).toBe(false);
    expect(isValidTaiwanTaxId('ABC45678')).toBe(false);
    // 一般 8 碼市話，非合法統編
    expect(isValidTaiwanTaxId('23456789')).toBe(false);
    expect(isValidTaiwanTaxId('87654321')).toBe(false);
  });
});

describe('電話與分機正規化 (normalizePhone)', () => {
  it('應正確正規化台灣手機號碼', () => {
    const res1 = normalizePhone('0912-345-678');
    expect(res1.type).toBe('mobile');
    expect(res1.number).toBe('0912-345-678');
    expect(res1.normalizedDialString).toBe('+886-912-345-678');

    const res2 = normalizePhone('+886 988 111 222');
    expect(res2.type).toBe('mobile');
    expect(res2.number).toBe('0988-111-222');
    expect(res2.normalizedDialString).toBe('+886-988-111-222');
  });

  it('應正確處理 2 碼區碼市話與多種分機格式', () => {
    const res1 = normalizePhone('(02) 2345-6789 #101');
    expect(res1.extension).toBe('101');
    expect(res1.normalizedDialString).toBe('+886-2-2345-6789,101');

    const res2 = normalizePhone('02-87654321 分機 205');
    expect(res2.extension).toBe('205');
    expect(res2.normalizedDialString).toBe('+886-2-8765-4321,205');
  });

  it('應正確識別 3 碼與 4 碼特殊區碼', () => {
    // 苗栗 037
    const res1 = normalizePhone('037-123456 ext. 9');
    expect(res1.extension).toBe('9');
    expect(res1.normalizedDialString).toBe('+886-37-123456,9');

    // 南投 049
    const res2 = normalizePhone('(049) 2987654');
    expect(res2.normalizedDialString).toBe('+886-49-2987654');
  });

  it('應保留外國國際號碼並去除雜訊', () => {
    const res = normalizePhone('+1 (415) 555-2671 ext 88');
    expect(res.extension).toBe('88');
    expect(res.normalizedDialString).toBe('+14155552671,88');
  });
});

describe('地址前綴清洗 (cleanAddress)', () => {
  it('應剝除「總公司：」「營業所：」「地址：」等雜訊前綴', () => {
    expect(cleanAddress('總公司：台北市信義區信義路五段7號')).toBe('台北市信義區信義路五段7號');
    expect(cleanAddress('公司地址:新竹科學園區研新一路1號')).toBe('新竹科學園區研新一路1號');
    expect(cleanAddress('台北營業所： 台北市大安區忠孝東路四段')).toBe('台北市大安區忠孝東路四段');
    expect(cleanAddress('ADD: 100 台北市中正區重慶南路一段')).toBe('100 台北市中正區重慶南路一段');
    expect(cleanAddress('台中市西區台灣大道二段')).toBe('台中市西區台灣大道二段');
  });
});

describe('台灣 368 鄉鎮市區離線經緯度解析 (resolveTaiwanDistrictCoords)', () => {
  it('應正確解析台北市信義區之經緯度', () => {
    const coords = resolveTaiwanDistrictCoords('台北市信義區信義路五段7號89樓');
    expect(coords).toBeDefined();
    expect(coords?.lat).toBeCloseTo(25.033, 1);
    expect(coords?.lng).toBeCloseTo(121.567, 1);
  });

  it('應正確解析新竹市東區之經緯度', () => {
    const coords = resolveTaiwanDistrictCoords('新竹市東區力行六路8號');
    expect(coords).toBeDefined();
    expect(coords?.lat).toBeCloseTo(24.78, 1);
    expect(coords?.lng).toBeCloseTo(120.99, 1);
  });

  it('應正確解析無「區」字但含郵遞區號/路名之地址 (例如 11578台北市南港路二段97號5樓 -> 南港區)', () => {
    const coords = resolveTaiwanDistrictCoords('11578台北市南港路二段97號5樓');
    expect(coords).toBeDefined();
    expect(coords?.lat).toBeCloseTo(25.055, 1);
    expect(coords?.lng).toBeCloseTo(121.607, 1);
  });

  it('若地址僅標示縣市名稱時應自動 fallback 至該縣市代表中心點', () => {
    const coords = resolveTaiwanDistrictCoords('台北市松高路1號');
    expect(coords).toBeDefined();
    expect(coords?.lat).toBeCloseTo(25.042, 1);
  });

  it('若地址無包含台灣已知縣市行政區則回傳 undefined', () => {
    const coords = resolveTaiwanDistrictCoords('Silicon Valley, CA, USA');
    expect(coords).toBeUndefined();
  });
});
