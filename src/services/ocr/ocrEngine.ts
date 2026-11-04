import { createWorker } from 'tesseract.js';
import { parseSpatialLayout, OcrLine, ParsedCardFields } from './spatialParser';
import { normalizePhone, normalizeTaiwanTaxId } from './twValidators';
import { ContactCard } from '../../types/contact';

// Tesseract Worker 單例 (Lazy-loaded)
let tesseractWorkerPromise: Promise<Tesseract.Worker> | null = null;

async function getTesseractWorker(): Promise<Tesseract.Worker> {
  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      try {
        const worker = await createWorker(['chi_tra', 'eng'], 1, {
          logger: () => {},
        });
        return worker;
      } catch (err) {
        tesseractWorkerPromise = null;
        throw err;
      }
    })();
  }
  return tesseractWorkerPromise;
}

export type OcrEngineType = 'local' | 'cloud';

export interface OcrSettings {
  engine: OcrEngineType;
  geminiApiKey?: string;
  modelName?: string;
  availableModels?: string[];
}

export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash';
export const POPULAR_GEMINI_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-2.0-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
];

export const OCR_SETTINGS_KEY = 'ynhere_ocr_settings';

export function getOcrSettings(): OcrSettings {
  if (typeof localStorage === 'undefined') return { engine: 'local', modelName: DEFAULT_GEMINI_MODEL };
  try {
    const raw = localStorage.getItem(OCR_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    let modelName = parsed.modelName || DEFAULT_GEMINI_MODEL;
    // 平滑遷移先前誤選之不存在的實驗別名
    if (modelName.includes('2.5')) {
      modelName = DEFAULT_GEMINI_MODEL;
    }
    return {
      engine: parsed.engine || 'local',
      geminiApiKey: parsed.geminiApiKey || '',
      modelName,
      availableModels: Array.isArray(parsed.availableModels) ? parsed.availableModels : [],
    };
  } catch {
    return { engine: 'local', modelName: DEFAULT_GEMINI_MODEL };
  }
}

export function saveOcrSettings(settings: OcrSettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OCR_SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * 將單一 Tesseract line 依據「左側欄 (x <= 40% W) 與右側主內容欄 (x >= 40% W)」之明顯跨欄間距切分
 * 注意：絕不在右欄內部切分，以免將寬字距姓名（如「劉 景 文」）與後接英文名（如「Ching-Wen Liu」）切斷
 */
function splitLineByWordGaps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line: any,
  imageDimensions: { width: number; height: number }
): OcrLine[] {
  const words = Array.isArray(line?.words) ? line.words : [];
  if (words.length <= 1) {
    const text = String(line?.text || '').trim();
    if (!text) return [];
    return [
      {
        text,
        bbox: [
          Number(line?.bbox?.x0) || 0,
          Number(line?.bbox?.y0) || 0,
          Number(line?.bbox?.x1) || Math.min(imageDimensions.width, text.length * 24),
          Number(line?.bbox?.y1) || 32,
        ],
      },
    ];
  }

  const gapThreshold = Math.max(55, Math.floor(imageDimensions.width * 0.08));
  const sidebarBoundaryX = imageDimensions.width * 0.42;
  const segments: OcrLine[] = [];

  let currentTexts: string[] = [];
  let segX0 = 0;
  let segY0 = 0;
  let segX1 = 0;
  let segY1 = 0;

  for (const w of words) {
    const wText = String(w?.text || '').trim();
    if (!wText) continue;
    const wx0 = Number(w?.bbox?.x0) || 0;
    const wy0 = Number(w?.bbox?.y0) || 0;
    const wx1 = Number(w?.bbox?.x1) || wx0 + wText.length * 18;
    const wy1 = Number(w?.bbox?.y1) || wy0 + 28;

    if (currentTexts.length === 0) {
      currentTexts.push(wText);
      segX0 = wx0;
      segY0 = wy0;
      segX1 = wx1;
      segY1 = wy1;
    } else {
      const gap = wx0 - segX1;
      // 僅當左側片段結束於左欄區域 (segX1 <= 42% 畫面寬度) 且與右側詞彙間距超過門檻時，才切分為左欄與右欄
      if (gap > gapThreshold && segX1 <= sidebarBoundaryX && segments.length === 0) {
        segments.push({
          text: currentTexts.join(' '),
          bbox: [segX0, segY0, segX1, segY1],
        });
        currentTexts = [wText];
        segX0 = wx0;
        segY0 = wy0;
        segX1 = wx1;
        segY1 = wy1;
      } else {
        currentTexts.push(wText);
        segX0 = Math.min(segX0, wx0);
        segY0 = Math.min(segY0, wy0);
        segX1 = Math.max(segX1, wx1);
        segY1 = Math.max(segY1, wy1);
      }
    }
  }

  if (currentTexts.length > 0) {
    segments.push({
      text: currentTexts.join(' '),
      bbox: [segX0, segY0, segX1, segY1],
    });
  }

  return segments;
}

/**
 * 從 Tesseract.js v6 Page 結構提取所有文字行與 2D 座標框
 */
export function extractOcrLinesFromTesseractPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  imageDimensions: { width: number; height: number },
  offsetX = 0,
  offsetY = 0
): OcrLine[] {
  if (!page) return [];

  const extracted: OcrLine[] = [];

  if (Array.isArray(page.blocks)) {
    for (const block of page.blocks) {
      if (!Array.isArray(block?.paragraphs)) continue;
      for (const para of block.paragraphs) {
        if (!Array.isArray(para?.lines)) continue;
        for (const line of para.lines) {
          const splitLines = splitLineByWordGaps(line, imageDimensions);
          for (const sl of splitLines) {
            extracted.push({
              text: sl.text,
              bbox: [
                sl.bbox[0] + offsetX,
                sl.bbox[1] + offsetY,
                sl.bbox[2] + offsetX,
                sl.bbox[3] + offsetY,
              ],
            });
          }
        }
      }
    }
  }

  if (extracted.length === 0 && Array.isArray(page.lines)) {
    for (const line of page.lines) {
      const splitLines = splitLineByWordGaps(line, imageDimensions);
      for (const sl of splitLines) {
        extracted.push({
          text: sl.text,
          bbox: [
            sl.bbox[0] + offsetX,
            sl.bbox[1] + offsetY,
            sl.bbox[2] + offsetX,
            sl.bbox[3] + offsetY,
          ],
        });
      }
    }
  }

  const rawTextLines = String(page.text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (extracted.length === 0 && rawTextLines.length > 0) {
    const total = rawTextLines.length;
    const stepY = Math.max(28, Math.floor((imageDimensions.height * 0.85) / Math.max(1, total)));
    return rawTextLines.map((text, idx) => {
      const y0 = offsetY + 20 + idx * stepY;
      const estimatedHeight = idx <= 2 ? 42 : 26;
      return {
        text,
        bbox: [
          offsetX + 40,
          y0,
          offsetX + Math.min(imageDimensions.width - 40, 40 + text.length * 22),
          y0 + estimatedHeight,
        ],
      };
    });
  }

  return extracted;
}

/**
 * 準備雙通道影像：
 * 1. 全圖 (去黑邊 1.5% 防止邊框干擾基線)
 * 2. 右側主內容區 (x = 34% .. 99%，專治台灣常見「左 Logo/關係企業欄 + 右個人資訊欄」雙欄名片之基線拉扯)
 */
async function prepareDualZoneImages(
  imageSource: Blob | File | string,
  fallbackDims: { width: number; height: number }
): Promise<{
  fullSource: Blob | File | string;
  rightZoneSource: string | null;
  width: number;
  height: number;
  rightOffsetX: number;
  rightOffsetY: number;
}> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return {
      fullSource: imageSource,
      rightZoneSource: null,
      width: fallbackDims.width,
      height: fallbackDims.height,
      rightOffsetX: Math.round(fallbackDims.width * 0.34),
      rightOffsetY: 0,
    };
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      if (typeof imageSource === 'string') {
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = imageSource;
      } else {
        const url = URL.createObjectURL(imageSource);
        el.onload = () => {
          URL.revokeObjectURL(url);
          resolve(el);
        };
        el.onerror = (err) => {
          URL.revokeObjectURL(url);
          reject(err);
        };
        el.src = url;
      }
    });

    const origW = img.naturalWidth || img.width || fallbackDims.width;
    const origH = img.naturalHeight || img.height || fallbackDims.height;

    // 僅在舊版極小縮圖 (< 400px) 時放大 2 倍，正常圖檔保持 1:1 原始銳利像素避免插值模糊（「運」變「連」）
    const scale = origW < 400 ? 2 : 1;
    const outW = Math.round(origW * scale);
    const outH = Math.round(origH * scale);

    // 建立全圖 Canvas (四周裁去 1% 邊緣雜訊並補 16px 純白外框)
    const pad = 16;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = outW + pad * 2;
    fullCanvas.height = outH + pad * 2;
    const fCtx = fullCanvas.getContext('2d');
    let fullDataUrl: Blob | File | string = imageSource;
    if (fCtx) {
      fCtx.fillStyle = '#FFFFFF';
      fCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
      const cropMarginX = Math.round(origW * 0.01);
      const cropMarginY = Math.round(origH * 0.01);
      fCtx.drawImage(
        img,
        cropMarginX,
        cropMarginY,
        origW - cropMarginX * 2,
        origH - cropMarginY * 2,
        pad,
        pad,
        outW,
        outH
      );
      fullDataUrl = fullCanvas.toDataURL('image/png');
    }

    // 建立右側 64% 主內容專區 Canvas (x = 34% .. 98.5%)
    const rx = Math.round(origW * 0.34);
    const ry = Math.round(origH * 0.015);
    const rw = Math.round(origW * 0.645);
    const rh = Math.round(origH * 0.97);

    const rightCanvas = document.createElement('canvas');
    rightCanvas.width = Math.round(rw * scale) + pad * 2;
    rightCanvas.height = Math.round(rh * scale) + pad * 2;
    const rCtx = rightCanvas.getContext('2d');
    let rightDataUrl: string | null = null;
    if (rCtx) {
      rCtx.fillStyle = '#FFFFFF';
      rCtx.fillRect(0, 0, rightCanvas.width, rightCanvas.height);
      rCtx.drawImage(img, rx, ry, rw, rh, pad, pad, Math.round(rw * scale), Math.round(rh * scale));
      rightDataUrl = rightCanvas.toDataURL('image/png');
    }

    return {
      fullSource: fullDataUrl,
      rightZoneSource: rightDataUrl,
      width: outW + pad * 2,
      height: outH + pad * 2,
      rightOffsetX: Math.round(rx * scale),
      rightOffsetY: Math.round(ry * scale),
    };
  } catch {
    return {
      fullSource: imageSource,
      rightZoneSource: null,
      width: fallbackDims.width,
      height: fallbackDims.height,
      rightOffsetX: Math.round(fallbackDims.width * 0.34),
      rightOffsetY: 0,
    };
  }
}

