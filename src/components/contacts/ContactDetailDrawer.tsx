import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Phone,
  Mail,
  Building2,
  Calendar,
  Tag,
  Plus,
  Trash2,
  Save,
  Clock,
  History,
  Download,
  Sparkles,
  Upload,
  RotateCw,
} from 'lucide-react';
import { ContactCard, RibbonTask, TimelineNote } from '../../types/contact';
import { exportRibbonToIcs } from '../../services/exchange/calendarIcs';
import { detectAndCropCards } from '../../services/cv/cardDetector';
import {
  recognizeBusinessCard,
  getOcrSettings,
  saveOcrSettings,
  OcrSettings,
} from '../../services/ocr/ocrEngine';
import { normalizeTaiwanTaxId } from '../../services/ocr/twValidators';
import { db } from '../../db/database';
import { Settings } from 'lucide-react';

interface ContactDetailDrawerProps {
  contact: ContactCard | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: ContactCard) => void;
  onDelete: (id: string) => void;
  onOpenSettings?: () => void;
}

export const ContactDetailDrawer: React.FC<ContactDetailDrawerProps> = ({
  contact,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onOpenSettings,
}) => {
  if (!isOpen || !contact) return null;

  const [form, setForm] = useState<ContactCard>({ ...contact });
  const [newTag, setNewTag] = useState('');
  const [newNote, setNewNote] = useState('');
  const [noteCategory, setNoteCategory] = useState<TimelineNote['category']>('visit');
  const [isReRecognizing, setIsReRecognizing] = useState(false);
  const [ocrSettings, setOcrSettings] = useState<OcrSettings>(() => getOcrSettings());
  const reUploadInputRef = useRef<HTMLInputElement>(null);

  const handleEngineChange = (next: OcrSettings) => {
    setOcrSettings(next);
    saveOcrSettings(next);
  };

  // 即時監聽與同步全域 AI 辨識設定
  useEffect(() => {
    const syncSettings = () => setOcrSettings(getOcrSettings());
    syncSettings();
    window.addEventListener('ocr-settings-updated', syncSettings);
    return () => window.removeEventListener('ocr-settings-updated', syncSettings);
  }, [isOpen]);

  useEffect(() => {
    setForm({ ...contact });
  }, [contact]);

  // 鎖定背景 body 滾動，確保視窗最右側拉條是名片專屬滾動條，避免誤操作拉到背景
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const handleReRecognizeExisting = async () => {
    try {
      if (ocrSettings.engine === 'cloud' && !ocrSettings.geminiApiKey?.trim()) {
        if (
          confirm(
            '您已啟用雲端 Gemini AI 辨識，但尚未輸入 API Key！\n\n是否立即開啟系統設定視窗填寫 Google Gemini Key？\n（若點「取消」，本次將自動降級以本機離線 OCR 進行辨識）'
          )
        ) {
          if (onOpenSettings) onOpenSettings();
          return;
        }
      }

      setIsReRecognizing(true);
      let imageSource: Blob | string | undefined;
      let width = 960;
      let height = 560;

      if (form.frontImageId) {
        const storedImg = await db.cardImages.get(form.frontImageId);
        if (storedImg) {
          imageSource = new Blob([storedImg.data as unknown as BlobPart], { type: storedImg.mimeType });
          width = storedImg.width || 960;
          height = storedImg.height || 560;
        }
      }
      if (!imageSource && form.thumbnailDataUrl) {
        imageSource = form.thumbnailDataUrl;
      }

      if (!imageSource) {
        alert('此聯絡人尚無名片圖檔，請點選「更換/上傳名片圖並辨識」！');
        return;
      }

      const partial = await recognizeBusinessCard(imageSource, { width, height }, form.thumbnailDataUrl);
      const updated: ContactCard = {
        ...form,
        updatedAt: new Date().toISOString(),
        name: partial.name || '未命名聯絡人',
        nameEn: partial.nameEn ?? '',
        company: partial.company ?? '',
        department: partial.department ?? '',
        jobTitle: partial.jobTitle ?? '',
        taxId: normalizeTaiwanTaxId(partial.taxId ?? ''),
        phones: partial.phones && partial.phones.length > 0 ? partial.phones : form.phones,
        emails: partial.emails && partial.emails.length > 0 ? partial.emails : form.emails,
        websites: partial.websites && partial.websites.length > 0 ? partial.websites : form.websites,
        addresses: partial.addresses && partial.addresses.length > 0 ? partial.addresses : form.addresses,
      };
      setForm(updated);
      onSave(updated);
      alert('✨ 名片 AI 辨識完成！資料已自動更新。');
    } catch (err: unknown) {
      console.error('重新辨識失敗:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      if (ocrSettings.engine === 'cloud') {
        alert(
          `❌ 雲端 Gemini AI 辨識失敗：\n\n${errMsg}\n\n建議點選下方「🧪 測試」按鈕確認 API Key 連線，或切換為「引擎 A：本機離線 OCR」！`
        );
      } else {
        alert(`名片辨識發生問題：${errMsg}，建議點選「更換/上傳名片圖並辨識」重新選擇原圖！`);
      }
    } finally {
      setIsReRecognizing(false);
    }
  };

  const handleReUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      if (ocrSettings.engine === 'cloud' && !ocrSettings.geminiApiKey?.trim()) {
        if (
          confirm(
            '您已啟用雲端 Gemini AI 辨識，但尚未輸入 API Key！\n\n是否立即開啟系統設定視窗填寫 Google Gemini Key？\n（若點「取消」，本次將自動降級以本機離線 OCR 進行辨識）'
          )
        ) {
          if (onOpenSettings) onOpenSettings();
          return;
        }
      }

      setIsReRecognizing(true);
      const detected = await detectAndCropCards(file, 'single');
      if (detected.length === 0) return;
      const item = detected[0];
      const partial = await recognizeBusinessCard(
        item.blob,
        { width: item.width, height: item.height },
        item.thumbnailDataUrl
      );

      const imageId = form.frontImageId || crypto.randomUUID();
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      await db.cardImages.put({
        id: imageId,
        mimeType: item.blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
        data: bytes,
        width: item.width,
        height: item.height,
        createdAt: new Date().toISOString(),
      });

      const updated: ContactCard = {
        ...form,
        updatedAt: new Date().toISOString(),
        name: partial.name || '未命名聯絡人',
        nameEn: partial.nameEn ?? '',
        company: partial.company ?? '',
        department: partial.department ?? '',
        jobTitle: partial.jobTitle ?? '',
        taxId: normalizeTaiwanTaxId(partial.taxId ?? ''),
        phones: partial.phones || [],
        emails: partial.emails || [],
        websites: partial.websites || [],
        addresses: partial.addresses || [],
        frontImageId: imageId,
        thumbnailDataUrl: item.thumbnailDataUrl,
      };
      setForm(updated);
      onSave(updated);
      alert('✨ 新名片圖已上傳並完成 AI 辨識！');
    } catch (err: unknown) {
      console.error('上傳並辨識失敗:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      alert(`名片上傳或辨識失敗：\n\n${errMsg}`);
    } finally {
      setIsReRecognizing(false);
    }
  };

  const handleAddTag = () => {
    if (!newTag.trim()) return;
    if (!form.tags.includes(newTag.trim())) {
      setForm({ ...form, tags: [...form.tags, newTag.trim()] });
    }
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    setForm({ ...form, tags: form.tags.filter((t) => t !== tag) });
  };

  const handleAddTimelineNote = () => {
    if (!newNote.trim()) return;
    const note: TimelineNote = {
      id: crypto.randomUUID(),
      content: newNote.trim(),
      createdAt: new Date().toISOString(),
      category: noteCategory,
    };
    setForm({ ...form, timelineNotes: [note, ...form.timelineNotes] });
    setNewNote('');
  };

  const handleDownloadIcs = () => {
    const icsContent = exportRibbonToIcs(form);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reminder-${form.name}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-sm transition-opacity"
    >
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-y-auto">
        {/* 頂部 Header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-md px-6 py-4 border-b border-slate-200 flex items-center justify-between z-10 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-bold text-slate-600 border border-slate-200">
              {form.thumbnailDataUrl ? (
                <img src={form.thumbnailDataUrl} alt={form.name} className="w-full h-full object-cover rounded-xl" />
              ) : (
                form.name.slice(0, 1)
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900">{form.name}</h2>
                {form.isMyDigitalCard && (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md">
                    👑 我的個人數位名片
                  </span>
                )}
                {form.createdAt && (
                  <span
                    className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md font-mono"
                    title={`建立時間: ${new Date(form.createdAt).toLocaleString('zh-TW', { hour12: false })}`}
                  >
                    建立於 {new Date(form.createdAt).toLocaleDateString('zh-TW')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">{form.company || '無公司資訊'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onSave(form);
                onClose();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs flex items-center space-x-1.5 shadow-sm transition-colors min-h-[38px]"
            >
              <Save className="w-4 h-4" />
              <span>儲存</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors"
              title="關閉名片"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 內容表單 */}
        <div className="p-6 space-y-6 flex-1">
          {/* 名片原圖預覽與 AI 重新辨識工具列 */}
          <div className="bg-blue-50/60 p-4 rounded-2xl border border-blue-200/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold text-blue-900 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>名片影像與 AI 智慧重新辨識</span>
              </div>
              <div className="flex items-center gap-2">
                {(form.thumbnailDataUrl || form.frontImageId) && (
                  <button
                    type="button"
                    disabled={isReRecognizing}
                    onClick={handleReRecognizeExisting}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center space-x-1 shadow-sm disabled:opacity-50"
                  >
                    {isReRecognizing ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isReRecognizing ? '正在辨識中...' : '重新 AI 辨識此圖'}</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={isReRecognizing}
                  onClick={() => reUploadInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-white border border-blue-300 hover:bg-blue-50 text-blue-800 text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>更換/上傳名片圖並辨識</span>
                </button>
                <input
                  ref={reUploadInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleReUploadImage}
                  className="hidden"
                />
              </div>
            </div>

            {!form.frontImageId && form.thumbnailDataUrl && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-xl text-[11px] leading-relaxed">
                ⚠️ <strong>畫質提醒</strong>：此筆為舊版儲存之 <strong>300px 低解析小縮圖</strong>（小字僅 5 像素高）。建議點選上方 <strong>「更換/上傳名片圖並辨識」</strong> 重新選取原始清晰圖片，或於下方切換為 <strong>Gemini 2.5 雲端視覺 AI</strong>。
              </div>
            )}

            {/* 引擎快速切換列 */}
            <div className="bg-white/90 p-3 rounded-xl border border-blue-200/70 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-semibold text-slate-600 text-[11px]">當前 AI 辨識引擎：</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleEngineChange({ ...ocrSettings, engine: 'local' })}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      ocrSettings.engine === 'local'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    引擎 A：本機離線 OCR (免費)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const latest = getOcrSettings();
                      if (!latest.geminiApiKey?.trim()) {
                        if (onOpenSettings) onOpenSettings();
                        return;
                      }
                      handleEngineChange({ ...latest, engine: 'cloud' });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      ocrSettings.engine === 'cloud'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    引擎 B：Gemini 視覺 AI
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      title="開啟名片 AI 辨識與系統設定 (設定 API Key 與測試連線)"
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {ocrSettings.engine === 'cloud' && (
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-indigo-50 text-indigo-900 bg-indigo-50/40 px-2.5 py-1.5 rounded-lg">
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

            {form.thumbnailDataUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 bg-white max-h-52 flex items-center justify-center">
                <img
                  src={form.thumbnailDataUrl}
                  alt={form.name}
                  className="max-h-52 w-auto object-contain"
                />
              </div>
            )}
          </div>

          {/* 基本資料卡 */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-4">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>核心基本欄位</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">中文姓名 *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">英文姓名</label>
                <input
                  type="text"
                  value={form.nameEn}
                  onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">公司名稱</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">職稱</label>
                <input
                  type="text"
                  value={form.jobTitle}
                  onChange={(e) => setForm({ ...form, jobTitle: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">統一編號 (8碼)</label>
                <input
                  type="text"
                  value={form.taxId}
                  onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                  onBlur={(e) => {
                    const norm = normalizeTaiwanTaxId(e.target.value);
                    if (norm && norm !== form.taxId) {
                      setForm({ ...form, taxId: norm });
                    }
                  }}
                  placeholder="例如: 04757891"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">部門</label>
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
                />
              </div>
            </div>
          </div>

          {/* 聯絡方式卡 */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Phone className="w-4 h-4 text-blue-600" />
              <span>通訊與地址</span>
            </h3>

            {/* 電話列表 */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600">電話 / 手機 / 獨立分機</label>
              {form.phones.map((phone, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <select
                    value={phone.type}
                    onChange={(e) => {
                      const updated = [...form.phones];
                      updated[idx].type = e.target.value as ContactCard['phones'][0]['type'];
                      setForm({ ...form, phones: updated });
                    }}
                    className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white flex-shrink-0"
                  >
                    <option value="work">公司電話</option>
                    <option value="mobile">手機</option>
                    <option value="fax">傳真</option>
                    <option value="other">其他</option>
                  </select>
                  <input
                    type="text"
                    value={phone.number}
                    placeholder="號碼 (例如 02-2786-3797)"
                    onChange={(e) => {
                      const updated = [...form.phones];
                      updated[idx].number = e.target.value;
                      const extStr = updated[idx].extension ? `,${updated[idx].extension}` : '';
                      updated[idx].normalizedDialString = e.target.value + extStr;
                      setForm({ ...form, phones: updated });
                    }}
                    className="flex-1 px-3 py-1.5 text-sm rounded-xl border border-slate-300 bg-white min-w-0"
                  />
                  {/* 獨立分機 (ext) 欄位 */}
                  <div className="flex items-center space-x-1 w-24 sm:w-28 flex-shrink-0 bg-white px-2 py-1 rounded-xl border border-slate-300 focus-within:ring-1 focus-within:ring-blue-500">
                    <span className="text-[11px] text-slate-400 font-semibold select-none">分機</span>
                    <input
                      type="text"
                      value={phone.extension || ''}
                      placeholder="136"
                      onChange={(e) => {
                        const updated = [...form.phones];
                        updated[idx].extension = e.target.value;
                        const extStr = e.target.value ? `,${e.target.value}` : '';
                        updated[idx].normalizedDialString = updated[idx].number + extStr;
                        setForm({ ...form, phones: updated });
                      }}
                      className="w-full text-xs bg-transparent focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, phones: form.phones.filter((_, i) => i !== idx) })}
                    className="text-slate-400 hover:text-red-600 p-1 flex-shrink-0"
                    title="刪除電話"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    phones: [...form.phones, { type: 'mobile', number: '', normalizedDialString: '' }],
                  })
                }
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增電話</span>
              </button>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center space-x-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span>電子信箱</span>
              </label>
              <input
                type="email"
                value={form.emails[0] || ''}
                onChange={(e) => setForm({ ...form, emails: [e.target.value] })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </div>

            {/* 地址 */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">地址</label>
              <input
                type="text"
                value={form.addresses[0] || ''}
                onChange={(e) => setForm({ ...form, addresses: [e.target.value] })}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
              />
            </div>
          </div>

          {/* 商務追蹤絲帶 (Ribbon) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span>商務追蹤絲帶 (Ribbon)</span>
              </h3>
              {form.ribbon.status !== 'none' && (
                <button
                  type="button"
                  onClick={handleDownloadIcs}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>加入行事曆 (.ics)</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">追蹤狀態</label>
                <select
                  value={form.ribbon.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      ribbon: { ...form.ribbon, status: e.target.value as RibbonTask['status'] },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                >
                  <option value="none">無設定</option>
                  <option value="pending">待聯繫</option>
                  <option value="in_progress">進行中</option>
                  <option value="follow_up">回訪</option>
                  <option value="overdue">已逾期</option>
                  <option value="completed">已完成</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">預計跟進日期</label>
                <input
                  type="date"
                  value={form.ribbon.dueDate ? form.ribbon.dueDate.slice(0, 10) : ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      ribbon: { ...form.ribbon, dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined },
                    })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">待辦事項摘要</label>
                <input
                  type="text"
                  value={form.ribbon.taskTitle}
                  onChange={(e) =>
                    setForm({ ...form, ribbon: { ...form.ribbon, taskTitle: e.target.value } })
                  }
                  placeholder="例如: 寄送報價單、確認下週二會議"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white"
                />
              </div>
            </div>
          </div>

          {/* 標籤管理 */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Tag className="w-4 h-4 text-blue-600" />
              <span>自訂標籤 (Tags)</span>
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-100/70 text-blue-800 flex items-center space-x-1 border border-blue-200"
                >
                  <span>#{tag}</span>
                  <button onClick={() => handleRemoveTag(tag)} className="hover:text-blue-950">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex space-x-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                placeholder="輸入新標籤後按新增..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
              >
                新增標籤
              </button>
            </div>
          </div>

          {/* 職涯歷史履歷 (Career History) */}
          {form.careerHistory.length > 0 && (
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <History className="w-4 h-4 text-indigo-600" />
                <span>職涯異動履歷 (Career History)</span>
              </h3>
              <div className="space-y-2.5">
                {form.careerHistory.map((h) => (
                  <div
                    key={h.id}
                    className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 flex items-center justify-between"
                  >
                    <div>
                      <span className="font-bold text-slate-900">{h.company}</span>
                      <span className="text-slate-400 mx-1.5">•</span>
                      <span>{h.jobTitle}</span>
                      {h.department && <span className="text-slate-400 ml-1">({h.department})</span>}
                    </div>
                    <span className="text-[10px] text-slate-400">{h.archivedAt.slice(0, 10)} 歸檔</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 拜訪與跟進時間軸 (Timeline Notes) */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>拜訪與會議紀錄時間軸</span>
            </h3>

            {/* 新增紀錄 */}
            <div className="space-y-2">
              <div className="flex space-x-2">
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as TimelineNote['category'])}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="visit">拜訪</option>
                  <option value="call">通話</option>
                  <option value="meeting">會議</option>
                  <option value="email">信件</option>
                  <option value="note">備註</option>
                </select>
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTimelineNote()}
                  placeholder="紀錄拜訪或討論重點..."
                  className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-white"
                />
                <button
                  type="button"
                  onClick={handleAddTimelineNote}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  記錄
                </button>
              </div>
            </div>

            {/* 時間軸清單 */}
            <div className="space-y-2 pt-2">
              {form.timelineNotes.map((n) => (
                <div key={n.id} className="p-2.5 bg-white rounded-xl border border-slate-200/80 text-xs">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                    <span className="font-semibold uppercase tracking-wider text-slate-600">[{n.category}]</span>
                    <span>{new Date(n.createdAt).toLocaleString('zh-TW')}</span>
                  </div>
                  <p className="text-slate-800">{n.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 底部控制列 */}
          <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`確定要刪除聯絡人「${form.name}」嗎？此操作無法復原。`)) {
                  onDelete(form.id);
                  onClose();
                }
              }}
              className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center space-x-1"
            >
              <Trash2 className="w-4 h-4" />
              <span>刪除此聯絡人</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors min-h-[38px]"
            >
              關閉名片
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
