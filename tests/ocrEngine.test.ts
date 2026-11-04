import { describe, it, expect, vi } from 'vitest';
import { extractOcrLinesFromTesseractPage } from '../src/services/ocr/ocrEngine';
import { parseSpatialLayout } from '../src/services/ocr/spatialParser';

describe('Tesseract.js v6 Page 結構提取器 (extractOcrLinesFromTesseractPage)', () => {
  it('應能從 Tesseract v6 的 blocks -> paragraphs -> lines 巢狀結構提取所有行與 bbox', () => {
    const mockPage = {
      text: '台灣微軟股份有限公司\n王智翔 Eric Wang\n資深技術總監\n0912-345-678',
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  text: '台灣微軟股份有限公司\n',
                  bbox: { x0: 40, y0: 30, x1: 420, y1: 65 },
                },
                {
                  text: '王智翔 Eric Wang\n',
                  bbox: { x0: 40, y0: 110, x1: 350, y1: 165 },
                },
              ],
            },
            {
              lines: [
                {
                  text: '資深技術總監\n',
                  bbox: { x0: 40, y0: 180, x1: 240, y1: 210 },
                },
                {
                  text: '0912-345-678\n',
                  bbox: { x0: 40, y0: 320, x1: 260, y1: 345 },
                },
              ],
            },
          ],
        },
      ],
    };

    const lines = extractOcrLinesFromTesseractPage(mockPage, { width: 900, height: 540 });
    expect(lines.length).toBe(4);
    expect(lines[1].text).toBe('王智翔 Eric Wang');
    expect(lines[1].bbox).toEqual([40, 110, 350, 165]);

    const parsed = parseSpatialLayout(lines, { width: 900, height: 540 });
    expect(parsed.company).toBe('台灣微軟股份有限公司');
    expect(parsed.name).toBe('王智翔');
    expect(parsed.nameEn).toBe('Eric Wang');
    expect(parsed.jobTitle).toBe('資深技術總監');
    expect(parsed.phones[0]?.number).toBe('0912-345-678');
  });

  it('當 Tesseract page.blocks 為 null 時，應能從 page.text 自動合成座標行並成功解析名片', () => {
    const mockPageWithoutBlocks = {
      text: [
        '聯發科技股份有限公司',
        '陳 建 宏  Kevin Chen',
        '智慧裝置事業群 資深工程師',
        '統一編號: 84149961',
        'TEL: (03) 567-0766 #8899',
        'Mobile: 0922-888-999',
        'kevin.chen@mediatek.com',
        '300 新竹市篤行一路1號',
      ].join('\n'),
      blocks: null,
    };

    const lines = extractOcrLinesFromTesseractPage(mockPageWithoutBlocks, { width: 900, height: 540 });
    expect(lines.length).toBe(8);

    const parsed = parseSpatialLayout(lines, { width: 900, height: 540 });
    expect(parsed.company).toBe('聯發科技股份有限公司');
    expect(parsed.name).toBe('陳建宏');
    expect(parsed.nameEn).toBe('Kevin Chen');
    expect(parsed.jobTitle).toContain('資深工程師');
    expect(parsed.taxId).toBe('84149961');
    expect(parsed.phones.some((p) => p.type === 'mobile' && p.number === '0922-888-999')).toBe(true);
    expect(parsed.phones.some((p) => p.type === 'work' && p.extension === '8899')).toBe(true);
    expect(parsed.emails).toContain('kevin.chen@mediatek.com');
    expect(parsed.addresses[0]).toContain('新竹市篤行一路');
  });

  it('當同一行內的 words 存在明顯水平分欄間距時，應自動切分為獨立欄位的 OcrLine', () => {
    const mockTwoColumnPage = {
      text: 'KENMEC 劉景文 Ching-Wen Liu\n廣運機械 廣運機械工程股份有限公司',
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  text: 'KENMEC 劉景文 Ching-Wen Liu\n',
                  bbox: { x0: 30, y0: 40, x1: 750, y1: 95 },
                  words: [
                    { text: 'KENMEC', bbox: { x0: 30, y0: 45, x1: 210, y1: 85 } },
                    // 水平間距 350 - 210 = 140px (> 8% of 900 = 72px) -> 自動切欄！
                    { text: '劉景文', bbox: { x0: 350, y0: 40, x1: 510, y1: 95 } },
                    { text: 'Ching-Wen', bbox: { x0: 530, y0: 60, x1: 660, y1: 88 } },
                    { text: 'Liu', bbox: { x0: 670, y0: 60, x1: 750, y1: 88 } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const lines = extractOcrLinesFromTesseractPage(mockTwoColumnPage, { width: 900, height: 540 });
    expect(lines.length).toBe(2);
    expect(lines[0].text).toBe('KENMEC');
    expect(lines[1].text).toBe('劉景文 Ching-Wen Liu');
    expect(lines[1].bbox).toEqual([350, 40, 750, 95]);
  });
});

describe('Google Gemini API 雲端視覺引擎與一勞永逸架構 (Cloud Gemini OCR)', () => {
  it('fetchAvailableGeminiModels 應正確篩選出支援 generateContent 且排除 Embedding 之模型', async () => {
    const { fetchAvailableGeminiModels } = await import('../src/services/ocr/ocrEngine');

    // 模擬 Google Models API 回傳
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/imagen-3.0-generate-002', supportedGenerationMethods: ['generateImages'] },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const models = await fetchAvailableGeminiModels('AIzaSyFakeKey123');
    expect(models).toEqual(['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.0-flash']);

    vi.unstubAllGlobals();
  });

  it('testGeminiApiKey 當 Key 為空或格式無效時應回傳清楚之繁體中文錯誤提示', async () => {
    const { testGeminiApiKey } = await import('../src/services/ocr/ocrEngine');
    const emptyResult = await testGeminiApiKey('');
    expect(emptyResult.success).toBe(false);
    expect(emptyResult.message).toContain('請輸入有效的 Google Gemini API Key');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const invalidResult = await testGeminiApiKey('invalid_key');
    expect(invalidResult.success).toBe(false);
    expect(invalidResult.message).toContain('API Key 無效或格式錯誤');

    vi.unstubAllGlobals();
  });

  it('runCloudGeminiOcr 遇首選模型 404 時，應自動 Fallback 至備用模型並正確解析名片欄位與剝除 Markdown 標籤', async () => {
    const { runCloudGeminiOcr } = await import('../src/services/ocr/ocrEngine');

    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      callCount++;
      if (url.includes('gemini-future-model')) {
        // 第一次呼叫自訂未來模型，模擬回傳 404 Not Found
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: { message: 'models/gemini-future-model is not found' } }),
        });
      }
      // 第二次自動 Fallback 呼叫 gemini-2.5-flash，回傳合法名片 JSON
      return Promise.resolve({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: '```json\n{\n  "name": "劉景文",\n  "nameEn": "Ching-Wen Liu",\n  "company": "廣運機械工程股份有限公司",\n  "department": "自動化事業群 AI產品代理部",\n  "jobTitle": "副理",\n  "taxId": "04757891",\n  "phones": [{"type": "work", "number": "02-2786-3797 ext 136"}, {"type": "fax", "number": "02-2788-5170"}, {"type": "mobile", "number": "0935-169-153"}],\n  "emails": ["chingwenliu@kenmec.com"],\n  "websites": [],\n  "addresses": ["11578 台北市南港路二段97號5樓"]\n}\n```',
                  },
                ],
              },
            },
          ],
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const parsed = await runCloudGeminiOcr('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'AIzaSyValidKey', 'gemini-future-model');

    expect(callCount).toBe(3); // 依序嘗試 v1beta (404) -> v1 (404) -> 備用模型 v1beta (200 成功)
    expect(parsed.name).toBe('劉景文');
    expect(parsed.nameEn).toBe('Ching-Wen Liu');
    expect(parsed.company).toBe('廣運機械工程股份有限公司');
    expect(parsed.department).toBe('自動化事業群 AI產品代理部');
    expect(parsed.jobTitle).toBe('副理');
    expect(parsed.taxId).toBe('04757891');
    expect(parsed.phones.length).toBe(3);
    expect(parsed.phones.some((p) => p.type === 'fax' && p.number === '02-2788-5170')).toBe(true);
    expect(parsed.addresses[0]).toBe('11578 台北市南港路二段97號5樓');

    vi.unstubAllGlobals();
  });
});