/**
 * 引擎 A: 本機離線 Tesseract.js 雙區域掃描 (右欄主資訊區 + 全圖區) + 2D 空間幾何大腦
 */
export async function runLocalOcr(
  imageSource: Blob | File | string,
  imageDimensions: { width: number; height: number }
): Promise<ParsedCardFields> {
  const worker = await getTesseractWorker();
  const prepared = await prepareDualZoneImages(imageSource, imageDimensions);

  const combinedLines: OcrLine[] = [];

  // Pass 1: 若有右側主資訊區影像，先以 PSM 6 (Single uniform block) 精準辨識右欄，消除左欄 Logo 對右欄文字基線的干擾
  if (prepared.rightZoneSource) {
    try {
      await worker.setParameters({ tessedit_pageseg_mode: '6' as unknown as Tesseract.PSM });
      const rightRet = await worker.recognize(
        prepared.rightZoneSource,
        { rotateAuto: true },
        { text: true, blocks: true }
      );
      const rightLines = extractOcrLinesFromTesseractPage(
        rightRet.data,
        { width: Math.round(prepared.width * 0.65), height: prepared.height },
        prepared.rightOffsetX,
        prepared.rightOffsetY
      );
      combinedLines.push(...rightLines);
    } catch {
      // 忽略單區失敗，繼續全圖辨識
    }
  }

  // Pass 2: 全圖辨識 (捕獲左欄、置中或全寬排版之資訊)
  await worker.setParameters({ tessedit_pageseg_mode: '3' as unknown as Tesseract.PSM });
  const fullRet = await worker.recognize(
    prepared.fullSource,
    { rotateAuto: true },
    { text: true, blocks: true }
  );
  const fullLines = extractOcrLinesFromTesseractPage(fullRet.data, {
    width: prepared.width,
    height: prepared.height,
  });
  combinedLines.push(...fullLines);

  return parseSpatialLayout(combinedLines, {
    width: prepared.width,
    height: prepared.height,
  });
}

