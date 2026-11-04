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

  useEffect(() => {
    if (isOpen) {
      const current = getOcrSettings();
      setSettings(current);
      setTestResult(null);

      const rawModel = current.modelName || DEFAULT_GEMINI_MODEL;
      const currentModel = rawModel.includes('2.5') ? DEFAULT_GEMINI_MODEL : rawModel;
      const rawCached = current.availableModels && current.availableModels.length > 0
        ? current.availableModels
        : POPULAR_GEMINI_MODELS;
      const cachedModels = Array.from(
        new Set(rawCached.filter((m) => !m.includes('2.5')))
      );
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
          ...cleaned.filter((m) => m.includes('flash') && m !== 'gemini-1.5-flash' && m !== 'gemini-1.5-flash-latest'),
          ...cleaned.filter((m) => !m.includes('flash')),
        ];
        const unique = Array.from(new Set(sorted));
        setAvailableModels(unique);
        setSettings((prev) => ({
          ...prev,
          availableModels: unique,
          modelName: unique.includes(prev.modelName || '') && !prev.modelName?.includes('2.5')
            ? prev.modelName
            : DEFAULT_GEMINI_MODEL,
        }));
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

  const handleSave = () => {
    const finalModel = isCustomModel
      ? customModelInput.trim() || DEFAULT_GEMINI_MODEL
      : settings.modelName || DEFAULT_GEMINI_MODEL;

    const toSave: OcrSettings = {
      ...settings,
      geminiApiKey: settings.geminiApiKey?.trim() || '',
      modelName: finalModel,
      availableModels: availableModels.length > 0 ? availableModels : settings.availableModels,
    };

    saveOcrSettings(toSave);
    if (onSettingsSaved) {
      onSettingsSaved(toSave);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden max-h-[92vh]">
        {/* 標題欄 */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">名片 AI 辨識與系統設定</h2>
              <p className="text-xs text-slate-500">配置 Google AI Studio 雲端視覺與一勞永逸模型設定</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 內容區塊 */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm">
          {/* 引擎選擇 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              辨識引擎模式
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, engine: 'local' })}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  settings.engine === 'local'
                    ? 'border-blue-500 bg-blue-50/50 shadow-sm ring-1 ring-blue-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Cpu className={`w-4 h-4 ${settings.engine === 'local' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${settings.engine === 'local' ? 'text-blue-900' : 'text-slate-700'}`}>
                    本機離線 OCR
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  免連網・免 API Key・100% 離線運算保護隱私
                </p>
                {settings.engine === 'local' && (
                  <CheckCircle2 className="w-4 h-4 text-blue-600 absolute top-3 right-3" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setSettings({ ...settings, engine: 'cloud' })}
                className={`p-3.5 rounded-2xl border text-left transition-all relative ${
                  settings.engine === 'cloud'
                    ? 'border-indigo-500 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-500'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Sparkles className={`w-4 h-4 ${settings.engine === 'cloud' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className={`text-xs font-bold ${settings.engine === 'cloud' ? 'text-indigo-900' : 'text-slate-700'}`}>
                    Google Gemini 視覺 AI
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  極致辨識率・支援反光金屬名片與特殊排版
                </p>
                {settings.engine === 'cloud' && (
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 absolute top-3 right-3" />
                )}
              </button>
            </div>
          </div>

          {/* Gemini API Key 設定區塊 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-800">
                <Key className="w-4 h-4 text-indigo-600" />
                <span>Google Gemini API Key</span>
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
                  setSettings({ ...settings, geminiApiKey: e.target.value });
                  setTestResult(null);
                }}
                placeholder="貼上 AIzaSy... 開頭的 API Key"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                <span className="font-bold text-slate-700">使用模型 (未來更新自動相容)：</span>
                <button
                  type="button"
                  onClick={() => setIsCustomModel(!isCustomModel)}
                  className="text-[11px] font-semibold text-indigo-600 hover:underline"
                >
                  {isCustomModel ? '← 返回清單選擇' : '✏️ 手動輸入新模型名稱'}
                </button>
              </div>

              {!isCustomModel ? (
                <select
                  value={settings.modelName || DEFAULT_GEMINI_MODEL}
                  onChange={(e) => setSettings({ ...settings, modelName: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="例如: gemini-3.0-flash 或 gemini-2.5-pro"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    💡 一勞永逸：當 Google 未來發布新模型時，直接在此填寫新模型代號即可，無需升級任何軟體！
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 資安與隱私保障提示 */}
          <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/60 flex items-start space-x-2.5 text-xs text-blue-900">
            <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <div className="font-bold">100% 隱私與本地安全承諾 (Zero Trust)</div>
              <p className="text-blue-800/90">
                您的 API 金鑰僅保存在本機瀏覽器（Local Storage），辨識請求直接從瀏覽器安全連線至 Google AI 官方伺服器，絕不上傳至任何第三方主機。
              </p>
            </div>
          </div>
        </div>

        {/* 底部按鈕 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl shadow-sm transition-all flex items-center space-x-1.5"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>儲存設定</span>
          </button>
        </div>
      </div>
    </div>
  );
};
