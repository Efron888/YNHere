import { ContactCard } from '../../types/contact';

const PROFILE_STORAGE_KEY = 'ynhere_my_profile_standalone';

export const DEFAULT_MY_PROFILE: ContactCard = {
  id: 'my-standalone-profile-card',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  name: '我的姓名',
  nameEn: 'My Name',
  company: '我的公司名稱',
  department: '所屬部門',
  jobTitle: '我的職稱',
  taxId: '',
  phones: [
    { type: 'mobile', number: '', normalizedDialString: '' },
    { type: 'work', number: '', extension: '', normalizedDialString: '' },
  ],
  emails: [],
  websites: [],
  addresses: [],
  socialLinks: {},
  tags: ['個人代表名片'],
  ribbon: { status: 'none', taskTitle: '' },
  timelineNotes: [],
  careerHistory: [],
  isMyDigitalCard: true,
};

/**
 * 取得完全獨立的個人代表數位名片 (不屬於人脈通訊錄)
 */
export function getMyStandaloneProfile(): ContactCard {
  if (typeof localStorage === 'undefined') return DEFAULT_MY_PROFILE;
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.name) {
        return {
          ...DEFAULT_MY_PROFILE,
          ...parsed,
          id: 'my-standalone-profile-card',
          isMyDigitalCard: true,
        };
      }
    }
  } catch (e) {
    console.error('讀取獨立個人名片失敗:', e);
  }
  return DEFAULT_MY_PROFILE;
}

/**
 * 儲存完全獨立的個人代表數位名片
 */
export function saveMyStandaloneProfile(card: ContactCard): ContactCard {
  const toSave: ContactCard = {
    ...card,
    id: 'my-standalone-profile-card',
    isMyDigitalCard: true,
    updatedAt: new Date().toISOString(),
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('儲存獨立個人名片失敗:', e);
    }
  }

  return toSave;
}
