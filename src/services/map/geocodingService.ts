import { ContactCard } from '../../types/contact';
import { db } from '../../db/database';
import { resolveTaiwanDistrictCoords } from './twDistrictCoords';

export interface GeocodedLocation {
  lat: number;
  lng: number;
  isApproximateDistrict: boolean;
}

// 記憶體快取，避免短時間重複打 API
const GEOCODE_CACHE = new Map<string, { lat: number; lng: number }>();

/**
 * 抽取台灣地址的「縣市 + 鄉鎮市區 + 路/街/大道/段」精準路段字串
 * 例如: "11578台北市南港路二段97號5樓" -> "台北市南港路二段"
 * 例如: "新竹市東區力行六路8號" -> "新竹市東區力行六路"
 */
export function extractTaiwanStreetPath(address: string): string {
  if (!address) return '';
  const clean = address.replace(/臺/g, '台').replace(/^\d{3,6}\s*/, '').trim();

  // 抓取到「路/街/大道/段」為止的路段字串
  const match = clean.match(
    /^(?:[台臺灣省]{2,3})?(?:台北市|新北市|桃園市|台中市|台南市|高雄市|基隆市|新竹市|嘉義市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|澎湖縣|金門縣|連江縣)?(?:[\u4e00-\u9fa5]{2,4}[區鄉鎮市])?[\u4e00-\u9fa50-9]{1,10}(?:大道[一二三四五六七八九0-9段]*|路[一二三四五六七八九0-9段]*|街[一二三四五六七八九0-9段]*|段)/
  );

  return match ? match[0] : clean.split(/[號樓F室]/)[0];
}

/**
 * 透過 OpenStreetMap 公共地理編碼服務精準查詢台灣道路/門牌座標
 */
export async function fetchPreciseTaiwanCoords(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const streetPath = extractTaiwanStreetPath(address);
  if (!streetPath || streetPath.length < 4) return null;

  if (GEOCODE_CACHE.has(streetPath)) {
    return GEOCODE_CACHE.get(streetPath)!;
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tw&q=${encodeURIComponent(
      streetPath
    )}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'YNHere-BusinessCard-App/1.0',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      const coord = {
        lat: Number(parseFloat(data[0].lat).toFixed(6)),
        lng: Number(parseFloat(data[0].lon).toFixed(6)),
      };
      GEOCODE_CACHE.set(streetPath, coord);
      return coord;
    }
  } catch (err) {
    console.warn('精準道路地理編碼查詢略過:', err);
  }

  return null;
}

/**
 * 取得聯絡人的最佳地理座標 (三級管線：現存座標 -> 精準道路 -> 離線行政區)
 */
export async function getOrResolveContactLocation(
  contact: ContactCard
): Promise<GeocodedLocation | null> {
  // 1. 若已經有非近似的精確座標，直接採用
  if (contact.location?.lat && contact.location?.lng && !contact.location.isApproximateDistrict) {
    return {
      lat: contact.location.lat,
      lng: contact.location.lng,
      isApproximateDistrict: false,
    };
  }

  const primaryAddress = contact.addresses[0];
  if (!primaryAddress) return null;

  // 2. 嘗試聯網精準道路級別解析
  const precise = await fetchPreciseTaiwanCoords(primaryAddress);
  if (precise) {
    // 異步持久化到 IndexedDB
    const updatedLocation = { ...precise, isApproximateDistrict: false };
    db.contacts.update(contact.id, { location: updatedLocation }).catch(() => {});
    return updatedLocation;
  }

  // 3. Fallback: 使用本機離線行政區字典中心點
  const districtCoord = resolveTaiwanDistrictCoords(primaryAddress);
  if (districtCoord) {
    return {
      lat: districtCoord.lat,
      lng: districtCoord.lng,
      isApproximateDistrict: true,
    };
  }

  return null;
}
