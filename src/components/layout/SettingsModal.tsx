import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Cpu,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import {
  OcrSettings,
  getOcrSettings,
  saveOcrSettings,
  DEFAULT_GEMINI_MODEL,
  POPULAR_GEMINI_MODELS,
  testGeminiApiKey,
} from '../../services/ocr/ocrEngine';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (newSettings: OcrSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<OcrSettings>(() => getOcrSettings());
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');

  // 即時寫入 LocalStorage 並廣播給所有元件，杜絕關閉視窗後狀態遺失或卡在地端模型
  const applyAndPersistSettings = (next: OcrSettings) => {
    setSettings(next);
    saveOcrSettings(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ocr-settings-updated', { detail: next }));
    }
    if (onSettingsSaved) {
      onSettingsSaved(next);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const current = getOcrSettings();
      setSettings(current);
      setTestResult(null);

      const rawModel = current.modelName || DEFAULT_GEMINI_MODEL;
      const currentModel = rawModel.includes('2.5') ? DEFAULT_GEMINI_MODEL : rawModel;
      const rawCached =
        current.availableModels && current.availableModels.length > 0
          ? current.availableModels
          : POPULAR_GEMINI_MODELS;
      const cachedModels = Array.from(new Set(rawCached.filter((m) => !m.includes('2.5'))));
      setAvailableModels(cachedModels);

      if (cachedModels.includes(currentModel)) {
        setIsCustomModel(false);
      } else {
        setIsCustomModel(true);
        setCustomModelInput(currentModel);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    if (!settings.geminiApiKey?.trim()) {
      setTestResult({
        success: false,
        message: '請先在上方輸入框填寫 Google Gemini API Key！',
      });
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);

      const result = await testGeminiApiKey(settings.geminiApiKey);
      if (result.success && result.models.length > 0) {
        const cleaned = result.models.filter((m) => !m.includes('2.5'));
        const sorted = [
          ...cleaned.filter((m) => m === 'gemini-1.5-flash' || m === 'gemini-1.5-flash-latest'),
          ...cleaned.filter(
            (m) => m.includes('flash') && m !== 'gemini-1.5-flash' && m !== 'gemini-1.5-flash-latest'
          ),
          ...cleaned.filter((m) => !m.includes('flash')),
        ];
        const unique = Array.from(new Set(sorted));
        setAvailableModels(unique);

        const nextModel =
          unique.includes(settings.modelName || '') && !settings.modelName?.includes('2.5')
            ? settings.modelName || DEFAULT_GEMINI_MODEL
            : unique[0] || DEFAULT_GEMINI_MODEL;

        // 測試金鑰成功後，自動切換為雲端 Gemini 視覺 AI 並立即持久化
        const nextSettings: OcrSettings = {
          ...settings,
          engine: 'cloud',
          geminiApiKey: settings.geminiApiKey.trim(),
          availableModels: unique,
          modelName: nextModel,
        };
        applyAndPersistSettings(nextSettings);
      }
      setTestResult(result);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : '連線測試時發生未知錯誤',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndClose = () => {
    const finalModel = isCustomModel
      ? customModelInput.trim() || DEFAULT_GEMINI_MODEL
      : settings.modelName || DEFAULT_GEMINI_MODEL;

    const cleanKey = settings.geminiApiKey?.trim() || '';
    // 若使用者已填寫 API Key 且未刻意選地端，確保啟用雲端 AI
    const finalEngine = cleanKey && settings.engine === 'cloud' ? 'cloud' : settings.engine;

    const toSave: OcrSettings = {
      ...settings,
      engine: finalEngine,
      geminiApiKey: cleanKey,
      modelName: finalModel,
      availableModels: availableModels.length > 0 ? availableModels : settings.availableModels,
    };

    applyAndPersistSettings(toSave);
    onClose();
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSaveAndClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[85vh]">
        {/* 標題欄 */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-800 truncate">名片 AI 辨識與模型設定</h2>
              <p className="text-[11px] text-slate-500 truncate">選取後即時自動儲存・支援雲端 Gemini 與離線 OCR</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-3 py-1.5 bg-slate-200/70 hover:bg-slate-300/80 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1 transition-colors min-h-[38px] flex-shrink-0"
            title="儲存並關閉視窗"
          >
            <X className="w-4 h-4" />
            <span>關閉</span>
          </button>
        </div>

        {/* 內容區塊 */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-sm flex-1">
          {/* 引擎選擇 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              1. 選擇辨識引擎模式（點選立即生效）
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const next: OcrSettings = { ...settings, engine: 'local' };
                  applyAndPersistSettings(next);
                }}
                className={`p-3 rounded-2xl border text-left transition-all relative ${
                  settings.engine === 'local'
                    ? 'border-blue-600 bg-blue-50/70 shadow-sm ring-2 ring-blue-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center space-x-2 pr-4">
                  <Cpu className={`w-4 h-4 flex-shrink-0 ${settings.engine === 'local' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${settings.engine === 'local' ? 'text-blue-900' : 'text-slate-700'}`}>
                    本機離線 OCR
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  免連網・免 API Key・100% 離線運算
                </p>
                {settings.engine === 'local' && (
                  <CheckCircle2 className="w-4 h-4 text-blue-600 absolute top-3 right-3" />
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  const next: OcrSettings = { ...settings, engine: 'cloud' };
                  applyAndPersistSettings(next);
                }}
                className={`p-3 rounded-2xl border text-left transition-all relative ${
                  settings.engine === 'cloud'
                    ? 'border-indigo-600 bg-indigo-50/70 shadow-sm ring-2 ring-indigo-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center space-x-2 pr-4">
                  <Sparkles className={`w-4 h-4 flex-shrink-0 ${settings.engine === 'cloud' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${settings.engine === 'cloud' ? 'text-indigo-900' : 'text-slate-700'}`}>
                    Gemini 視覺 AI
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  極致辨識率・支援多張同框與特殊排版
                </p>
                {settings.engine === 'cloud' && (
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 absolute top-3 right-3" />
                )}
              </button>
            </div>
          </div>

          {/* Gemini API Key 設定區塊 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                <Key className="w-4 h-4 text-indigo-600" />
                <span>2. Google Gemini API Key</span>
              </div>
              <a
                href="https://aistudio.google.com/docs/api-key"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 hover:underline"
              >
                <span>免費領取 API Key</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.geminiApiKey || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setTestResult(null);
                  // 當使用者輸入有效金鑰時，自動切換為 cloud 引擎並即時儲存
                  const next: OcrSettings = {
                    ...settings,
                    geminiApiKey: val,
                    engine: val.trim().length > 5 ? 'cloud' : settings.engine,
                  };
                  applyAndPersistSettings(next);
                }}
                placeholder="貼上 AIzaSy... 開頭的 API Key"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* 測試連線與取得模型清單 */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={isTesting || !settings.geminiApiKey?.trim()}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    <span>測試連線與載入模型中...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                    <span>測試金鑰並同步可用模型清單</span>
                  </>
                )}
              </button>
            </div>

            {/* 測試連線結果回饋 */}
            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start space-x-2 ${
                  testResult.success
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="leading-relaxed">{testResult.message}</div>
              </div>
            )}

            {/* 一勞永逸模型設定 */}
            <div className="pt-2 border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">3. 使用模型（選好自動套用）：</span>
                <button
                  type="button"
                  onClick={() => setIsCustomModel(!isCustomModel)}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  {isCustomModel ? '← 返回清單選擇' : '✏️ 手動輸入新模型'}
                </button>
              </div>

              {!isCustomModel ? (
                <select
                  value={settings.modelName || DEFAULT_GEMINI_MODEL}
                  onChange={(e) => {
                    const chosenModel = e.target.value;
                    // 選取 Gemini 模型時自動啟用 cloud 引擎並即時儲存
                    const next: OcrSettings = {
                      ...settings,
                      modelName: chosenModel,
                      engine: settings.geminiApiKey?.trim() ? 'cloud' : settings.engine,
                    };
                    applyAndPersistSettings(next);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m} {m === DEFAULT_GEMINI_MODEL ? '(推薦 預設)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomModelInput(val);
                      if (val.trim()) {
                        applyAndPersistSettings({
                          ...settings,
                          modelName: val.trim(),
                          engine: settings.geminiApiKey?.trim() ? 'cloud' : settings.engine,
                        });
                      }
                    }}
                    placeholder="例如: gemini-1.5-flash 或 gemini-2.0-flash"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 資安與隱私保障提示 */}
          <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-200/60 flex items-start space-x-2 text-xs text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong>100% 隱私承諾：</strong>API 金鑰僅保存在您的手機/電腦瀏覽器本機，直接連線 Google AI 官方伺服器。
            </div>
          </div>
        </div>

        {/* 底部按鈕：全寬清晰確認並關閉 */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end sticky bottom-0 z-10">
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 min-h-[42px]"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>完成並關閉設定 ({settings.engine === 'cloud' ? `已啟用 Gemini AI` : '本機離線 OCR'})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
