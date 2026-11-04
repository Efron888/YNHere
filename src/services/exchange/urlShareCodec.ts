import { zlibSync, unzlibSync, strToU8, strFromU8 } from 'fflate';
import { ContactCard } from '../../types/contact';

// 輕量化傳輸 DTO (去除原圖與大縮圖，僅保留核心聯絡欄位)
export type SharedContactDto = Omit<ContactCard, 'frontImageId' | 'backImageId' | 'thumbnailDataUrl'>;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 將名片資料（純文字輕量化）壓縮編碼為 URL Hash
 * 規格硬性限制：最多 10 張名片，防止超過通訊軟體 URL 長度上限
 */
export function encodeContactsToUrlHash(contacts: ContactCard[]): string {
  if (contacts.length > 10) {
    throw new Error('零後端加密連結僅支援最多 10 張名片分享，超過 10 張請使用 .vcf 或 .ynpack 檔案分享！');
  }

  const dtos: SharedContactDto[] = contacts.map((c) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { frontImageId, backImageId, thumbnailDataUrl, ...pureFields } = c;
    return pureFields;
  });

  const jsonStr = JSON.stringify(dtos);
  const compressed = zlibSync(strToU8(jsonStr), { level: 9 });
  const base64url = toBase64Url(compressed);

  return `#card=${base64url}`;
}

/**
 * 從 URL Hash 還原解碼聯絡人列表
 */
export function decodeContactsFromUrlHash(hash: string): ContactCard[] {
  if (!hash.includes('#card=')) {
    return [];
  }

  const payload = hash.slice(hash.indexOf('#card=') + 6);
  if (!payload) return [];

  try {
    const bytes = fromBase64Url(payload);
    const decompressed = unzlibSync(bytes);
    const jsonStr = strFromU8(decompressed);
    const dtos: SharedContactDto[] = JSON.parse(jsonStr);

    return dtos.map((dto) => ({
      ...dto,
      id: dto.id || crypto.randomUUID(),
      createdAt: dto.createdAt || new Date().toISOString(),
      updatedAt: dto.updatedAt || new Date().toISOString(),
      isMyDigitalCard: false,
    }));
  } catch (err) {
    console.error('URL Hash 名片解碼失敗:', err);
    return [];
  }
}
