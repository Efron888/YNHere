import { useState, useEffect, useMemo } from 'react';
import { db } from './db/database';
import { ContactCard } from './types/contact';
import { requestPersistentStorage, incrementUnbackedCount } from './db/storageGuard';
import { decodeContactsFromUrlHash } from './services/exchange/urlShareCodec';
import { Navbar } from './components/layout/Navbar';
import { TabBar, TabType } from './components/layout/TabBar';
import { ContactCardItem } from './components/contacts/ContactCardItem';
import { ContactDetailDrawer } from './components/contacts/ContactDetailDrawer';
import { ScannerModal } from './components/scanner/ScannerModal';
import { ExchangeModal } from './components/exchange/ExchangeModal';
import { SettingsModal } from './components/layout/SettingsModal';
import { MyDigitalCardView } from './components/mycard/MyDigitalCardView';
import { ContactMapView } from './components/map/ContactMapView';
import { recognizeBusinessCard } from './services/ocr/ocrEngine';
import { getMyStandaloneProfile, saveMyStandaloneProfile } from './services/profile/profileService';
import { calculateDuplicateScore, mergeContacts } from './services/deduplication/duplicateMatcher';
import {
  Search,
  CheckSquare,
  Square,
  Trash2,
  Share2,
  Camera,
  Users,
  MapPin,
  UserCheck,
  ArrowUpDown,
  Tag,
  Sparkles,
  RotateCw,
  Settings,
  GitMerge,
} from 'lucide-react';