/**
 * 動態從 Google Generative Language API 獲取當前 API Key 支援的所有生成模型清單
 * （達成一勞永逸：當未來 Google 推出新版如 gemini-3.0 時，無需更新程式碼即可自動出現在選單中）
 */
export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) return [];

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cleanKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    const msg = errJson?.error?.message || `HTTP ${res.status}`;
    throw new Error(`無法取得可用模型清單 (${msg})`);
  }

  const data = await res.json();
  if (!Array.isArray(data.models)) return [];

  const models: string[] = data.models
    .filter((m: { supportedGenerationMethods?: string[]; name?: string }) => {
      const methods = m.supportedGenerationMethods || [];
      const name = m.name || '';
      const isGenContent = methods.includes('generateContent');
      const isSpecializedOnly =
        name.includes('embedding') ||
        name.includes('aqa') ||
        name.includes('imagen') ||
        name.includes('text-embedding');
      return isGenContent && !isSpecializedOnly;
    })
    .map((m: { name: string }) => m.name.replace(/^models\//, ''))
    .filter(Boolean);

  return models;
}

/**
 * 測試使用者輸入的 Gemini API Key 是否合法，並自動載入該 Key 支援的模型清單
 */
export async function testGeminiApiKey(
  apiKey: string
): Promise<{ success: boolean; message: string; models: string[] }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { success: false, message: '請輸入有效的 Google Gemini API Key', models: [] };
  }

  try {
    const models = await fetchAvailableGeminiModels(cleanKey);
    if (models.length === 0) {
      return {
        success: false,
        message: '連線成功，但此 Key 目前未授權可用的內容生成模型，請確認 Google AI Studio 專案狀態。',
        models: [],
      };
    }
    return {
      success: true,
      message: `連線成功！已成功載入 ${models.length} 個 Google 官方可用 AI 模型`,
      models,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('API_KEY_INVALID') || msg.includes('400')) {
      return {
        success: false,
        message: 'API Key 無效或格式錯誤，請至 Google AI Studio 重新複製金鑰 (開頭通常為 AIzaSy...)。',
        models: [],
      };
    }
    if (msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
      return {
        success: false,
        message: '權限不足 (403)，請確認 Google Cloud Console 或 AI Studio 是否已啟用 Generative Language API。',
        models: [],
      };
    }
    return { success: false, message: `連線測試失敗: ${msg}`, models: [] };
  }
}

