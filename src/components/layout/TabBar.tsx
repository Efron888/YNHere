import React from 'react';
import { Users, MapPin, Camera, UserCheck, ArrowLeftRight } from 'lucide-react';

export type TabType = 'contacts' | 'map' | 'mycard';

interface TabBarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenScanner: () => void;
  onOpenExchange: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  currentTab,
  onSelectTab,
  onOpenScanner,
  onOpenExchange,
}) => {
  return (
    <>
      {/* 手機底部懸浮導覽列 (sm 以下顯示) */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-3 py-1 flex items-center justify-around pb-safe">
        <button
          onClick={() => onSelectTab('contacts')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition-colors ${
            currentTab === 'contacts' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">聯絡人</span>
        </button>

        <button
          onClick={() => onSelectTab('map')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition-colors ${
            currentTab === 'map' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <MapPin className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">人脈地圖</span>
        </button>

        {/* 中央突出相機掃描按鈕 */}
        <div className="-mt-5">
          <button
            onClick={onOpenScanner}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all"
            aria-label="掃描名片"
          >
            <Camera className="w-6 h-6" />
          </button>
        </div>

        <button
          onClick={() => onSelectTab('mycard')}
          className={`flex flex-col items-center py-1 px-2 rounded-lg transition-colors ${
            currentTab === 'mycard' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">我的名片</span>
        </button>

        <button
          onClick={onOpenExchange}
          className="flex flex-col items-center py-1 px-2 rounded-lg text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeftRight className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">交換/備份</span>
        </button>
      </nav>

      {/* 電腦端側邊 / 頂部選單 (sm 以上由父容器排版) */}
    </>
  );
};
