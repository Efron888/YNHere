import React, { useRef, useState } from 'react';
import { Phone, Mail, Share2, Building2, Briefcase, Check, ZoomIn } from 'lucide-react';
import { ContactCard } from '../../types/contact';
import { CardImageLightbox } from '../common/CardImageLightbox';

interface ContactCardItemProps {
  contact: ContactCard;
  isSelected: boolean;
  isMultiSelectMode: boolean;
  onToggleSelect: (id: string) => void;
  onClickDetail: (contact: ContactCard) => void;
  onQuickShare: (contact: ContactCard) => void;
}

const RIBBON_COLOR_MAP: Record<string, { bg: string; text: string; label: string }> = {
  overdue: { bg: 'bg-rose-50', text: 'text-rose-700 border-rose-200', label: '已逾期' },
  in_progress: { bg: 'bg-blue-50', text: 'text-blue-700 border-blue-200', label: '進行中' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700 border-amber-200', label: '待聯繫' },
  follow_up: { bg: 'bg-indigo-50', text: 'text-indigo-700 border-indigo-200', label: '回訪' },
  completed: { bg: 'bg-slate-50', text: 'text-slate-600 border-slate-200', label: '已完成' },
};

export const ContactCardItem: React.FC<ContactCardItemProps> = ({
  contact,
  isSelected,
  isMultiSelectMode,
  onToggleSelect,
  onClickDetail,
  onQuickShare,
}) => {
  const primaryPhone = contact.phones.find((p) => p.type === 'mobile') || contact.phones[0];
  const primaryEmail = contact.emails[0];
  const ribbonInfo = contact.ribbon?.status !== 'none' ? RIBBON_COLOR_MAP[contact.ribbon.status] : null;
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // 手機長按進入選取模式支援
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = () => {
    longPressTimer.current = setTimeout(() => {
      onToggleSelect(contact.id);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      onClick={() => {
        if (isMultiSelectMode) {
          onToggleSelect(contact.id);
        } else {
          onClickDetail(contact);
        }
      }}
      className={`group relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md select-none ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
          : 'border-slate-200/80 hover:border-blue-300'
      }`}
    >
      {/* 快捷操作按鈕：固定絕對定位於卡片右上角，確保每一張卡片按鈕絕對對齊、絕不亂跑 */}
      <div
        className="absolute top-3.5 right-3.5 flex items-center space-x-0.5 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {primaryPhone && (
          <a
            href={`tel:${primaryPhone.normalizedDialString || primaryPhone.number}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title={`撥打電話: ${primaryPhone.number}`}
          >
            <Phone className="w-4 h-4" />
          </a>
        )}
        {primaryEmail && (
          <a
            href={`mailto:${primaryEmail}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title={`發送郵件: ${primaryEmail}`}
          >
            <Mail className="w-4 h-4" />
          </a>
        )}
        <button
          onClick={() => onQuickShare(contact)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          title="分享名片"
        >
          <Share2 className="w-4 h-4" />
        </button>
      </div>

      {/* 卡片主體區域：右側預留 pr-24 安全留白防止文字遮擋右上角圖示 */}
      <div className="flex items-start space-x-3 pr-24">
        {/* 多選勾選鈕：獨立 44px 觸控熱區、手機常態高對比可見、杜絕誤觸進入詳情 */}
        <button
          type="button"
          aria-label={isSelected ? `取消選取 ${contact.name}` : `選取 ${contact.name}`}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(contact.id);
          }}
          className="p-2.5 -m-2 z-10 flex-shrink-0 flex items-center justify-center cursor-pointer select-none rounded-xl min-w-[42px] min-h-[42px]"
          title="勾選此名片"
        >
          <div
            className={`w-5.5 h-5.5 rounded-lg border-2 flex items-center justify-center transition-all ${
              isSelected
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm scale-105'
                : isMultiSelectMode
                ? 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-100'
                : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50'
            }`}
          >
            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
          </div>
        </button>

        {/* 頭像或名片縮圖 (若有照片支援直接點擊全螢幕放大) */}
        <div
          onClick={(e) => {
            if (contact.thumbnailDataUrl || contact.frontImageId) {
              e.stopPropagation();
              setIsZoomOpen(true);
            }
          }}
          className={`relative w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-600 font-bold text-lg ${
            contact.thumbnailDataUrl || contact.frontImageId ? 'cursor-zoom-in ring-offset-1 hover:ring-2 hover:ring-blue-500' : ''
          }`}
          title={contact.thumbnailDataUrl || contact.frontImageId ? '點擊放大名片照片' : undefined}
        >
          {contact.thumbnailDataUrl ? (
            <>
              <img src={contact.thumbnailDataUrl} alt={contact.name} className="w-full h-full object-cover" />
              <div className="absolute bottom-0 right-0 bg-slate-900/75 text-white p-0.5 rounded-tl-md">
                <ZoomIn className="w-2.5 h-2.5" />
              </div>
            </>
          ) : (
            contact.name.slice(0, 1)
          )}
        </div>

        {/* 姓名與職位 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2 flex-wrap gap-y-0.5">
            <h3 className="font-bold text-slate-900 text-base truncate">{contact.name}</h3>
            {contact.nameEn && <span className="text-xs text-slate-500 truncate">{contact.nameEn}</span>}
            {ribbonInfo && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ribbonInfo.bg} ${ribbonInfo.text}`}
              >
                {ribbonInfo.label}
              </span>
            )}
          </div>

          {/* 公司與職稱 */}
          <div className="flex items-center space-x-1.5 text-xs text-slate-600 mt-1 truncate">
            {contact.company && (
              <span className="flex items-center space-x-1 truncate font-medium">
                <Building2 className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">{contact.company}</span>
              </span>
            )}
            {contact.company && contact.jobTitle && <span className="text-slate-300">•</span>}
            {contact.jobTitle && (
              <span className="flex items-center space-x-1 truncate text-slate-500">
                <Briefcase className="w-3 h-3 text-slate-400 flex-shrink-0" />
                <span className="truncate">{contact.jobTitle}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 標籤膠囊與名片建立時間 */}
      <div className="mt-2.5 flex items-center justify-between text-[10px] pl-8 flex-wrap gap-1">
        <div className="flex flex-wrap gap-1">
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200/60"
            >
              #{tag}
            </span>
          ))}
        </div>

        {contact.createdAt && (
          <span
            className="text-[10px] text-slate-400 font-mono"
            title={`建立時間: ${new Date(contact.createdAt).toLocaleString('zh-TW', { hour12: false })}`}
          >
            {new Date(contact.createdAt).toLocaleDateString('zh-TW')} 建立
          </span>
        )}
      </div>

      {isZoomOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <CardImageLightbox
            isOpen={isZoomOpen}
            onClose={() => setIsZoomOpen(false)}
            imageId={contact.frontImageId}
            fallbackDataUrl={contact.thumbnailDataUrl}
            title={`${contact.name} — 名片照片`}
          />
        </div>
      )}
    </div>
  );
};
