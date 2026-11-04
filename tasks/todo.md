# YNHere 原子化任務清單 (Task Breakdown)

- [x] **Task 1: 初始化跨平台 PWA 專案基底與核心型別 (`src/types/contact.ts`)**
  - Acceptance: 完成 Vite + React + TypeScript + Tailwind CSS + Vitest + Dexie + Zod + fflate 設定，並建立 `ContactCardSchema`。
  - Verify: `npm run typecheck`
  - Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `src/types/contact.ts`

- [x] **Task 2: [TDD] 台灣在地化校驗器與行政區離線座標 (`twValidators.ts` & `twDistrictCoords.ts`)**
  - Acceptance: 先撰寫 `tests/twValidators.test.ts` (RED)，實作 2023 新制統編 Mod5 驗證（含第 7 碼為 7 雙路徑）、2/3/4 碼區碼與分機正規化、地址前綴清洗與台灣 368 行政區離線經緯度匹配 (GREEN)。
  - Verify: `npm run test -- --run tests/twValidators.test.ts`
  - Files: `tests/twValidators.test.ts`, `src/services/ocr/twValidators.ts`, `src/services/map/twDistrictCoords.ts`

- [x] **Task 3: [TDD] 直橫書自適應 2D 空間幾何欄位解析大腦 (`spatialParser.ts`)**
  - Acceptance: 先撰寫 `tests/spatialParser.test.ts` (RED)，實作橫式與直式名片 Bounding Box 分析、百家姓/公司/職稱權重計分與欄位分離 (GREEN)。
  - Verify: `npm run test -- --run tests/spatialParser.test.ts`
  - Files: `tests/spatialParser.test.ts`, `src/services/ocr/spatialParser.ts`

- [x] **Task 4: [TDD] 多維度名片碰撞去重與職涯異動無損合併 (`duplicateMatcher.ts`)**
  - Acceptance: 先撰寫 `tests/duplicateMatcher.test.ts` (RED)，實作空值防呆、5 大碰撞計分規則與 `mergeContacts` 自動歸檔 `careerHistory` (GREEN)。
  - Verify: `npm run test -- --run tests/duplicateMatcher.test.ts`
  - Files: `tests/duplicateMatcher.test.ts`, `src/services/deduplication/duplicateMatcher.ts`

- [x] **Task 5: [TDD] 全格式導入、導出與分享編解碼器 (`vcardCodec`, `ynpackArchive`, `tabularCodec`, `calendarIcs`, `urlShareCodec`)**
  - Acceptance: 先撰寫 `tests/exchangeCodecs.test.ts` (RED)，實作單張/多張勾選/全選之 `.vcf` (vCard 3.0 雙向無損 + QR Code 700B 精簡版)、`.ynpack` (ZIP 封裝)、`.csv` (UTF-8 BOM + CamCard 映射)、`.ics` 行事曆與 `#card=` URL Hash (1~10 張上限保護) (GREEN)。
  - Verify: `npm run test -- --run tests/exchangeCodecs.test.ts`
  - Files: `tests/exchangeCodecs.test.ts`, `src/services/exchange/vcardCodec.ts`, `src/services/exchange/ynpackArchive.ts`, `src/services/exchange/tabularCodec.ts`, `src/services/exchange/calendarIcs.ts`, `src/services/exchange/urlShareCodec.ts`

- [x] **Task 6: 本地 IndexedDB 資料庫、圖片分離儲存與電腦視覺/雙軌 OCR 引擎**
  - Acceptance: 實作 Dexie 資料庫、圖片 WebP/JPEG 壓縮分離儲存、`storageGuard.ts`、1920px 安全降採樣與多張名片切分、Tesseract.js 本地離線 OCR + Gemini Vision AI 雙軌引擎。
  - Verify: `npm run typecheck && npm run test -- --run`
  - Files: `src/db/database.ts`, `src/db/storageGuard.ts`, `src/services/cv/cardDetector.ts`, `src/services/ocr/ocrEngine.ts`

- [x] **Task 7: 跨平台響應式 UI 完整實作（手機底部 Tab + 電腦三欄工作台）**
  - Acceptance: 實作聯絡人列表（支援單張選、多張自由勾選、一鍵全選、群組、標籤、快篩）、相機掃描/多圖拖放切分、詳情與職涯履歷抽屜、絲帶追蹤與時間軸、離線人脈地圖、個人數位名片（3種版型 + 智慧問候語 + QR Code）與導入/導出/交換中心。
  - Verify: `npm run typecheck && npm run build`
  - Files: `src/components/**/*`, `src/App.tsx`

- [x] **Task 8: 全系統驗證與 EGM Drift Report 防漂移檢驗**
  - Acceptance: 執行全量測試與生產環境建置，並產出 Drift Report 確認實作與 `docs/designs/YNHere_Spec.md` 100% 吻合。
  - Verify: `npm run test -- --run && npm run build`
  - Files: `docs/designs/YNHere_Drift_Report.md`
