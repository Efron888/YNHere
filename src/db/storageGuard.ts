/**
 * 跨平台儲存保護與 iOS ITP 沙盒防禦
 */

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      return isPersisted;
    } catch (e) {
      console.warn('申請永久儲存失敗:', e);
      return false;
    }
  }
  return false;
}

export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // @ts-expect-error iOS Safari 特定屬性
  const isIOSStandalone = window.navigator.standalone === true;
  return isStandalone || isIOSStandalone;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

const BACKUP_COUNT_KEY = 'ynhere_unbacked_count';
const LAST_BACKUP_TOTAL_KEY = 'ynhere_last_backup_total';

/**
 * 取得尚未備份的名片數量
 * @param currentTotal 目前名片庫總名片數（防呆邊界，未備份數不可超過名片庫總數）
 */
export function getUnbackedCount(currentTotal?: number): number {
  if (typeof localStorage === 'undefined') return 0;
  const raw = parseInt(localStorage.getItem(BACKUP_COUNT_KEY) || '0', 10);
  
  if (currentTotal !== undefined) {
    // 嚴格邊界：未備份名片數絕不能大於目前名片總張數
    const safe = Math.min(Math.max(0, raw), currentTotal);
    if (safe !== raw) {
      localStorage.setItem(BACKUP_COUNT_KEY, safe.toString());
    }
    return safe;
  }
  return Math.max(0, raw);
}

/**
 * 新增未備份名片計數
 */
export function incrementUnbackedCount(currentTotal?: number): number {
  if (typeof localStorage === 'undefined') return 0;
  const current = getUnbackedCount(currentTotal);
  const next = currentTotal !== undefined ? Math.min(current + 1, currentTotal) : current + 1;
  localStorage.setItem(BACKUP_COUNT_KEY, next.toString());
  return next;
}

/**
 * 匯出備份成功後重置未備份計數為 0
 */
export function resetUnbackedCount(currentTotal?: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BACKUP_COUNT_KEY, '0');
  if (currentTotal !== undefined) {
    localStorage.setItem(LAST_BACKUP_TOTAL_KEY, currentTotal.toString());
  }
}
