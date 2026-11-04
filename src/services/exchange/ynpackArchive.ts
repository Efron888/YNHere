import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { ContactCard } from '../../types/contact';

export interface YnpackManifest {
  version: string;
  exportedAt: string;
  totalContacts: number;
}

export interface YnpackImportResult {
  manifest: YnpackManifest;
  contacts: ContactCard[];
  images: Map<string, Uint8Array>;
}

/**
 * 匯出為 .ynpack (標準 ZIP 封裝，內含 manifest.json, contacts.json 與 images/)
 */
export async function exportToYnpack(
  contacts: ContactCard[],
  images: Map<string, Uint8Array>
): Promise<Uint8Array> {
  const manifest: YnpackManifest = {
    version: '2.1.0',
    exportedAt: new Date().toISOString(),
    totalContacts: contacts.length,
  };

  const zipFiles: Record<string, Uint8Array> = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'contacts.json': strToU8(JSON.stringify(contacts, null, 2)),
  };

  for (const [imageId, bytes] of images.entries()) {
    zipFiles[`images/${imageId}.webp`] = bytes;
  }

  return zipSync(zipFiles, { level: 6 });
}

/**
 * 從 .ynpack (ZIP) 還原解析資料與圖片
 */
export async function importFromYnpack(zipBytes: Uint8Array): Promise<YnpackImportResult> {
  const unzipped = unzipSync(zipBytes);

  let manifest: YnpackManifest = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    totalContacts: 0,
  };

  if (unzipped['manifest.json']) {
    manifest = JSON.parse(strFromU8(unzipped['manifest.json']));
  }

  let contacts: ContactCard[] = [];
  if (unzipped['contacts.json']) {
    contacts = JSON.parse(strFromU8(unzipped['contacts.json']));
  }

  const images = new Map<string, Uint8Array>();
  for (const [filePath, fileBytes] of Object.entries(unzipped)) {
    if (filePath.startsWith('images/') && filePath.endsWith('.webp')) {
      const imageId = filePath.replace(/^images\//, '').replace(/\.webp$/, '');
      images.set(imageId, fileBytes);
    }
  }

  return { manifest, contacts, images };
}
