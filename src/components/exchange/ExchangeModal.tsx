import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  FileArchive,
  Contact,
  Share2,
  Check,
  Radio,
} from 'lucide-react';
import { ContactCard } from '../../types/contact';
import { exportToVCard, importFromVCard } from '../../services/exchange/vcardCodec';
import { exportToYnpack, importFromYnpack } from '../../services/exchange/ynpackArchive';
import { exportToCsv, parseCsvToContacts } from '../../services/exchange/tabularCodec';
import { encodeContactsToUrlHash } from '../../services/exchange/urlShareCodec';
import { resetUnbackedCount } from '../../db/storageGuard';
import { db } from '../../db/database';

interface ExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  allContacts: ContactCard[];
  selectedContacts: ContactCard[];
  onImportSuccess: (imported: ContactCard[]) => void;
}

export const ExchangeModal: React.FC<ExchangeModalProps> = ({
  isOpen,
  onClose,
  allContacts,
  selectedContacts,
  onImportSuccess,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'share'>('export');
  const [exportScope, setExportScope] = useState<'selected' | 'all'>(
    selectedContacts.length > 0 ? 'selected' : 'all'
  );
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareError, setShareError] = useState('');

  const vcfInputRef = useRef<HTMLInputElement>(null);
  const ynpackInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const targets = exportScope === 'selected' && selectedContacts.length > 0 ? selectedContacts : allContacts;

  // 1. 匯出 vCard (.vcf)
  const handleExportVcf = () => {
    const vcf = exportToVCard(targets);
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${targets.length}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    resetUnbackedCount(allContacts.length);
  };

  // 2. 匯出 .ynpack (ZIP)
  const handleExportYnpack = async () => {
    const images = new Map<string, Uint8Array>();
    for (const c of targets) {
      if (c.frontImageId) {
        const rec = await db.cardImages.get(c.frontImageId);
        if (rec) images.set(c.frontImageId, rec.data);
      }
      if (c.backImageId) {
        const rec = await db.cardImages.get(c.backImageId);
        if (rec) images.set(c.backImageId, rec.data);
      }
    }

    const zipBytes = await exportToYnpack(targets, images);
    const blob = new Blob([zipBytes as BlobPart], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ynhere-backup-${targets.length}.ynpack`;
    a.click();
    URL.revokeObjectURL(url);
    resetUnbackedCount(allContacts.length);
  };

  // 3. 匯出 CSV (Excel)
  const handleExportCsv = () => {
    const csv = exportToCsv(targets);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts-${targets.length}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    resetUnbackedCount(allContacts.length);
  };

  // 4. 匯入處理
  const handleImportVcf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const imported = importFromVCard(text);
      onImportSuccess(imported);
      alert(`成功自 vCard 匯入 ${imported.length} 筆聯絡人！`);
      onClose();
    };
    reader.readAsText(file);
  };

  const handleImportYnpack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const { contacts, images } = await importFromYnpack(bytes);

    // 儲存還原的圖片
    for (const [id, data] of images.entries()) {
      await db.cardImages.put({
        id,
        mimeType: 'image/webp',
        data,
        createdAt: new Date().toISOString(),
      });
    }

    onImportSuccess(contacts);
    alert(`成功自 .ynpack 備份檔還原 ${contacts.length} 張名片與圖片！`);
    onClose();
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const imported = parseCsvToContacts(text);
      onImportSuccess(imported);
      alert(`成功自表格匯入 ${imported.length} 筆聯絡人！`);
      onClose();
    };
    reader.readAsText(file);
  };

  // 5. 產生 URL Hash 加密分享連結
  const handleGenerateShareLink = () => {
    setShareError('');
    try {
      const hash = encodeContactsToUrlHash(targets);
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      navigator.clipboard.writeText(url);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setShareError(err.message);
      } else {
        setShareError('產生分享連結失敗');
      }
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[88vh]">
        {/* 頂部 Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              ⇄
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">名片導入、導出與分享中心</h2>
              <p className="text-xs text-slate-500">跨 iPhone、Android、Windows 與 Mac 自由流通</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
            title="關閉視窗"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 滾動內容區 */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* 分頁切換 */}
          <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('export')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'export' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              匯出 (Export)
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'import' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              匯入 (Import)
            </button>
            <button
              onClick={() => setActiveTab('share')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'share' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              交換與分享
            </button>
          </div>

        {/* 分頁 1: 匯出 */}
        {activeTab === 'export' && (
          <div className="space-y-4">
            {/* 選取範圍切換 */}
            <div className="flex items-center space-x-4 text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
              <span>匯出範圍：</span>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === 'selected'}
                  onChange={() => setExportScope('selected')}
                  disabled={selectedContacts.length === 0}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>已勾選名片 ({selectedContacts.length} 張)</span>
              </label>
              <label className="flex items-center space-x-1.5 cursor-pointer">
                <input
                  type="radio"
                  name="scope"
                  checked={exportScope === 'all'}
                  onChange={() => setExportScope('all')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>全部名片 ({allContacts.length} 張)</span>
              </label>
            </div>

            {/* 三大匯出選項卡 */}
            <div className="space-y-2.5">
              <button
                onClick={handleExportVcf}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-blue-600 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <Contact className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">標準通訊錄檔 (.vcf)</div>
                    <div className="text-xs text-slate-500">直通 iPhone / Android / Google / Outlook 通訊錄</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>

              <button
                onClick={handleExportYnpack}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">YNHere 完整封裝包 (.ynpack)</div>
                    <div className="text-xs text-slate-500">包含完整圖文、時間軸備註、絲帶與職涯歷史 (ZIP)</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
              </button>

              <button
                onClick={handleExportCsv}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-indigo-700 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">Excel 報表 (.csv)</div>
                    <div className="text-xs text-slate-500">內建 UTF-8 BOM，Windows Excel 打開不亂碼</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-700" />
              </button>
            </div>
          </div>
        )}

        {/* 分頁 2: 匯入 */}
        {activeTab === 'import' && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">請選取要還原或搬家匯入的檔案類型：</p>

            <button
              onClick={() => ynpackInputRef.current?.click()}
              className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
            >
              <div className="flex items-center space-x-3 text-left">
                <div className="p-2.5 rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200">
                  <FileArchive className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">還原 .ynpack 備份包</div>
                  <div className="text-xs text-slate-500">跨手機、換電腦完整還原名片照片與歷史紀錄</div>
                </div>
              </div>
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />
            </button>
            <input
              ref={ynpackInputRef}
              type="file"
              accept=".ynpack,.zip"
              onChange={handleImportYnpack}
              className="hidden"
            />

            <button
              onClick={() => vcfInputRef.current?.click()}
              className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
            >
              <div className="flex items-center space-x-3 text-left">
                <div className="p-2.5 rounded-xl bg-white text-blue-600 shadow-sm border border-slate-200">
                  <Contact className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">匯入 .vcf 通訊錄</div>
                  <div className="text-xs text-slate-500">自 iPhone、Android 或 Google Contacts 匯入</div>
                </div>
              </div>
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
            </button>
            <input ref={vcfInputRef} type="file" accept=".vcf" onChange={handleImportVcf} className="hidden" />

            <button
              onClick={() => csvInputRef.current?.click()}
              className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
            >
              <div className="flex items-center space-x-3 text-left">
                <div className="p-2.5 rounded-xl bg-white text-indigo-700 shadow-sm border border-slate-200">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">CamCard / 通用 CSV 搬家</div>
                  <div className="text-xs text-slate-500">支援名片全能王等表格匯出檔自動對照欄位</div>
                </div>
              </div>
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-700" />
            </button>
            <input ref={csvInputRef} type="file" accept=".csv" onChange={handleImportCsv} className="hidden" />
          </div>
        )}

        {/* 分頁 3: 交換與分享 */}
        {activeTab === 'share' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-slate-900">
                <Share2 className="w-4 h-4 text-blue-600" />
                <span>零後端加密連結分享 (免伺服器儲存)</span>
              </div>
              <p className="text-xs text-slate-500">
                將所選的 {targets.length} 張名片壓縮編碼於網址後方，直接傳給同事，對方點開即可預覽並一鍵收錄！（硬性上限：最多 10 張）
              </p>

              {shareError && <div className="p-2 bg-red-50 text-red-700 text-xs rounded-lg">{shareError}</div>}

              <button
                onClick={handleGenerateShareLink}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors"
              >
                {shareLinkCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{shareLinkCopied ? '已複製加密連結至剪貼簿！' : `複製所選 ${targets.length} 張名片分享連結`}</span>
              </button>
            </div>

            {/* WebRTC 當面互傳說明 */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-600">
              <div className="flex items-center space-x-2 font-bold text-slate-900">
                <Radio className="w-4 h-4 text-indigo-600" />
                <span>當面面對面互傳 (WebRTC P2P)</span>
              </div>
              <p className="text-slate-500">
                雙方處於同一空間時，點擊名片上的「展示 QR Code」，讓對方用手機直接掃描，即可透過點對點通道傳送含照片的名片包！
              </p>
            </div>
          </div>
        )}
        </div>

        {/* 底部按鈕：鎖定底部，保證手機可隨時關閉或完成 */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
