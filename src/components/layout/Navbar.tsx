import React, { useState } from 'react';
import { AlertCircle, ShieldAlert, Sparkles, DownloadCloud, Settings, Cpu, X } from 'lucide-react';
import { isIOS, isStandaloneMode, getUnbackedCount } from '../../db/storageGuard';
import { getOcrSettings } from '../../services/ocr/ocrEngine';

interface NavbarProps {
  onOpenExchange: () => void;
  onOpenSettings: () => void;
  totalContacts?: number;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenExchange, onOpenSettings, totalContacts = 0 }) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const showIosWarning = isIOS() && !isStandaloneMode();
  const unbackedCount = getUnbackedCount(totalContacts);
  const showBackupPrompt = !isDismissed && unbackedCount >= 5 && totalContacts > 0;
  const ocrSettings = getOcrSettings();
  const isCloudAiActive = ocrSettings.engine === 'cloud' && Boolean(ocrSettings.geminiApiKey?.trim());

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200">
      {/* iOS Safari 未加入主畫面提醒橫幅 */}
      {showIosWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>提示：</strong>iOS Safari 分頁可能因系統清理遺失暫存。建議點擊「分享」加入主畫面獲得永久離線儲存。
            </span>
          </div>
        </div>
      )}

      {/* 未備份名片提醒 */}
      {showBackupPrompt && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-1.5 text-xs text-blue-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <span>您已有 {unbackedCount} 張新增名片未備份，建議立即匯出備份檔。</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenExchange}
              className="flex items-center space-x-1 font-semibold text-blue-700 hover:text-blue-900 underline"
            >
              <DownloadCloud className="w-3.5 h-3.5" />
              <span>立即備份</span>
            </button>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-blue-600 hover:text-blue-900 p-0.5 rounded"
              title="關閉提示"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white font-bold shadow-sm shadow-blue-500/20">
            Y
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-extrabold text-slate-900 text-lg tracking-tight">YNHere</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 tracking-wider">
                PWA
              </span>
            </div>
            <p className="text-[10px] text-slate-500 hidden sm:block -mt-1">跨平台智慧名片管理・Local-First</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* AI 狀態快捷標籤 / 點擊開啟設定 */}
          <button
            onClick={onOpenSettings}
            title="點擊設定 AI 辨識引擎與 Google Gemini API Key"
            className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              isCloudAiActive
                ? 'bg-indigo-50/80 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isCloudAiActive ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-indigo-600 animate-pulse" />
                <span>AI: {ocrSettings.modelName || 'gemini-2.5-flash'}</span>
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5 text-slate-500" />
                <span>引擎: 本機離線</span>
              </>
            )}
          </button>

          <button
            onClick={onOpenExchange}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200/60 flex items-center space-x-1.5 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>交換 / 備份</span>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
            title="設定 (AI 辨識引擎 / Gemini API Key)"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
