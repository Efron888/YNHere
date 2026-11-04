import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { detectAndCropCards } from '../../services/cv/cardDetector';
import {
  recognizeBusinessCard,
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

  const handleEngineChange = (next: OcrSettings) => {
    setOcrSettings(next);
    saveOcrSettings(next);
  };

  const processImageFile = async (file: File) => {
    try {
      setIsProcessing(true);
      setStatusMessage('正在執行電腦視覺預處理與裁切...');

      const detected = await detectAndCropCards(file, mode === 'multi' ? 'batch' : 'single');

      const recognizedList: ContactCard[] = [];

      for (let i = 0; i < detected.length; i++) {
        setStatusMessage(
          ocrSettings.engine === 'cloud' && ocrSettings.geminiApiKey
            ? `正在透過 Google Gemini (${ocrSettings.modelName || 'gemini-2.5-flash'}) 視覺 AI 辨識 (${i + 1}/${detected.length})...`
            : `正在透過本機離線 OCR + 2D 空間幾何大腦辨識 (${i + 1}/${detected.length})...`
        );
        const item = detected[i];
        const partial = await recognizeBusinessCard(
          item.blob,
          { width: item.width, height: item.height },
          item.thumbnailDataUrl
        );

        const cardId = crypto.randomUUID();
        const imageId = crypto.randomUUID();

        // 將高畫質裁切原圖轉為 Uint8Array 存入 IndexedDB cardImages 表 (防範 iOS Safari Blob 序列化錯誤)
        const bytes = new Uint8Array(await item.blob.arrayBuffer());
        await db.cardImages.put({
          id: imageId,
          mimeType: item.blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
          data: bytes,
          width: item.width,
          height: item.height,
          createdAt: new Date().toISOString(),
        });

        const newCard: ContactCard = {
          id: cardId,
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

        recognizedList.push(newCard);

        // 比對是否有高度相似的既有聯絡人
        for (const exist of existingContacts) {
          const score = calculateDuplicateScore(exist, newCard);
          if (score >= 0.8) {
            setDuplicateTarget({ existing: exist, incoming: newCard });
            break;
          }
        }
      }

      setPreviewCards((prev) => [...prev, ...recognizedList]);
      setStatusMessage('辨識完成！');
    } catch (err: unknown) {
      console.error('掃描辨識錯誤:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`名片辨識發生問題：\n\n${errMsg}\n\n若使用雲端 AI，請點擊上方「🧪 測試連線」確認 API Key 是否有效！`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => processImageFile(file));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => processImageFile(file));
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative space-y-5">
        {/* 頂部 Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-2">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">名片智慧掃描與切分</h2>
              <p className="text-xs text-slate-500">支援單張、連拍與多張選取輸入</p>
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
                  ? `Gemini AI (${ocrSettings.modelName || '2.5-flash'})`
                  : '本機離線 OCR'}
              </span>
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* AI 辨識引擎切換面板 */}
        {showEngineConfig && (
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3 text-xs">
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
                    ? 'bg-blue-50 border-blue-500 text-blue-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <div>引擎 A：本機離線 OCR</div>
                <div className="text-[10px] font-normal text-slate-500 mt-0.5">免費 0 元、免連網、2D 空間幾何解析</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!ocrSettings.geminiApiKey?.trim() && onOpenSettings) {
                    onOpenSettings();
                    return;
                  }
                  handleEngineChange({ ...ocrSettings, engine: 'cloud' });
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  ocrSettings.engine === 'cloud'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-900 font-bold'
                    : 'bg-white border-slate-200 text-slate-600'
                }`}
              >
                <div>引擎 B：Gemini 視覺 AI</div>
                <div className="text-[10px] font-normal text-slate-500 mt-0.5">極致辨識率、支援複雜反光名片</div>
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
        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1.5 rounded-2xl text-xs font-semibold">
          <button
            onClick={() => setMode('single')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'single' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            單張拍攝
          </button>
          <button
            onClick={() => setMode('continuous')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'continuous' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            連續多張選取
          </button>
          <button
            onClick={() => setMode('multi')}
            className={`py-2 rounded-xl transition-all ${
              mode === 'multi' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            多張同框 (1-8張)
          </button>
        </div>

        {/* 上傳 / 拖放區 */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-3xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/20 transition-all space-y-3"
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center text-blue-600">
            {isProcessing ? <RotateCw className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
          </div>

          <div>
            <p className="text-sm font-bold text-slate-800">
              {isProcessing ? statusMessage : '拖放名片圖檔至此，或點選下方按鈕輸入'}
            </p>
            <p className="text-xs text-slate-400 mt-1">支援 JPG, PNG, WebP，可一次選取多張圖片</p>
          </div>

          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isProcessing}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
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
              className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center space-x-1.5 active:scale-95 transition-all"
            >
              <Layers className="w-4 h-4 text-slate-500" />
              <span>從相簿 / 電腦選取檔案</span>
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
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-2 text-xs text-amber-900">
            <div className="flex items-center space-x-2 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>發現既有聯絡人「{duplicateTarget.existing.name}」！是否要合併職涯歷史？</span>
            </div>
            <p className="text-amber-700">
              新名片公司為「{duplicateTarget.incoming.company || '未指定'}」，舊公司為「
              {duplicateTarget.existing.company || '未指定'}」。合併後將自動歸檔至職涯歷史時間軸。
            </p>
            <div className="flex space-x-2 pt-1">
              <button
                onClick={() => {
                  const merged = mergeContacts(duplicateTarget.existing, duplicateTarget.incoming);
                  onMergeContact(merged);
                  setDuplicateTarget(null);
                  alert('已成功合併職涯履歷！');
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
              >
                合併並歸檔舊職務
              </button>
              <button
                onClick={() => {
                  onSaveNewContact(duplicateTarget.incoming);
                  setDuplicateTarget(null);
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100"
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
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center space-x-1 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>全部收錄至名片庫</span>
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2.5 no-scrollbar">
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
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
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
                        <div className="text-slate-500 flex items-center gap-1 flex-wrap">
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

                  <button
                    onClick={() => {
                      onSaveNewContact(card);
                      setPreviewCards(previewCards.filter((c) => c.id !== card.id));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-semibold text-xs hover:bg-blue-700 flex-shrink-0"
                  >
                    儲存
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