export function App() {
  const [contacts, setContacts] = useState<ContactCard[]>([]);
  const [currentTab, setCurrentTab] = useState<TabType>('contacts');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'in_progress' | 'follow_up' | 'overdue'>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'company' | 'name'>('date');

  // 多選狀態
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 彈窗狀態
  const [detailContact, setDetailContact] = useState<ContactCard | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isExchangeOpen, setIsExchangeOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBatchRepairing, setIsBatchRepairing] = useState(false);

  // 我的個人數位名片 (完全獨立於人脈庫)
  const [myCard, setMyCard] = useState<ContactCard>(getMyStandaloneProfile());

  // 1. 初始化資料庫載入與持久化申請
  useEffect(() => {
    requestPersistentStorage();
    setMyCard(getMyStandaloneProfile());
    loadContactsFromDb();
    handleIncomingUrlShare();
  }, []);

  const loadContactsFromDb = async () => {
    const all = await db.contacts.toArray();
    // 嚴格排除獨立個人代表名片，確保人脈庫 100% 都是外部聯絡人名片
    const externalContacts = all.filter((c) => c.id !== 'my-standalone-profile-card');
    setContacts(externalContacts);
  };

  // 2. 監聽零後端 URL Hash 分享 (#card=...)
  const handleIncomingUrlShare = async () => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (hash.startsWith('#card=')) {
      const decoded = decodeContactsFromUrlHash(hash);
      if (decoded.length > 0) {
        if (window.confirm(`收到同事透過連結分享的 ${decoded.length} 張名片！是否要將其收錄至您的名片庫？`)) {
          for (const c of decoded) {
            await db.contacts.put(c);
            incrementUnbackedCount();
          }
          await loadContactsFromDb();
          window.location.hash = '';
          alert(`已成功收錄 ${decoded.length} 張名片！`);
        }
      }
    }
  };

  // 3. 搜尋、篩選與排序計算
  const filteredContacts = useMemo(() => {
    return contacts
      .filter((c) => {
        // 關鍵字搜尋
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = c.name.toLowerCase().includes(q) || c.nameEn.toLowerCase().includes(q);
          const matchCompany = c.company.toLowerCase().includes(q);
          const matchTitle = c.jobTitle.toLowerCase().includes(q);
          const matchTax = c.taxId.includes(q);
          const matchTags = c.tags.some((t) => t.toLowerCase().includes(q));
          const matchAddr = c.addresses.some((a) => a.toLowerCase().includes(q));
          const matchNote = c.timelineNotes.some((n) => n.content.toLowerCase().includes(q));
          if (!matchName && !matchCompany && !matchTitle && !matchTax && !matchTags && !matchAddr && !matchNote) {
            return false;
          }
        }

        // 狀態絲帶篩選
        if (activeFilter !== 'all') {
          if (c.ribbon?.status !== activeFilter) {
            return false;
          }
        }

        // 標籤篩選
        if (selectedTag) {
          if (!c.tags.includes(selectedTag)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        } else if (sortBy === 'company') {
          return a.company.localeCompare(b.company, 'zh-TW');
        } else {
          return a.name.localeCompare(b.name, 'zh-TW');
        }
      });
  }, [contacts, searchQuery, activeFilter, selectedTag, sortBy]);

  // 所有現存標籤列表
  const allTags = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [contacts]);

  // 多選切換 (選中自動啟用多選模式，清空自動關閉)
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
    setIsMultiSelectMode(next.size > 0);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
      setIsMultiSelectMode(false);
    } else {
      setSelectedIds(new Set(filteredContacts.map((c) => c.id)));
      setIsMultiSelectMode(true);
    }
  };

  // 批次刪除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`確定要批次刪除所選取的 ${selectedIds.size} 張名片嗎？`)) {
      await db.contacts.bulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setIsMultiSelectMode(false);
      await loadContactsFromDb();
    }
  };

  // 智慧合併所選取的多張名片 (問題 3 徹底解決)
  const handleMergeSelected = async () => {
    if (selectedIds.size < 2) return;
    const selectedList = contacts.filter((c) => selectedIds.has(c.id));
    if (selectedList.length < 2) return;

    if (
      !window.confirm(
        `確定要將選取的 ${selectedList.length} 張名片智慧合併為 1 張嗎？\n\n主體：${selectedList[0].name} (${selectedList[0].company || '無公司'})\n其餘名片的舊職位與通訊資訊將自動歸檔整合至職涯履歷時間軸。`
      )
    ) {
      return;
    }

    let merged = selectedList[0];
    const idsToDelete: string[] = [];

    for (let i = 1; i < selectedList.length; i++) {
      merged = mergeContacts(merged, selectedList[i]);
      idsToDelete.push(selectedList[i].id);
    }

    await db.contacts.put(merged);
    if (idsToDelete.length > 0) {
      await db.contacts.bulkDelete(idsToDelete);
    }

    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
    await loadContactsFromDb();
    alert(`已成功合併為 1 張名片，並已自動保留職涯歷史！`);
  };

  // 儲存/更新聯絡人 (自動分流：個人代表名片獨立儲存，絕不污染人脈庫)
  const handleSaveContact = async (c: ContactCard) => {
    if (c.isMyDigitalCard || c.id === 'my-standalone-profile-card') {
      const saved = saveMyStandaloneProfile(c);
      setMyCard(saved);
      return;
    }
    const isNew = !contacts.some((exist) => exist.id === c.id);
    await db.contacts.put(c);
    if (isNew) {
      incrementUnbackedCount(contacts.length + 1);
    }
    await loadContactsFromDb();
  };

  // 合併聯絡人並自動清理庫中所有同名重複卡片，確保合併後絕對只有 1 張名片
  const handleMergeAndDeduplicateContact = async (mergedCard: ContactCard) => {
    const allInDb = await db.contacts.toArray();
    let finalMerged = mergedCard;
    const redundantIds: string[] = [];

    for (const item of allInDb) {
      if (item.id === mergedCard.id || item.isMyDigitalCard) continue;
      const sameRealName =
        mergedCard.name &&
        mergedCard.name !== '未命名聯絡人' &&
        item.name.trim() === mergedCard.name.trim();
      const score = calculateDuplicateScore(finalMerged, item);
      if (score >= 0.75 || sameRealName) {
        finalMerged = mergeContacts(finalMerged, item);
        redundantIds.push(item.id);
      }
    }

    await db.contacts.put(finalMerged);
    if (redundantIds.length > 0) {
      await db.contacts.bulkDelete(redundantIds);
    }
    await loadContactsFromDb();
  };

  // 自動偵測人脈庫中現存的重複名片群組 (例如同名的 2 張劉景文、2 張李小華)
  const duplicateGroups = useMemo(() => {
    const visited = new Set<string>();
    const groups: ContactCard[][] = [];

    for (let i = 0; i < contacts.length; i++) {
      const a = contacts[i];
      if (visited.has(a.id) || !a.name || a.name === '未命名聯絡人') continue;

      const group: ContactCard[] = [a];
      for (let j = i + 1; j < contacts.length; j++) {
        const b = contacts[j];
        if (visited.has(b.id)) continue;
        const sameName = a.name.trim() === b.name.trim();
        const score = calculateDuplicateScore(a, b);
        if (sameName || score >= 0.75) {
          group.push(b);
          visited.add(b.id);
        }
      }
      if (group.length >= 2) {
        visited.add(a.id);
        groups.push(group);
      }
    }
    return groups;
  }, [contacts]);

  // 一鍵智慧合併人脈庫中所有重複名片
  const handleAutoMergeAllDuplicates = async () => {
    if (duplicateGroups.length === 0) return;
    const idsToDelete: string[] = [];

    for (const group of duplicateGroups) {
      let master = group[0];
      for (let i = 1; i < group.length; i++) {
        master = mergeContacts(master, group[i]);
        idsToDelete.push(group[i].id);
      }
      await db.contacts.put(master);
    }

    if (idsToDelete.length > 0) {
      await db.contacts.bulkDelete(idsToDelete);
    }
    setSelectedIds(new Set());
    setIsMultiSelectMode(false);
    await loadContactsFromDb();
    alert(`已成功將 ${duplicateGroups.length} 組重複名片合併完成，並完整保留所有電話與職涯歷史！`);
  };

  // 刪除單筆聯絡人
  const handleDeleteContact = async (id: string) => {
    await db.contacts.delete(id);
    await loadContactsFromDb();
  };

  // 掃描器批次收錄全部 (單一原子交易處理多張名片新增與同名合併，杜絕非同步迴圈競爭只存到 1 人的問題)
  const handleBatchSaveFromScanner = async (cards: ContactCard[]) => {
    if (!cards || cards.length === 0) return;
    const allInDb = await db.contacts.toArray();
    const workingList = allInDb.filter((c) => !c.isMyDigitalCard && c.id !== 'my-standalone-profile-card');

    for (const incoming of cards) {
      if (incoming.isMyDigitalCard || incoming.id === 'my-standalone-profile-card') continue;
      const matchIdx = workingList.findIndex((exist) => {
        if (exist.id === incoming.id) return true;
        const sameRealName =
          incoming.name &&
          incoming.name !== '未命名聯絡人' &&
          exist.name.trim() === incoming.name.trim();
        const score = calculateDuplicateScore(exist, incoming);
        return score >= 0.75 || Boolean(sameRealName);
      });

      if (matchIdx !== -1) {
        workingList[matchIdx] = mergeContacts(workingList[matchIdx], incoming);
      } else {
        workingList.push(incoming);
        incrementUnbackedCount(workingList.length);
      }
    }

    await db.contacts.bulkPut(workingList);
    await loadContactsFromDb();
  };

  // 批次匯入成功 (單一原子交易 bulkPut 確保手機多選聯絡人 100% 全數寫入)
  const handleImportSuccess = async (imported: ContactCard[]) => {
    if (!imported || imported.length === 0) return;
    await db.contacts.bulkPut(imported);
    const total = await db.contacts.count();
    for (let i = 0; i < imported.length; i++) {
      incrementUnbackedCount(total);
    }
    await loadContactsFromDb();
  };

  // 篩出所有「未命名聯絡人」
  const unnamedContacts = useMemo(
    () => contacts.filter((c) => c.name === '未命名聯絡人'),
    [contacts]
  );

  // 一鍵重新 AI 辨識既有「未命名聯絡人」
  const handleBatchRepairUnnamed = async () => {
    if (unnamedContacts.length === 0) return;
    try {
      setIsBatchRepairing(true);
      let repairedCount = 0;
      for (const c of unnamedContacts) {
        let imageSource: Blob | string | undefined;
        let width = 960;
        let height = 560;
        if (c.frontImageId) {
          const img = await db.cardImages.get(c.frontImageId);
          if (img) {
            imageSource = new Blob([img.data as unknown as BlobPart], { type: img.mimeType });
            width = img.width || 960;
            height = img.height || 560;
          }
        }
        if (!imageSource && c.thumbnailDataUrl) {
          imageSource = c.thumbnailDataUrl;
        }
        if (!imageSource) continue;

        const partial = await recognizeBusinessCard(imageSource, { width, height }, c.thumbnailDataUrl);
        const updated: ContactCard = {
          ...c,
          updatedAt: new Date().toISOString(),
          name: partial.name || c.name,
          nameEn: partial.nameEn || c.nameEn,
          company: partial.company || c.company,
          department: partial.department || c.department,
          jobTitle: partial.jobTitle || c.jobTitle,
          taxId: partial.taxId || c.taxId,
          phones: partial.phones && partial.phones.length > 0 ? partial.phones : c.phones,
          emails: partial.emails && partial.emails.length > 0 ? partial.emails : c.emails,
          websites: partial.websites && partial.websites.length > 0 ? partial.websites : c.websites,
          addresses: partial.addresses && partial.addresses.length > 0 ? partial.addresses : c.addresses,
        };
        await db.contacts.put(updated);
        repairedCount++;
      }
      await loadContactsFromDb();
      alert(`已完成 ${repairedCount} 張名片重新辨識！（若舊名片僅存有小縮圖導致字跡模糊，可點擊該名片「更換/上傳名片圖並辨識」載入高清原圖）`);
    } catch (err) {
      console.error('批次重新辨識失敗:', err);
      alert('重新辨識時發生錯誤，請直接點擊「掃描新名片」重新上傳原圖！');
    } finally {
      setIsBatchRepairing(false);
    }
  };

  // 一鍵清除未命名空白紀錄
  const handleClearUnnamed = async () => {
    if (unnamedContacts.length === 0) return;
    if (window.confirm(`確定要清除這 ${unnamedContacts.length} 筆「未命名聯絡人」空白紀錄，以便重新掃描嗎？`)) {
      await db.contacts.bulkDelete(unnamedContacts.map((c) => c.id));
      await loadContactsFromDb();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar
        onOpenExchange={() => setIsExchangeOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        totalContacts={contacts.length}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {/* 電腦端側邊導覽列 (sm 以上顯示) */}
        <aside className="hidden sm:flex flex-col w-56 space-y-6 flex-shrink-0">
          <div className="bg-white rounded-3xl p-3 border border-slate-200/80 shadow-sm space-y-1">
            <button
              onClick={() => setCurrentTab('contacts')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-2xl font-bold text-xs transition-colors ${
                currentTab === 'contacts'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>人脈名片庫 ({contacts.length})</span>
            </button>

            <button
              onClick={() => setCurrentTab('map')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-2xl font-bold text-xs transition-colors ${
                currentTab === 'map'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>視覺化人脈地圖</span>
            </button>

            <button
              onClick={() => setCurrentTab('mycard')}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-2xl font-bold text-xs transition-colors ${
                currentTab === 'mycard'
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>我的個人數位名片</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-2xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>AI 設定 / Gemini Key</span>
            </button>
          </div>

          {/* 快速拍照掃描大按鈕 */}
          <button
            onClick={() => setIsScannerOpen(true)}
            className="w-full py-4 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-extrabold text-sm flex items-center justify-center space-x-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
          >
            <Camera className="w-5 h-5" />
            <span>掃描新名片</span>
          </button>

          {/* 標籤過濾側欄 */}
          {allTags.length > 0 && (
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-sm space-y-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5" />
                <span>標籤分類</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedTag(null)}
                  className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium ${
                    selectedTag === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  全部
                </button>
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                    className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium ${
                      selectedTag === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-600'
                    }`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* 主要內容展示區 */}
        <main className="flex-1 min-w-0">
          {/* TAB 1: 聯絡人管理 */}
          {currentTab === 'contacts' && (
            <div className="space-y-4">
              {/* 搜尋列與多選工具列 */}
              <div className="bg-white p-3.5 rounded-3xl border border-slate-200/80 shadow-sm space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜尋姓名、公司、職稱、統編、標籤或地址..."
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    />
                  </div>

                  {/* 排序切換 */}
                  <div className="flex items-center space-x-1 border border-slate-200 rounded-2xl px-2.5 py-2 bg-slate-50 text-xs flex-shrink-0">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'date' | 'company' | 'name')}
                      className="bg-transparent font-semibold text-slate-600 focus:outline-none"
                    >
                      <option value="date">依日期排序</option>
                      <option value="company">依公司名稱</option>
                      <option value="name">依姓名排序</option>
                    </select>
                  </div>

                  {/* 多選開關按鈕 */}
                  <button
                    onClick={() => {
                      setIsMultiSelectMode(!isMultiSelectMode);
                      if (isMultiSelectMode) setSelectedIds(new Set());
                    }}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center space-x-1.5 transition-colors flex-shrink-0 ${
                      isMultiSelectMode
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                    }`}
                  >
                    {isMultiSelectMode ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                    <span>{isMultiSelectMode ? `已選 ${selectedIds.size} 張 (完成)` : '勾選 / 合併名片'}</span>
                  </button>
                </div>

                {/* 快篩膠囊列 */}
                <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar pt-1 text-xs">
                  <span className="text-[11px] font-bold text-slate-400 flex-shrink-0">快篩：</span>
                  <button
                    onClick={() => setActiveFilter('all')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'all'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    全部 ({contacts.length})
                  </button>
                  <button
                    onClick={() => setActiveFilter('pending')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'pending'
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    待聯繫
                  </button>
                  <button
                    onClick={() => setActiveFilter('in_progress')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'in_progress'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    進行中
                  </button>
                  <button
                    onClick={() => setActiveFilter('follow_up')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'follow_up'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
                    }`}
                  >
                    回訪
                  </button>
                  <button
                    onClick={() => setActiveFilter('overdue')}
                    className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                      activeFilter === 'overdue'
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-50 text-orange-800 hover:bg-orange-100'
                    }`}
                  >
                    已逾期
                  </button>
                </div>
              </div>

              {/* 偵測到名片庫內有同名重複名片時，顯示一鍵自動合併橫幅 */}
              {duplicateGroups.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
                  <div className="flex items-center space-x-2 text-amber-900 font-semibold">
                    <GitMerge className="w-4 h-4 text-amber-600 flex-shrink-0" />
                    <span>
                      偵測到 <strong>{duplicateGroups.length}</strong> 組重複名片（例如：{duplicateGroups.map(g => g[0].name).slice(0, 3).join('、')}），可一鍵合併為單一張名片並保留職涯歷史紀錄！
                    </span>
                  </div>
                  <button
                    onClick={handleAutoMergeAllDuplicates}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>一鍵合併所有重複名片</span>
                  </button>
                </div>
              )}

              {/* 若發現舊版殘留之「未命名聯絡人」，顯示一鍵 AI 重新辨識與清理橫幅 */}
              {unnamedContacts.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-3xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center space-x-2 text-blue-900 font-semibold">
                    <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span>
                      偵測到 <strong>{unnamedContacts.length}</strong> 張「未命名聯絡人」名片紀錄（OCR 引擎已升級修復！）
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleBatchRepairUnnamed}
                      disabled={isBatchRepairing}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
                    >
                      {isBatchRepairing ? (
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isBatchRepairing ? '正在重新辨識...' : '一鍵重新 AI 辨識'}</span>
                    </button>
                    <button
                      onClick={handleClearUnnamed}
                      disabled={isBatchRepairing}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-600 font-semibold flex items-center space-x-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>清除空白紀錄重掃</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 名片列表 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-24">
                {filteredContacts.map((contact) => (
                  <ContactCardItem
                    key={contact.id}
                    contact={contact}
                    isSelected={selectedIds.has(contact.id)}
                    isMultiSelectMode={isMultiSelectMode}
                    onToggleSelect={toggleSelect}
                    onClickDetail={(c) => setDetailContact(c)}
                    onQuickShare={(c) => {
                      setSelectedIds((prev) => {
                        if (prev.size > 1 && prev.has(c.id)) return new Set(prev);
                        if (isMultiSelectMode && prev.size >= 1) {
                          const next = new Set(prev);
                          next.add(c.id);
                          return next;
                        }
                        return new Set([c.id]);
                      });
                      setIsExchangeOpen(true);
                    }}
                  />
                ))}

                {filteredContacts.length === 0 && (
                  <div className="col-span-full py-16 text-center space-y-3 bg-white rounded-3xl border border-dashed border-slate-200">
                    <Sparkles className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-semibold text-slate-500">查無符合條件的名片</p>
                    <button
                      onClick={() => setIsScannerOpen(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
                    >
                      立即掃描第一張名片
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 人脈地圖 */}
          {currentTab === 'map' && (
            <ContactMapView contacts={contacts} onSelectContact={(c) => setDetailContact(c)} />
          )}

          {/* TAB 3: 我的個人數位名片 (完全獨立) */}
          {currentTab === 'mycard' && (
            <MyDigitalCardView
              card={myCard}
              onUpdateCard={(updated) => {
                const saved = saveMyStandaloneProfile(updated);
                setMyCard(saved);
              }}
              onEditCard={() => setDetailContact(myCard)}
            />
          )}
        </main>
      </div>

      {/* 批次多選浮動操作列 (已勾選 >= 1 張時浮現) */}
      {isMultiSelectMode && (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[94vw] sm:w-auto max-w-xl bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl flex flex-wrap items-center justify-center gap-2.5 border border-slate-700 text-xs">
          <span className="font-bold text-blue-400">已選 {selectedIds.size} 張</span>
          <div className="h-4 w-px bg-slate-700" />
          <button onClick={handleSelectAll} className="hover:text-blue-300 font-semibold">
            {selectedIds.size === filteredContacts.length ? '取消全選' : '全選'}
          </button>
          <div className="h-4 w-px bg-slate-700" />
          {selectedIds.size >= 2 && (
            <>
              <button
                onClick={handleMergeSelected}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 hover:bg-amber-400 font-bold"
                title="智慧合併所選名片"
              >
                <GitMerge className="w-3.5 h-3.5" />
                <span>合併為 1 張</span>
              </button>
              <div className="h-4 w-px bg-slate-700" />
            </>
          )}
          <button
            onClick={() => setIsExchangeOpen(true)}
            disabled={selectedIds.size === 0}
            className="flex items-center space-x-1 hover:text-blue-300 font-semibold disabled:opacity-50"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>分享/導出</span>
          </button>
          <button
            onClick={handleBatchDelete}
            disabled={selectedIds.size === 0}
            className="flex items-center space-x-1 text-red-400 hover:text-red-300 font-semibold disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>刪除</span>
          </button>
          <button
            onClick={() => {
              setIsMultiSelectMode(false);
              setSelectedIds(new Set());
            }}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
          >
            完成
          </button>
        </div>
      )}

      {/* 手機底部導覽列 */}
      <TabBar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenScanner={() => setIsScannerOpen(true)}
        onOpenExchange={() => setIsExchangeOpen(true)}
      />

      {/* 彈窗模組 */}
      <ContactDetailDrawer
        contact={detailContact}
        isOpen={Boolean(detailContact)}
        onClose={() => setDetailContact(null)}
        onSave={handleSaveContact}
        onDelete={handleDeleteContact}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        existingContacts={contacts}
        onSaveNewContact={handleSaveContact}
        onMergeContact={handleMergeAndDeduplicateContact}
        onBatchSaveContacts={handleBatchSaveFromScanner}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <ExchangeModal
        isOpen={isExchangeOpen}
        onClose={() => setIsExchangeOpen(false)}
        allContacts={contacts}
        selectedContacts={contacts.filter((c) => selectedIds.has(c.id))}
        onImportSuccess={handleImportSuccess}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}

export default App;