/**
 * 引擎 B: 雲端多模態視覺 AI (支援自訂/動態 Gemini 模型與容錯 Cascade)
 */
export async function runCloudGeminiOcr(
  imageBase64: string,
  apiKey: string,
  preferredModel?: string
): Promise<ParsedCardFields> {
  const cleanKey = apiKey.trim().replace(/^['"]|['"]$/g, '');
  if (!cleanKey) throw new Error('未提供有效的 Google Gemini API Key');

  let mimeType = 'image/jpeg';
  const matchMime = imageBase64.match(/^data:(image\/[a-zA-Z0-9.+_-]+);base64,/i);
  if (matchMime) {
    mimeType = matchMime[1].toLowerCase();
  }
  if (mimeType === 'image/jpg') {
    mimeType = 'image/jpeg';
  }
  const cleanBase64 = imageBase64
    .replace(/^data:image\/[a-zA-Z0-9.+_-]+;base64,/i, '')
    .replace(/[\r\n\s]/g, '');

  if (!cleanBase64) {
    throw new Error('名片圖片資料為空，無法進行雲端 AI 視覺辨識');
  }

  const prompt = `你是一位頂尖的名片資訊提取與 OCR 校正專家。請仔細辨識這張名片影像中的文字，並直接輸出為符合以下 JSON 格式的資料：
{
  "name": "中文姓名或主要姓名(必填)",
  "nameEn": "英文名(若有則填，無則為空字串)",
  "company": "公司完整官方名稱(如 股份有限公司/有限公司)",
  "department": "部門名稱(若有)",
  "jobTitle": "職稱(例如 副理、總監、經理等)",
  "taxId": "8碼統一編號字串，若開頭為0(如 04757891)必須完整保留0不可吃掉(無則留空字串)",
  "phones": [
    { "type": "work" | "mobile" | "fax", "number": "電話號碼(純號碼不含分機)", "extension": "分機號碼(純數字若無留空)" }
  ],
  "emails": ["電子郵件信箱"],
  "websites": ["公司官方網址"],
  "addresses": ["完整地址(包含郵遞區號)"]
}
特別注意事項：
1. 嚴格輸出單純的 JSON 物件，嚴禁包含 Markdown 代碼區塊標記（如 \`\`\`json）或任何額外說明文字。
2. 若為雙欄版面或金屬拉絲材質名片，請仔細比對各欄位，提取正確的人名、職稱與通訊電話。`;

  // 一勞永逸模型候選清單：優先從使用者帳號同步之可用模型中挑選真實存在的 flash/pro 模型
  const currentSettings = getOcrSettings();
  const knownAvailable = (currentSettings.availableModels || []).filter(
    (m) => Boolean(m) && !m.includes('2.5') && !m.includes('embedding') && !m.includes('imagen')
  );

  const realFlashModels = knownAvailable.filter((m) => m.includes('flash'));
  const realOtherModels = knownAvailable.filter((m) => !m.includes('flash'));

  const candidateModels = Array.from(
    new Set(
      [
        preferredModel?.trim(),
        ...realFlashModels,
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-2.0-flash',
        'gemini-2.0-flash-exp',
        ...realOtherModels,
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
      ].filter((m): m is string => Boolean(m && !m.includes('2.5')))
    )
  );

  let lastError: Error | null = null;
  const apiVersions = ['v1beta', 'v1'];

  for (const model of candidateModels) {
    for (const version of apiVersions) {
      try {
        const url = `https://generativelanguage.googleapis.com/${version}/models/${model}:generateContent?key=${cleanKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: cleanBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => ({}));
          const rawErrMsg = errJson?.error?.message || `HTTP ${response.status}`;

          // 若模型在此 API 版本找不到 (404 Not Found) 或不支援，嘗試另一個版本或下一個備用模型
          if (response.status === 404 || rawErrMsg.toLowerCase().includes('not found')) {
            lastError = new Error(`模型 ${model} (${version}) 不可用: ${rawErrMsg}`);
            continue;
          }

          // 致命錯誤（如 API Key 無效、配額用盡、權限拒絕）直接轉為清晰中文拋出
          if (rawErrMsg.includes('API_KEY_INVALID') || response.status === 400) {
            throw new Error(`Google API Key 無效或格式錯誤 (${rawErrMsg})，請至系統設定檢查金鑰`);
          }
          if (response.status === 403 || rawErrMsg.includes('PERMISSION_DENIED')) {
            throw new Error(`Google API 權限不足 (403: ${rawErrMsg})，請確認金鑰是否已啟用 Generative Language API`);
          }
          if (response.status === 429 || rawErrMsg.includes('RESOURCE_EXHAUSTED')) {
            throw new Error(`Google API 請求過於頻繁或免費額度已耗盡 (429: ${rawErrMsg})，請稍候重試`);
          }

          throw new Error(`Gemini API 請求失敗 (${response.status}): ${rawErrMsg}`);
        }

        const data = await response.json();
        let textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textOutput) {
          throw new Error('Gemini API 未回傳有效辨識文字');
        }

        // 清理可能出現的 markdown 格式包裹
        textOutput = textOutput.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

        const parsed = JSON.parse(textOutput);
        const normalizedPhones = Array.isArray(parsed.phones)
          ? parsed.phones
              .map((p: { type?: 'mobile' | 'work' | 'fax'; number?: string; extension?: string }) => {
                let rawNum = String(p?.number || '').trim();
                let ext = String(p?.extension || '').trim();
                // 若 number 內含 ext/分機 抽取出來
                const matchExt = rawNum.match(/(?:ext\.?|#|分機|轉)\s*(\d{1,6})/i);
                if (matchExt) {
                  if (!ext) ext = matchExt[1];
                  rawNum = rawNum.replace(matchExt[0], '').trim();
                }
                const item = normalizePhone(rawNum, p?.type || 'work');
                if (ext) {
                  item.extension = ext;
                  item.normalizedDialString = `${item.number},${ext}`;
                }
                return item;
              })
              .filter((p: { number: string }) => Boolean(p.number))
          : [];

        return {
          name: parsed.name || '未命名聯絡人',
          nameEn: parsed.nameEn || '',
          company: parsed.company || '',
          department: parsed.department || '',
          jobTitle: parsed.jobTitle || '',
          taxId: normalizeTaiwanTaxId(parsed.taxId || ''),
          phones: normalizedPhones,
          emails: Array.isArray(parsed.emails) ? parsed.emails : [],
          websites: Array.isArray(parsed.websites) ? parsed.websites : [],
          addresses: Array.isArray(parsed.addresses) ? parsed.addresses : [],
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // 只要是驗證或權限等致命錯誤，直接拋出
        if (
          lastError.message.includes('API Key 無效') ||
          lastError.message.includes('權限不足') ||
          lastError.message.includes('額度已耗盡')
        ) {
          throw lastError;
        }
      }
    }
  }

  throw lastError || new Error('所有 Gemini 模型辨識皆失敗，請確認網路連線或 API Key 設定');
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 智慧辨識主入口：依設定調用引擎 A 或 B，並轉換為 ContactCard 實體
 * 遵守 Fail Fast 原則：若使用者選取雲端 AI 卻未設定 Key 或 API 失敗，絕不靜默降級，保證透明回報！
 */
export async function recognizeBusinessCard(
  imageSource: Blob | File | string,
  imageDimensions: { width: number; height: number },
  thumbnailDataUrl?: string
): Promise<Partial<ContactCard>> {
  const settings = getOcrSettings();
  let parsed: ParsedCardFields;

  if (settings.engine === 'cloud') {
    if (!settings.geminiApiKey?.trim()) {
      throw new Error('您已選取「雲端 Gemini 視覺 AI」，但尚未設定 Google Gemini API Key，請先於設定中填寫金鑰！');
    }

    let base64 = '';
    if (typeof imageSource === 'string' && imageSource.startsWith('data:')) {
      base64 = imageSource;
    } else if (imageSource instanceof Blob) {
      base64 = await blobToDataUrl(imageSource);
    } else if (thumbnailDataUrl) {
      base64 = thumbnailDataUrl;
    }

    if (!base64) {
      throw new Error('無法讀取名片影像資料');
    }

    parsed = await runCloudGeminiOcr(base64, settings.geminiApiKey, settings.modelName);
  } else {
    parsed = await runLocalOcr(imageSource, imageDimensions);
  }

  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: parsed.name,
    nameEn: parsed.nameEn,
    company: parsed.company,
    department: parsed.department,
    jobTitle: parsed.jobTitle,
    taxId: normalizeTaiwanTaxId(parsed.taxId),
    phones: parsed.phones,
    emails: parsed.emails,
    websites: parsed.websites,
    addresses: parsed.addresses,
    socialLinks: {},
    tags: [],
    ribbon: { status: 'none', taskTitle: '' },
    timelineNotes: [],
    careerHistory: [],
    isMyDigitalCard: false,
    thumbnailDataUrl,
  };
}
