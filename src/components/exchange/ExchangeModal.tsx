import React, { useState, useRef, useEffect } from 'react';
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
  Smartphone,
  CheckSquare,
  Square,
} from 'lucide-react';
import { ContactCard, PhoneItem } from '../../types/contact';
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
  const [activeTab, setActiveTab] = useState<'export' | 'import' | 'share'>('export');
  const [exportScope, setExportScope] = useState<'selected' | 'all'>(
    selectedContacts.length > 0 ? 'selected' : 'all'
  );
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    () => new Set(selectedContacts.map((c) => c.id))
  );
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [shareError, setShareError] = useState('');

  const vcfInputRef = useRef<HTMLInputElement>(null);
  const ynpackInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInternalSelectedIds(new Set(selectedContacts.map((c) => c.id)));
      setExportScope(selectedContacts.length > 0 ? 'selected' : 'all');
      setShareError('');
    }
  }, [isOpen, selectedContacts]);

  if (!isOpen) return null;

  const toggleInternalId = (id: string) => {
    const next = new Set(internalSelectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setInternalSelectedIds(next);
    if (next.size > 0) {
      setExportScope('selected');
    }
  };

  const chosenContacts = allContacts.filter((c) => internalSelectedIds.has(c.id));
  const targets = exportScope === 'selected' && chosenContacts.length > 0 ? chosenContacts : allContacts;

  // 1. 匯出 vCard (.vcf) — 支援多筆聯絡人一次匯入 iPhone / Android
  const handleExportVcf = () => {
    if (targets.length === 0) {
      alert('目前沒有可匯出的聯絡人！');
      return;
    }
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

  // 2. 匯出 .ynpack 完整封裝包
  const handleExportYnpack = async () => {
    if (targets.length === 0) {
      alert('目前沒有可匯出的聯絡人！');
      return;
    }
    const imagesMap = new Map<string, Uint8Array>();

    for (const c of targets) {
      if (c.frontImageId) {
        const img = await db.cardImages.get(c.frontImageId);
        if (img) {
          imagesMap.set(c.frontImageId, img.data);
        }
      }
      if (c.backImageId) {
        const img = await db.cardImages.get(c.backImageId);
        if (img) {
          imagesMap.set(c.backImageId, img.data);
        }
      }
    }

    const zipBytes = exportToYnpack(targets, imagesMap);
    const blob = new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' });
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
    if (targets.length === 0) {
      alert('目前沒有可匯出的聯絡人！');
      return;
    }
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

  // 4A. 原生手機通訊錄多選導入 (Android Chrome Contact Picker API)
  const handleNativeContactPicker = async () => {
    const nav = navigator as Navigator & {
      contacts?: {
        select: (
          properties: string[],
          options?: { multiple?: boolean }
        ) => Promise<
          Array<{
            name?: string[];
            tel?: string[];
            email?: string[];
            address?: Array<{ addressLine?: string[] }>;
          }>
        >;
      };
    };

    if (nav.contacts && typeof nav.contacts.select === 'function') {
      try {
        const picked = await nav.contacts.select(['name', 'tel', 'email', 'address'], { multiple: true });
        if (!picked || picked.length === 0) return;

        const imported: ContactCard[] = picked.map((item) => {
          const phones: PhoneItem[] = (item.tel || [])
            .map((t) => String(t).trim())
            .filter(Boolean)
            .map((num) => ({
              type: /^09|\+8869/.test(num.replace(/[^\d+]/g, '')) ? 'mobile' : 'work',
              number: num,
              normalizedDialString: num,
            }));

          const emails = (item.email || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
          const addresses = (item.address || [])
            .map((a) => (a.addressLine || []).join(' ').trim())
            .filter(Boolean);

          return {
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            name: item.name?.[0]?.trim() || '未命名聯絡人',
            nameEn: '',
            company: '',
            department: '',
            jobTitle: '',
            taxId: '',
            phones,
            emails,
            websites: [],
            addresses,
            socialLinks: {},
            tags: ['手機通訊錄匯入'],
            ribbon: { status: 'none', taskTitle: '' },
            timelineNotes: [],
            careerHistory: [],
            isMyDigitalCard: false,
          };
        });

        onImportSuccess(imported);
        alert(`成功自手機通訊錄多選導入 ${imported.length} 位聯絡人！`);
        onClose();
      } catch (err) {
        console.warn('原生通訊錄選取取消或失敗，改用檔案匯入:', err);
      }
    } else {
      vcfInputRef.current?.click();
    }
  };

  // 4B. 匯入 vCard (.vcf) — 支援多檔選取與單檔多筆聯絡人
  const handleImportVcf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allImported: ContactCard[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      const parsed = importFromVCard(text);
      allImported.push(...parsed);
    }

    e.target.value = '';
    if (allImported.length === 0) {
      alert('未在所選 .vcf 檔案中偵測到有效聯絡人！');
      return;
    }

    onImportSuccess(allImported);
    alert(`成功自 vCard 匯入 ${allImported.length} 位聯絡人！`);
    onClose();
  };

  const handleImportYnpack = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allImported: ContactCard[] = [];
    for (const file of Array.from(files)) {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const { contacts, images } = await importFromYnpack(bytes);

      for (const [id, data] of images.entries()) {
        await db.cardImages.put({
          id,
          mimeType: 'image/webp',
          data,
          createdAt: new Date().toISOString(),
        });
      }
      allImported.push(...contacts);
    }

    e.target.value = '';
    onImportSuccess(allImported);
    alert(`成功自 .ynpack 備份檔還原 ${allImported.length} 張名片與圖片！`);
    onClose();
  };

  const handleImportCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allImported: ContactCard[] = [];
    for (const file of Array.from(files)) {
      const text = await file.text();
      const imported = parseCsvToContacts(text);
      allImported.push(...imported);
    }

    e.target.value = '';
    onImportSuccess(allImported);
    alert(`成功自表格匯入 ${allImported.length} 筆聯絡人！`);
    onClose();
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
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              ⇄
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-800 truncate">名片導入、導出與分享中心</h2>
              <p className="text-[11px] text-slate-500 truncate">跨 iPhone、Android、Windows 與 Mac 自由流通</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200/70 hover:bg-slate-300/80 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1 transition-colors min-h-[38px] flex-shrink-0"
            title="關閉視窗"
          >
            <X className="w-4 h-4" />
            <span>關閉</span>
          </button>
        </div>

        {/* 滾動內容區 */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* 分頁切換 */}
          <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1.5 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('export')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'export' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              匯出 ({targets.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('import')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'import' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              匯入多筆聯絡人
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('share')}
              className={`py-2 rounded-xl transition-all ${
                activeTab === 'share' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              交換與分享
            </button>
          </div>

          {/* 匯出與分享共用的名片選擇器 (解決手機端快速選取單張或多張名片需求) */}
          {(activeTab === 'export' || activeTab === 'share') && (
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="font-bold text-slate-700">選擇要處理的名片範圍：</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExportScope('all')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      exportScope === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    全部名片 ({allContacts.length} 張)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportScope('selected')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      exportScope === 'selected'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    自選單張/多張 ({internalSelectedIds.size} 張)
                  </button>
                </div>
              </div>

              {exportScope === 'selected' && (
                <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>請點選要匯出或分享的名片：</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (internalSelectedIds.size === allContacts.length) {
                          setInternalSelectedIds(new Set());
                        } else {
                          setInternalSelectedIds(new Set(allContacts.map((c) => c.id)));
                        }
                      }}
                      className="text-blue-600 font-bold hover:underline"
                    >
                      {internalSelectedIds.size === allContacts.length ? '取消全選' : '全選全部'}
                    </button>
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {allContacts.map((c) => {
                      const checked = internalSelectedIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleInternalId(c.id)}
                          className={`w-full px-3 py-2 rounded-xl border text-left flex items-center justify-between transition-all ${
                            checked
                              ? 'bg-blue-50/80 border-blue-400 text-blue-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            )}
                            <span className="truncate">{c.name}</span>
                            {c.company && <span className="text-[10px] text-slate-400 truncate">• {c.company}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 分頁 1: 匯出 */}
          {activeTab === 'export' && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleExportVcf}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-blue-600 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <Contact className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      匯出至手機通訊錄 (.vcf，共 {targets.length} 人)
                    </div>
                    <div className="text-xs text-slate-500">直通 iPhone / Android / Google 通訊錄一次導入多人</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0" />
              </button>

              <button
                type="button"
                onClick={handleExportYnpack}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-indigo-600 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <FileArchive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      YNHere 完整封裝包 (.ynpack，共 {targets.length} 人)
                    </div>
                    <div className="text-xs text-slate-500">包含完整圖文、時間軸備註、絲帶與職涯歷史 (ZIP)</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
              </button>

              <button
                type="button"
                onClick={handleExportCsv}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-indigo-700 shadow-sm border border-slate-200 group-hover:scale-105 transition-transform">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">
                      Excel 報表 (.csv，共 {targets.length} 人)
                    </div>
                    <div className="text-xs text-slate-500">內建 UTF-8 BOM 與統編前導 0 保護，Excel 不亂碼</div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-400 group-hover:text-indigo-700 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* 分頁 2: 匯入 */}
          {activeTab === 'import' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">請選取要導入的來源（支援一次多選聯絡人或多檔同時匯入）：</p>

              <button
                type="button"
                onClick={handleNativeContactPicker}
                className="w-full p-4 rounded-2xl border-2 border-blue-300 hover:border-blue-500 bg-blue-50/60 hover:bg-blue-100/50 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-sm">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-blue-950 text-sm">從手機通訊錄多選導入聯絡人</div>
                    <div className="text-xs text-blue-700">直接開啟手機通訊錄勾選多位聯絡人，或選取多筆 .vcf 檔案</div>
                  </div>
                </div>
                <Upload className="w-4 h-4 text-blue-600 flex-shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => vcfInputRef.current?.click()}
                className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 flex items-center justify-between transition-all group"
              >
                <div className="flex items-center space-x-3 text-left">
                  <div className="p-2.5 rounded-xl bg-white text-blue-600 shadow-sm border border-slate-200">
                    <Contact className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-sm">匯入 .vcf 通訊錄檔 (支援多筆/多檔)</div>
                    <div className="text-xs text-slate-500">相容 iPhone、Android、Google Contacts 匯出之多人通訊錄</div>
                  </div>
                </div>
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0" />
              </button>
              <input
                ref={vcfInputRef}
                type="file"
                accept=".vcf,text/vcard,text/x-vcard"
                multiple
                onChange={handleImportVcf}
                className="hidden"
              />

              <button
                type="button"
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
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 flex-shrink-0" />
              </button>
              <input
                ref={ynpackInputRef}
                type="file"
                accept=".ynpack,.zip"
                multiple
                onChange={handleImportYnpack}
                className="hidden"
              />

              <button
                type="button"
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
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-indigo-700 flex-shrink-0" />
              </button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={handleImportCsv}
                className="hidden"
              />
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
                  將上方所選的 <strong>{targets.length}</strong> 張名片壓縮編碼於網址後方，直接傳給同事，對方點開即可預覽並一鍵收錄！（上限最多 10 張）
                </p>

                {shareError && <div className="p-2 bg-red-50 text-red-700 text-xs rounded-lg">{shareError}</div>}

                <button
                  type="button"
                  onClick={handleGenerateShareLink}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs flex items-center justify-center space-x-1.5 transition-colors"
                >
                  {shareLinkCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                  <span>
                    {shareLinkCopied ? '已複製加密連結至剪貼簿！' : `複製所選 ${targets.length} 張名片分享連結`}
                  </span>
                </button>
              </div>

              {/* WebRTC 當面互傳說明 */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs text-slate-600">
                <div className="flex items-center space-x-2 font-bold text-slate-900">
                  <Radio className="w-4 h-4 text-indigo-600" />
                  <span>當面面對面互傳 (QR Code)</span>
                </div>
                <p className="text-slate-500">
                  雙方處於同一空間時，點擊名片上的「展示 QR Code」，讓對方用手機直接掃描，即可一鍵存入通訊錄！
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部按鈕：鎖定底部，保證手機可隨時關閉或完成 */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 text-xs font-bold text-slate-700 bg-slate-200/80 hover:bg-slate-300 rounded-xl transition-colors min-h-[42px] flex items-center justify-center"
          >
            關閉視窗
          </button>
        </div>
      </div>
    </div>
  );
};
