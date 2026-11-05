import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  Phone,
  Mail,
  Share2,
  Check,
  Sparkles,
  QrCode,
  MapPin,
  X,
  Pencil,
  Save,
  UserCheck,
} from 'lucide-react';
import { ContactCard } from '../../types/contact';
import { generateCompactVCardForQr } from '../../services/exchange/vcardCodec';
import { encodeContactsToUrlHash } from '../../services/exchange/urlShareCodec';
import { normalizeTaiwanTaxId } from '../../services/ocr/twValidators';

interface MyDigitalCardViewProps {
  card: ContactCard;
  onUpdateCard?: (updated: ContactCard) => void;
  onEditCard?: () => void;
}

export const MyDigitalCardView: React.FC<MyDigitalCardViewProps> = ({
  card,
  onUpdateCard,
  onEditCard,
}) => {
  const [template, setTemplate] = useState<'classic' | 'modern' | 'dark'>('classic');
  const [copiedGreeting, setCopiedGreeting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);

  // 快速內嵌編輯狀態
  const [editForm, setEditForm] = useState({
    name: card.name,
    nameEn: card.nameEn,
    company: card.company,
    department: card.department,
    jobTitle: card.jobTitle,
    taxId: card.taxId,
    mobile: card.phones.find((p) => p.type === 'mobile')?.number || '',
    workPhone: card.phones.find((p) => p.type === 'work')?.number || '',
    workExt: card.phones.find((p) => p.type === 'work')?.extension || '',
    email: card.emails[0] || '',
    address: card.addresses[0] || '',
  });

  // 當外部傳入的 card 改變時同步更新快速編輯狀態
  React.useEffect(() => {
    setEditForm({
      name: card.name,
      nameEn: card.nameEn,
      company: card.company,
      department: card.department,
      jobTitle: card.jobTitle,
      taxId: card.taxId,
      mobile: card.phones.find((p) => p.type === 'mobile')?.number || '',
      workPhone: card.phones.find((p) => p.type === 'work')?.number || '',
      workExt: card.phones.find((p) => p.type === 'work')?.extension || '',
      email: card.emails[0] || '',
      address: card.addresses[0] || '',
    });
  }, [card]);

  // 時段智慧問候語產生器
  const getGreeting = () => {
    const hour = new Date().getHours();
    let period = '您好';
    if (hour >= 5 && hour < 12) period = '早安';
    else if (hour >= 12 && hour < 18) period = '午安';
    else period = '晚安';

    return `${period}！我是 ${card.company || '公司'} 的 ${card.name} (${card.jobTitle || '職稱'})。很高興與您交流，這是我的數位名片，請多指教！`;
  };

  const compactVcf = generateCompactVCardForQr(card);

  const handleCopyGreeting = () => {
    navigator.clipboard.writeText(getGreeting());
    setCopiedGreeting(true);
    setTimeout(() => setCopiedGreeting(false), 2000);
  };

  const handleCopyShareLink = () => {
    try {
      const hash = encodeContactsToUrlHash([card]);
      const url = `${window.location.origin}${window.location.pathname}${hash}`;
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);

      const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        alert(
          '📋 已複製連結！\n\n⚠️ 貼心提醒：\n目前您是在本機開發環境（localhost）執行，別人的手機或外部網路無法連入 localhost。\n\n• 同 Wi-Fi 測試：可將網址開頭的 localhost 改為您電腦的區域網路 IP（例如 192.168.6.10）。\n• 正式發給外網客戶：將專案發布至雲端靜態託管（如 GitHub Pages 或 Vercel），全世界客戶點開即可免裝 App 秒存名片！'
        );
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveInlineEdit = () => {
    if (!onUpdateCard) return;

    const phones = [];
    if (editForm.mobile) {
      phones.push({
        type: 'mobile' as const,
        number: editForm.mobile,
        normalizedDialString: editForm.mobile,
      });
    }
    if (editForm.workPhone) {
      phones.push({
        type: 'work' as const,
        number: editForm.workPhone,
        extension: editForm.workExt || undefined,
        normalizedDialString: `${editForm.workPhone}${editForm.workExt ? `,${editForm.workExt}` : ''}`,
      });
    }

    const updated: ContactCard = {
      ...card,
      updatedAt: new Date().toISOString(),
      name: editForm.name || '我的姓名',
      nameEn: editForm.nameEn,
      company: editForm.company,
      department: editForm.department,
      jobTitle: editForm.jobTitle,
      taxId: normalizeTaiwanTaxId(editForm.taxId),
      phones,
      emails: editForm.email ? [editForm.email.toLowerCase()] : [],
      addresses: editForm.address ? [editForm.address] : [],
      isMyDigitalCard: true,
    };

    onUpdateCard(updated);
    setIsInlineEditing(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* 頂部控制列 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-extrabold text-slate-900">我的個人數位名片</h1>
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1">
              <UserCheck className="w-3 h-3" />
              <span>個人代表名片</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">免裝 App，對方掃描 QR Code 即可一鍵加入手機通訊錄</p>
        </div>

        {/* 右側操作按鈕區 */}
        <div className="flex items-center space-x-2">
          {/* 完整抽屜編輯 (支援拍照/AI 辨識名片) */}
          {onEditCard && (
            <button
              onClick={onEditCard}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-sm shadow-blue-500/20 transition-all"
              title="開啟完整編輯器（支援拍照或上傳實體名片由 AI 自動填入）"
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>編輯名片資料</span>
            </button>
          )}

          {/* 版型切換 */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setTemplate('classic')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                template === 'classic' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              經典
            </button>
            <button
              onClick={() => setTemplate('modern')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                template === 'modern' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              極簡
            </button>
            <button
              onClick={() => setTemplate('dark')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                template === 'dark' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'
              }`}
            >
              曜石黑
            </button>
          </div>
        </div>
      </div>

      {/* 名片預覽卡片 */}
      <div
        className={`relative overflow-hidden rounded-3xl p-6 sm:p-8 transition-all duration-300 shadow-xl ${
          template === 'classic'
            ? 'bg-gradient-to-br from-white to-slate-50 border-2 border-blue-500/30 text-slate-800'
            : template === 'modern'
            ? 'bg-white border border-slate-200 text-slate-900'
            : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white border border-slate-700'
        }`}
      >
        {/* 右上角快捷編輯按鈕 */}
        <button
          onClick={onEditCard || (() => setIsInlineEditing(!isInlineEditing))}
          className="absolute top-4 right-4 z-10 flex items-center space-x-1 px-2.5 py-1 bg-white/90 hover:bg-white text-slate-700 rounded-lg text-xs font-semibold shadow-sm border border-slate-200/80 hover:text-blue-700 transition-all"
        >
          <Pencil className="w-3 h-3 text-blue-600" />
          <span>編輯</span>
        </button>

        {/* 經典版型飾條 */}
        {template === 'classic' && (
          <div className="absolute top-0 left-0 right-0 h-2.5 bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-600" />
        )}

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div className="space-y-4 flex-1">
            {/* 公司與統編 */}
            <div>
              <div className="flex items-center space-x-1.5 text-xs font-bold tracking-wider uppercase opacity-75">
                <Building2 className="w-4 h-4" />
                <span>{card.company || '公司名稱'}</span>
              </div>
              {card.taxId && <div className="text-[10px] opacity-60 mt-0.5">統一編號：{card.taxId}</div>}
            </div>

            {/* 姓名與職稱 */}
            <div className="pt-2">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{card.name || '您的姓名'}</h2>
              {card.nameEn && <div className="text-sm font-medium opacity-70 mt-0.5">{card.nameEn}</div>}
              <div className="text-sm font-semibold opacity-90 mt-1.5 text-blue-600 dark:text-blue-400">
                {card.jobTitle || '您的職稱'} {card.department && `• ${card.department}`}
              </div>
            </div>

            {/* 聯絡資訊列表 */}
            <div className="space-y-2 pt-3 text-xs opacity-90">
              {card.phones.length > 0 ? (
                card.phones.map((p, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <Phone className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                    <span>
                      {p.number} {p.extension && `(分機 ${p.extension})`}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 italic text-[11px]">尚未設定電話</div>
              )}

              {card.emails.length > 0 &&
                card.emails.map((e, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <Mail className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                    <span>{e}</span>
                  </div>
                ))}

              {card.addresses[0] && (
                <div className="flex items-center space-x-2">
                  <MapPin className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                  <span>{card.addresses[0]}</span>
                </div>
              )}
            </div>
          </div>

          {/* QR Code 預覽 (點擊放大) */}
          <div
            onClick={() => setShowQrModal(true)}
            className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl shadow-sm border border-slate-200/80 cursor-pointer hover:scale-105 transition-transform"
          >
            <QRCodeSVG value={compactVcf} size={110} level="M" />
            <span className="text-[10px] text-slate-500 font-bold mt-1.5 flex items-center space-x-1">
              <QrCode className="w-3 h-3 text-blue-600" />
              <span>點擊放大 QR</span>
            </span>
          </div>
        </div>
      </div>

      {/* 快捷內嵌編輯區塊 (點擊展開或收合) */}
      {isInlineEditing && (
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="font-bold text-sm text-slate-800 flex items-center space-x-2">
              <Pencil className="w-4 h-4 text-blue-600" />
              <span>快速修改個人名片基本資料</span>
            </h3>
            <button
              onClick={() => setIsInlineEditing(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">姓名 *</label>
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">英文姓名</label>
              <input
                type="text"
                value={editForm.nameEn}
                onChange={(e) => setEditForm({ ...editForm, nameEn: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">公司名稱</label>
              <input
                type="text"
                value={editForm.company}
                onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">職稱</label>
              <input
                type="text"
                value={editForm.jobTitle}
                onChange={(e) => setEditForm({ ...editForm, jobTitle: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">部門</label>
              <input
                type="text"
                value={editForm.department}
                onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">統一編號 (8碼)</label>
              <input
                type="text"
                value={editForm.taxId}
                onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })}
                onBlur={(e) => {
                  const norm = normalizeTaiwanTaxId(e.target.value);
                  if (norm !== editForm.taxId) setEditForm({ ...editForm, taxId: norm });
                }}
                placeholder="例如: 04757891"
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">手機號碼</label>
              <input
                type="text"
                value={editForm.mobile}
                onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                placeholder="0912-345-678"
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">公司電話與分機</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editForm.workPhone}
                  onChange={(e) => setEditForm({ ...editForm, workPhone: e.target.value })}
                  placeholder="02-2786-3797"
                  className="flex-1 px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <input
                  type="text"
                  value={editForm.workExt}
                  onChange={(e) => setEditForm({ ...editForm, workExt: e.target.value })}
                  placeholder="分機"
                  className="w-20 px-2 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">電子信箱</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">公司地址</label>
              <input
                type="text"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full px-3 py-2 border rounded-xl border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              onClick={() => setIsInlineEditing(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              取消
            </button>
            <button
              onClick={handleSaveInlineEdit}
              className="flex items-center space-x-1 px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>儲存個人名片</span>
            </button>
          </div>
        </div>
      )}

      {/* 快捷操作列 */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <button
          onClick={onEditCard || (() => setIsInlineEditing(!isInlineEditing))}
          className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 font-bold text-xs flex items-center justify-center space-x-2 rounded-2xl shadow-sm transition-all"
        >
          <Pencil className="w-4 h-4 text-blue-600" />
          <span>編輯名片資料</span>
        </button>

        <button
          onClick={() => setShowQrModal(true)}
          className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all"
        >
          <QrCode className="w-4 h-4 text-blue-600" />
          <span>展示交換 QR Code</span>
        </button>

        <button
          onClick={handleCopyGreeting}
          className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all"
        >
          {copiedGreeting ? <Check className="w-4 h-4 text-blue-600" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
          <span>{copiedGreeting ? '已複製問候語！' : '複製智慧時段問候語'}</span>
        </button>

        <button
          onClick={handleCopyShareLink}
          className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-blue-400 text-slate-700 font-semibold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all"
        >
          {copiedLink ? <Check className="w-4 h-4 text-blue-600" /> : <Share2 className="w-4 h-4 text-blue-600" />}
          <span>{copiedLink ? '已複製連結！' : '複製免伺服器分享連結'}</span>
        </button>
      </div>

      {/* QR Code 放大彈窗 */}
      {showQrModal && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowQrModal(false);
          }}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4 shadow-2xl relative">
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center space-x-1"
            >
              <X className="w-4 h-4" />
              <span>關閉</span>
            </button>

            <div className="pt-4">
              <h3 className="font-extrabold text-slate-900 text-lg">{card.name} 的名片 QR Code</h3>
              <p className="text-xs text-slate-500 mt-1">請對方打開手機原生相機掃描，立即存入通訊錄</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl inline-block border border-slate-200">
              <QRCodeSVG value={compactVcf} size={220} level="M" />
            </div>

            <p className="text-[11px] text-slate-400">標準 vCard 3.0・跨 iPhone / Android 免安裝秒存</p>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              關閉視窗
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
