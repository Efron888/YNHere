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
  GitMerge,
  ZoomIn,
} from 'lucide-react';
import { detectAndCropCards } from '../../services/cv/cardDetector';
import { CardImageLightbox } from '../common/CardImageLightbox';
import {
  recognizeBusinessCardsFromImage,
  getOcrSettings,
  saveOcrSettings,
  OcrSettings,
  DEFAULT_GEMINI_MODEL,
  POPULAR_GEMINI_MODELS,
} from '../../services/ocr/ocrEngine';
import { calculateDuplicateScore, mergeContacts } from '../../services/deduplication/duplicateMatcher';
import { ContactCard } from '../../types/contact';
import { db } from '../../db/database';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingContacts: ContactCard[];
  onSaveNewContact: (contact: ContactCard) => Promise<void> | void;
  onMergeContact: (updated: ContactCard) => Promise<void> | void;
  onBatchSaveContacts?: (cards: ContactCard[]) => Promise<void> | void;
  onOpenSettings?: () => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  existingContacts,
  onSaveNewContact,
  onMergeContact,
  onBatchSaveContacts,
  onOpenSettings,
}) => {
  const [mode, setMode] = useState<'single' | 'continuous' | 'multi'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [previewCards, setPreviewCards] = useState<ContactCard[]>([]);
  // 紀錄每張 incoming card 對應到的既有重複聯絡人 (支援多張同時去重合併)
  const [duplicateMap, setDuplicateMap] = useState<Record<string, ContactCard>>({});
  const [ocrSettings, setOcrSettings] = useState<OcrSettings>(() => getOcrSettings());
  const [showEngineConfig, setShowEngineConfig] = useState(false);
  const [zoomTarget, setZoomTarget] = useState<ContactCard | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 動態同步 OCR 全域設定，杜絕狀態過期導致無法切換引擎
  useEffect(() => {
    const sync = () => setOcrSettings(getOcrSettings());
    sync();
    window.addEventListener('ocr-settings-updated', sync);
    return () => window.removeEventListener('ocr-settings-updated', sync);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEngineChange = (next: OcrSettings) => {
    setOcrSettings(next);
    saveOcrSettings(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ocr-settings-updated', { detail: next }));
    }
  };

  // 尋找既有聯絡人中是否已有同名或高相似度名片
  const findMatchingExisting = (incoming: ContactCard): ContactCard | undefined => {
    for (const exist of existingContacts) {
      const score = calculateDuplicateScore(exist, incoming);
      const sameRealName =
        incoming.name &&
        incoming.name !== '未命名聯絡人' &&
        exist.name.trim() === incoming.name.trim();
      if (score >= 0.75 || sameRealName) {
        return exist;
      }
    }
    return undefined;
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
      const newDupMap: Record<string, ContactCard> = { ...duplicateMap };

      for (let fIdx = 0; fIdx < fileList.length; fIdx++) {
        const file = fileList[fIdx];
        setStatusMessage(`處理圖片中 (${fIdx + 1}/${fileList.length}): ${file.name}...`);

        try {
          const detected = await detectAndCropCards(file, mode === 'multi' ? 'batch' : 'single');

          for (let i = 0; i < detected.length; i++) {
            setStatusMessage(
              currentSettings.engine === 'cloud' && currentSettings.geminiApiKey
                ? `AI 視覺辨識中 (${fIdx + 1}/${fileList.length}) [${currentSettings.modelName || 'Gemini'}]...`
                : `本機離線 OCR 辨識中 (${fIdx + 1}/${fileList.length})...`
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

              // 檢查是否與目前已辨識隊列中的同批名片重複，或與資料庫既有名片重複
              const matchedExist = findMatchingExisting(newCard);
              if (matchedExist) {
                newDupMap[newCard.id] = matchedExist;
              }

              newRecognizedAll.push(newCard);
            }
          }
        } catch (singleFileErr) {
          console.error(`圖片 ${file.name} 辨識失敗:`, singleFileErr);
          if (fileList.length === 1) throw singleFileErr;
        }
      }

      setDuplicateMap(newDupMap);
      setPreviewCards((prev) => [...prev, ...newRecognizedAll]);
      setStatusMessage(`辨識完成！共識別出 ${newRecognizedAll.length} 位聯絡人`);
    } catch (err: unknown) {
      console.error('掃描辨識錯誤:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`名片辨識發生問題：\n\n${errMsg}\n\n若使用雲端 AI，請點擊上方引擎按鈕檢查 API Key！`);
    } finally {
      setIsProcessing(false);
    }
  };

  // 執行單張合併並自預覽清單剔除
  const handleMergeOne = (incoming: ContactCard, existing: ContactCard) => {
    const merged = mergeContacts(existing, incoming);
    onMergeContact(merged);
    const nextPreview = previewCards.filter((c) => c.id !== incoming.id);
    setPreviewCards(nextPreview);
    const nextDup = { ...duplicateMap };
    delete nextDup[incoming.id];
    setDuplicateMap(nextDup);

    if (nextPreview.length === 0) {
      onClose();
    }
  };

  // 一鍵收錄全部（若有重複名片自動智慧合併，絕不產生 2 張重複名片！）
  const handleSaveOrMergeAll = async () => {
    if (onBatchSaveContacts) {
      await onBatchSaveContacts(previewCards);
    } else {
      for (const card of previewCards) {
        const matchedExist = duplicateMap[card.id] || findMatchingExisting(card);
        if (matchedExist) {
          const merged = mergeContacts(matchedExist, card);
          await onMergeContact(merged);
        } else {
          await onSaveNewContact(card);
        }
      }
    }
    setPreviewCards([]);
    setDuplicateMap({});
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const clonedFiles = Array.from(files);
    e.target.value = '';
    processMultipleFiles(clonedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    processMultipleFiles(Array.from(files));
  };

  const duplicateEntries = previewCards
    .filter((c) => Boolean(duplicateMap[c.id]))
    .map((c) => ({ incoming: c, existing: duplicateMap[c.id] }));

  const modelOptions = Array.from(
    new Set(
      (ocrSettings.availableModels && ocrSettings.availableModels.length > 0
        ? ocrSettings.availableModels
        : POPULAR_GEMINI_MODELS
      ).filter((m) => !m.includes('2.5'))
    )
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl flex flex-col overflow-hidden max-h-[92dvh] sm:max-h-[88vh]">
        {/* 頂部 Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 sticky top-0 z-10 gap-2">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">
              <Camera className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-800 truncate">名片智慧掃描與多張導入</h2>
              <p className="text-[11px] text-slate-500 truncate">支援單張、同框多張切分與相簿多選導入</p>
            </div>
          </div>
          <div className="flex items-center space-x-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowEngineConfig(!showEngineConfig)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 border transition-colors min-h-[38px] ${
                ocrSettings.engine === 'cloud'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {ocrSettings.engine === 'cloud' ? <Sparkles className="w-3.5 h-3.5" /> : <Cpu className="w-3.5 h-3.5" />}
              <span>{ocrSettings.engine === 'cloud' ? 'AI 模型辨識' : '地端離線 OCR'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-200/70 hover:bg-slate-300/80 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1 transition-colors min-h-[38px]"
              title="關閉視窗"
            >
              <X className="w-4 h-4" />
              <span>關閉</span>
            </button>
          </div>
        </div>

        {/* 捲動內容區塊 */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* 常駐快速引擎切換列（手機端一目了然，點選直接切換不卡死） */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-slate-700">當前辨識引擎：</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleEngineChange({ ...ocrSettings, engine: 'local' })}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    ocrSettings.engine === 'local'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  地端離線模型
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const latest = getOcrSettings();
                    // 先立即切換狀態至 cloud 並儲存，確保選項直接切過去不卡在地端
                    const updated: OcrSettings = { ...latest, engine: 'cloud' };
                    handleEngineChange(updated);
                    if (!updated.geminiApiKey?.trim() && onOpenSettings) {
                      onOpenSettings();
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center space-x-1 ${
                    ocrSettings.engine === 'cloud'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Gemini AI 模型辨識</span>
                </button>
              </div>
            </div>

            {(ocrSettings.engine === 'cloud' || showEngineConfig) && (
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 flex-wrap">
                <div className="flex items-center space-x-1.5 flex-1 min-w-[180px]">
                  <span className="text-[11px] font-semibold text-slate-600 whitespace-nowrap">模型：</span>
                  <select
                    value={ocrSettings.modelName || DEFAULT_GEMINI_MODEL}
                    onChange={(e) =>
                      handleEngineChange({
                        ...ocrSettings,
                        engine: 'cloud',
                        modelName: e.target.value,
                      })
                    }
                    className="flex-1 px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-mono text-slate-800"
                  >
                    {modelOptions.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px] hover:bg-indigo-100"
                  >
                    ⚙️ 設定金鑰
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 拍攝模式切換 */}
          <div className="flex items-center justify-center p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
                mode === 'single' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              單張拍照 / 導入
            </button>
            <button
              type="button"
              onClick={() => setMode('continuous')}
              className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
                mode === 'continuous' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              相簿多選連導
            </button>
            <button
              type="button"
              onClick={() => setMode('multi')}
              className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all ${
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
            className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-5 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all space-y-3"
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center text-blue-600">
              {isProcessing ? <RotateCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            </div>

            <div>
              <p className="text-sm font-bold text-slate-800">
                {isProcessing
                  ? statusMessage
                  : mode === 'multi'
                  ? '上傳一張包含多張名片的合照，自動切分提取所有人'
                  : '點選下方按鈕拍照，或從手機相簿一次勾選多張名片圖'}
              </p>
              <p className="text-xs text-slate-400 mt-1">支援 JPG, PNG, WebP・支援同框多張與相簿多選循序導入</p>
            </div>

            <div className="flex items-center justify-center gap-2 sm:gap-3 pt-1 flex-wrap">
              <button
                type="button"
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
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center space-x-1.5 active:scale-95 transition-all disabled:opacity-50"
              >
                <Layers className="w-4 h-4 text-slate-500" />
                <span>從相簿 / 檔案多選導入</span>
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
          {duplicateEntries.map(({ incoming, existing }) => (
            <div
              key={incoming.id}
              className="bg-amber-50 border border-amber-300 p-4 rounded-2xl space-y-2 text-xs text-amber-950 animate-in fade-in"
            >
              <div className="flex items-center space-x-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                <span>發現同名聯絡人「{existing.name}」！</span>
              </div>
              <p className="text-amber-800 leading-relaxed">
                新掃描公司為「{incoming.company || '未指定'}」，既有名片公司為「
                {existing.company || '未指定'}」。點選合併後將更新為1張名片並自動歸檔舊職務（不會產生2張重複名片）。
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleMergeOne(incoming, existing)}
                  className="px-3.5 py-2 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 active:scale-95 transition-all flex items-center space-x-1"
                >
                  <GitMerge className="w-3.5 h-3.5" />
                  <span>合併為 1 張名片（歸檔舊職務）</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSaveNewContact(incoming);
                    const nextPreview = previewCards.filter((c) => c.id !== incoming.id);
                    setPreviewCards(nextPreview);
                    const nextDup = { ...duplicateMap };
                    delete nextDup[incoming.id];
                    setDuplicateMap(nextDup);
                    if (nextPreview.length === 0) onClose();
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 font-semibold hover:bg-amber-100 active:scale-95 transition-all"
                >
                  保留為第 2 張獨立名片
                </button>
              </div>
            </div>
          ))}

          {/* 辨識結果預覽清單 */}
          {previewCards.length > 0 && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span>已辨識完成 ({previewCards.length} 位聯絡人)</span>
                <button
                  type="button"
                  onClick={handleSaveOrMergeAll}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-1 shadow-sm active:scale-95 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>全部收錄（重複自動合併）</span>
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2.5 pr-1">
                {previewCards.map((card) => {
                  const matchedExist = duplicateMap[card.id];
                  return (
                    <div
                      key={card.id}
                      className={`p-3 rounded-2xl border flex items-start justify-between text-xs gap-3 ${
                        matchedExist ? 'bg-amber-50/60 border-amber-300' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start space-x-3 min-w-0 flex-1">
                        <div
                          onClick={() => {
                            if (card.thumbnailDataUrl || card.frontImageId) setZoomTarget(card);
                          }}
                          className={`relative w-14 h-10 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0 overflow-hidden border border-slate-200 ${
                            card.thumbnailDataUrl || card.frontImageId ? 'cursor-zoom-in hover:ring-2 hover:ring-blue-500' : ''
                          }`}
                          title="點擊放大檢視名片照片"
                        >
                          {card.thumbnailDataUrl ? (
                            <>
                              <img src={card.thumbnailDataUrl} alt={card.name} className="w-full h-full object-cover" />
                              <div className="absolute bottom-0 right-0 bg-slate-900/75 text-white p-0.5 rounded-tl">
                                <ZoomIn className="w-2.5 h-2.5" />
                              </div>
                            </>
                          ) : (
                            card.name.slice(0, 1)
                          )}
                        </div>
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                            <span>{card.name}</span>
                            {card.nameEn && <span className="text-slate-500 font-normal">({card.nameEn})</span>}
                            {matchedExist && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">
                                同名將自動合併
                              </span>
                            )}
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
                          type="button"
                          onClick={() => {
                            if (matchedExist) {
                              handleMergeOne(card, matchedExist);
                            } else {
                              onSaveNewContact(card);
                              setPreviewCards((prev) => prev.filter((c) => c.id !== card.id));
                            }
                          }}
                          className={`px-3 py-1.5 rounded-xl text-white font-semibold text-xs active:scale-95 transition-all ${
                            matchedExist ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {matchedExist ? '合併' : '儲存'}
                        </button>
                        <button
                          type="button"
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
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 底部按鈕：鎖定底部，保證手機可隨時關閉或完成 */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-700 bg-slate-200/80 hover:bg-slate-300 rounded-xl transition-colors min-h-[42px] flex items-center justify-center"
          >
            關閉視窗
          </button>
          {previewCards.length > 0 && (
            <button
              type="button"
              onClick={handleSaveOrMergeAll}
              className="flex-1 sm:flex-initial px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5 min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>完成並收錄全部 ({previewCards.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 掃描預覽名片放大檢視器 */}
      <CardImageLightbox
        isOpen={Boolean(zoomTarget)}
        onClose={() => setZoomTarget(null)}
        imageId={zoomTarget?.frontImageId}
        fallbackDataUrl={zoomTarget?.thumbnailDataUrl}
        title={`${zoomTarget?.name || '名片'} — 掃描原圖`}
      />
    </div>
  );
};
