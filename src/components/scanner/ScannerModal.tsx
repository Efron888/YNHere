import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Upload,
  Layers,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Cpu,
  Sparkles,
  Phone,
  Mail,
  Building2,
  Trash2,
} from 'lucide-react';
import { detectAndCropCards } from '../../services/cv/cardDetector';
import {
  recognizeBusinessCardsFromImage,
  getOcrSettings,
  saveOcrSettings,
  OcrSettings,
} from '../../services/ocr/ocrEngine';
import { calculateDuplicateScore, mergeContacts } from '../../services/deduplication/duplicateMatcher';
import { ContactCard } from '../../types/contact';
import { db } from '../../db/database';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: ContactCard[];
  onSaveNewContact: (contact: ContactCard) => void;
  onMergeContact: (updated: ContactCard) => void;
  onOpenSettings?: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  existingContacts,
  onSaveNewContact,
  onMergeContact,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'single' | 'continuous' | 'multi'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewCards, setPreviewCards] = useState<ContactCard[]>([]);
  const [duplicateTarget, setDuplicateTarget] = useState<{ existing: ContactCard; incoming: ContactCard } | null>(null);
  const [ocrSettings, setOcrSettings] = useState<OcrSettings>(() => getOcrSettings());
  const [showEngineConfig, setShowEngineConfig] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 動態同步 OCR 全域設定，杜絕狀態過期導致無法切換引擎
  useEffect(() => {
    const sync = () => setOcrSettings(getOcrSettings());
    sync();
    window.addEventListener('ocr-settings-updated', sync);
    return () => window.removeEventListener('ocr-settings-updated', sync);
  }, [isOpen]);

  const handleEngineChange = (next: OcrSettings) => {
    setOcrSettings(next);
    saveOcrSettings(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ocr-settings-updated', { detail: next }));
    }
  };

  /**
   * 循序非同步隊列處理多圖與同框多名片提取
   * 解決問題 2（多張同框只導 1 人）與問題 5（多選圖片只導 1 人）
   */
  const processMultipleFiles = async (fileList: File[]) => {
    if (!fileList || fileList.length === 0) return;

    try {
      setIsProcessing(true);
      const currentSettings = getOcrSettings();
      const newRecognizedAll: ContactCard[] = [];

      for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
        const file = fileList[fIdx];
        setStatusMessage(`處理圖片中 (${fIdx + 1}/${fileList.length}): ${file.name}...`);

        // 電腦視覺輪廓檢測與裁切
        const detected = await detectAndCropCards(file, mode === 'multi' ? 'batch' : 'single');

        for (let i = 0; i < detected.length; i++) {
          setStatusMessage(
            currentSettings.engine === 'cloud' && currentSettings.geminiApiKey
              ? `AI 辨識中 (${fIdx + 1}/${fileList.length}) 圖 ${i + 1}/${detected.length} [${currentSettings.modelName || 'Gemini'}]...`
              : `本機離線 OCR 辨識中 (${fIdx + 1}/${fileList.length}) 圖 ${i + 1}/${detected.length}...`
          );

          const item = detected[i];
          const partialCards = await recognizeBusinessCardsFromImage(
            item.blob,
            { width: item.width, height: item.height },
            item.thumbnailDataUrl
          );

          const imageId = crypto.randomUUID();
          const bytes = new Uint8Array(await item.blob.arrayBuffer());
          await db.cardImages.put({
            id: imageId,
            mimeType: item.blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
            data: bytes,
            width: item.width,
            height: item.height,
            createdAt: new Date().toISOString(),
          });

          for (const partial of partialCards) {
            const newCard: ContactCard = {
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              name: partial.name || '未命名聯絡人',
              nameEn: partial.nameEn || '',
              company: partial.company || '',
              department: partial.department || '',
              jobTitle: partial.jobTitle || '',
              taxId: partial.taxId || '',
              phones: partial.phones || [],
              emails: partial.emails || [],
              websites: partial.websites || [],
              addresses: partial.addresses || [],
              socialLinks: {},
              tags: ['最新掃描'],
              ribbon: { status: 'none', taskTitle: '' },
              timelineNotes: [],
              careerHistory: [],
              isMyDigitalCard: false,
              frontImageId: imageId,
              thumbnailDataUrl: item.thumbnailDataUrl,
            };

            newRecognizedAll.push(newCard);

            // 比對既有聯絡人，若有高度重複則提示合併
            for (const exist of existingContacts) {
              const score = calculateDuplicateScore(exist, newCard);
              if (score >= 0.8) {
                setDuplicateTarget({ existing: exist, incoming: newCard });
                break;
              }
            }
          }
        }
      }

      setPreviewCards((prev) => [...prev, ...newRecognizedAll]);
      setStatusMessage(`辨識完成！共識別出 ${newRecognizedAll.length} 位聯絡人`);
    } catch (err: unknown) {
      console.error('掃描辨識錯誤:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`名片辨識發生問題：\n\n${errMsg}\n\n若使用雲端 AI，請點擊「AI 辨識引擎」切換或檢查金鑰！`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processMultipleFiles(Array.from(files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    processMultipleFiles(Array.from(files));
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[88vh]">
        {/* 頂部 Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-800">名片智慧掃描與切分</h2>
              <p className="text-xs text-slate-500">支援單張、同框多名片與相簿多選循序辨識</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => setShowEngineConfig(!showEngineConfig)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center space-x-1 border transition-colors ${
                ocrSettings.engine === 'cloud'
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {ocrSettings.engine === 'cloud' ? <Sparkles className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
              <span>
                {ocrSettings.engine === 'cloud'
                  ? `Gemini AI (${ocrSettings.modelName || 'flash'})`
                  : '本機離線 OCR'}
              </span>
            </button>
            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/60 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              title="關閉視窗"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 捲動內容區塊 */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* AI 辨識引擎切換面板 */}
          {showEngineConfig && (
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-700">選擇名片 AI 辨識引擎：</span>
                <a
                  href="https://aistudio.google.com/docs/api-key"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-indigo-600 hover:underline flex items-center space-x-1"
                >
                  <span>取得免費 Gemini Key</span>
                  <span className="text-[9px]">↗</span>
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleEngineChange({ ...ocrSettings, engine: 'local' })}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    ocrSettings.engine === 'local'
                      ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <div>引擎 A：本機離線 OCR</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">免費 0 元、免連網保護隱私</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const latest = getOcrSettings();
                    if (!latest.geminiApiKey?.trim() && onOpenSettings) {
                      onOpenSettings();
                      return;
                    }
                    handleEngineChange({ ...latest, engine: 'cloud' });
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    ocrSettings.engine === 'cloud'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold ring-1 ring-indigo-500'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <div>引擎 B：Gemini 視覺 AI</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">極致辨識率、同框多名片辨識</div>
                </button>
              </div>
              {ocrSettings.engine === 'cloud' && (
                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60 text-indigo-900 bg-indigo-50/50 px-3 py-2 rounded-xl">
                  <div className="flex items-center space-x-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    <span>
                      已啟用 Gemini 視覺 AI：<strong className="font-mono">{ocrSettings.modelName || 'gemini-1.5-flash'}</strong>
                    </span>
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center space-x-0.5"
                    >
                      <span>⚙️ 變更金鑰/模型</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 拍攝模式切換 */}
          <div className="flex items-center justify-center p-1 bg-slate-100 rounded-2xl">
            <button
              onClick={() => setMode('single')}
              className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                mode === 'single' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              單張拍照 / 導入
            </button>
            <button
              onClick={() => setMode('continuous')}
              className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                mode === 'continuous' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              連續掃描多張
            </button>
            <button
              onClick={() => setMode('multi')}
              className={`flex-1 py-1.5 rounded-xl font-bold text-xs transition-all ${
                mode === 'multi' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              多張同框切分
            </button>
          </div>

          {/* 上傳與拍照區域 */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-5 sm:p-6 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all space-y-3"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center text-blue-600">
              {isProcessing ? <RotateCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            </div>

            <div>
              <p className="text-sm font-bold text-slate-800">
                {isProcessing ? statusMessage : '拖放名片圖檔至此，或點選下方按鈕輸入'}
              </p>
              <p className="text-xs text-slate-400 mt-1">支援 JPG, PNG, WebP，可多選相簿照片或拍照</p>
            </div>

            <div className="flex items-center justify-center gap-2 sm:gap-3 pt-1 flex-wrap">
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                <span>開啟相機拍照</span>
              </button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50"
              >
                <Layers className="w-4 h-4 text-slate-500" />
                <span>從相簿 / 檔案多選</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          {/* 偵測到重複人脈提示 (去重與職涯合併精靈) */}
          {duplicateTarget && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2 text-xs text-amber-900 animate-in fade-in">
              <div className="flex items-center space-x-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>發現既有名片「{duplicateTarget.existing.name}」！是否要合併職涯歷程？</span>
              </div>
              <p className="text-amber-700 leading-relaxed">
                新名片公司為「{duplicateTarget.incoming.company || '未指定'}」，舊公司為「
                {duplicateTarget.existing.company || '未指定'}」。合併後將自動歸檔舊職務至職涯歷史時間軸。
              </p>
              <div className="flex space-x-2 pt-1">
                <button
                  onClick={() => {
                    const merged = mergeContacts(duplicateTarget.existing, duplicateTarget.incoming);
                    onMergeContact(merged);
                    // 解決問題 3：合併後必須從預覽隊列中剔除該張卡片，避免後續重複儲存！
                    setPreviewCards((prev) => prev.filter((c) => c.id !== duplicateTarget.incoming.id));
                    setDuplicateTarget(null);
                    alert('已成功合併職涯履歷！');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700 active:scale-95 transition-all"
                >
                  合併並歸檔舊職務
                </button>
                <button
                  onClick={() => {
                    onSaveNewContact(duplicateTarget.incoming);
                    setPreviewCards((prev) => prev.filter((c) => c.id !== duplicateTarget.incoming.id));
                    setDuplicateTarget(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100 active:scale-95 transition-all"
                >
                  當作新聯絡人另存
                </button>
              </div>
            </div>
          )}

          {/* 辨識結果預覽清單 */}
          {previewCards.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>已辨識完成 ({previewCards.length} 張名片)</span>
                <button
                  onClick={() => {
                    previewCards.forEach((c) => onSaveNewContact(c));
                    setPreviewCards([]);
                    onClose();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-1 shadow-sm active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>全部收錄至名片庫</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                {previewCards.map((card) => (
                  <div
                    key={card.id}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start justify-between text-xs gap-3"
                  >
                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                      <div className="w-14 h-10 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-200">
                        {card.thumbnailDataUrl ? (
                          <img src={card.thumbnailDataUrl} alt={card.name} className="w-full h-full object-cover" />
                        ) : (
                          card.name.slice(0, 1)
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{card.name}</span>
                          {card.nameEn && <span className="text-slate-500 font-normal">({card.nameEn})</span>}
                          {card.taxId && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-mono">
                              統編 {card.taxId}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600 flex items-center gap-1 truncate">
                          <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          <span className="truncate">
                            {card.company || '未偵測到公司'} {card.jobTitle && `• ${card.jobTitle}`}
                          </span>
                        </div>
                        {card.phones.length > 0 && (
                          <div className="text-slate-500 flex items-center gap-1 flex-wrap font-mono">
                            <Phone className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span>
                              {card.phones.map((p) => `${p.number}${p.extension ? ` #${p.extension}` : ''}`).join(' / ')}
                            </span>
                          </div>
                        )}
                        {card.emails.length > 0 && (
                          <div className="text-slate-500 flex items-center gap-1 truncate">
                            <Mail className="w-3 h-3 text-slate-400 flex-shrink-0" />
                            <span className="truncate">{card.emails.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          onSaveNewContact(card);
                          setPreviewCards((prev) => prev.filter((c) => c.id !== card.id));
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 active:scale-95 transition-all"
                      >
                        儲存
                      </button>
                      <button
                        onClick={() => {
                          setPreviewCards((prev) => prev.filter((c) => c.id !== card.id));
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="捨棄此張"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按鈕：鎖定底部，保證手機可隨時關閉或完成 */}
        <div className="px-5 sm:px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            關閉視窗
          </button>
          {previewCards.length > 0 && (
            <button
              type="button"
              onClick={() => {
                previewCards.forEach((c) => onSaveNewContact(c));
                setPreviewCards([]);
                onClose();
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all flex items-center space-x-1.5 min-w-[44px] min-h-[44px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>收錄全部 ({previewCards.length})</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
