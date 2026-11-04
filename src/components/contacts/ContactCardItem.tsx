import React from 'react';
import { Phone, Mail, Share2, Building2, Briefcase } from 'lucide-react';
import { ContactCard } from '../../types/contact';

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

  return (
    <div
      onClick={() => {
        if (isMultiSelectMode) {
          onToggleSelect(contact.id);
        } else {
          onClickDetail(contact);
        }
      }}
      className={`group relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md ${
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
        {/* 多選 Checkbox */}
        <div className="pt-0.5 flex-shrink-0">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(contact.id);
            }}
            className={`w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 transition-opacity ${
              isMultiSelectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
          />
        </div>

        {/* 頭像或名片縮圖 */}
        <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-600 font-bold text-lg">
          {contact.thumbnailDataUrl ? (
            <img src={contact.thumbnailDataUrl} alt={contact.name} className="w-full h-full object-cover" />
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
      <div className="mt-2.5 flex items-center justify-between text-[10px] pl-7 flex-wrap gap-1">
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
    </div>
  );
};
