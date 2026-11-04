import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { ContactCard } from '../../types/contact';
import { resolveTaiwanDistrictCoords } from '../../services/map/twDistrictCoords';
import { fetchPreciseTaiwanCoords } from '../../services/map/geocodingService';
import { db } from '../../db/database';
import { Phone, Building2, MapPin, Sparkles } from 'lucide-react';

// 修復 Leaflet 預設 Marker 圖示在 Vite 中的路徑問題
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface ContactMapViewProps {
  contacts: ContactCard[];
  onSelectContact: (contact: ContactCard) => void;
}

interface PositionedContact {
  contact: ContactCard;
  lat: number;
  lng: number;
  isPrecise: boolean;
  sameAddressCount: number;
}

export const ContactMapView: React.FC<ContactMapViewProps> = ({ contacts, onSelectContact }) => {
  // 精準道路級座標狀態字典
  const [preciseCoordsMap, setPreciseCoordsMap] = useState<Record<string, { lat: number; lng: number }>>({});

  // 1. 自動針對未有精確座標的台灣地址，在背景非同步查詢精準道路座標並自動快取
  useEffect(() => {
    let isCancelled = false;

    const resolvePreciseLocations = async () => {
      const updates: Record<string, { lat: number; lng: number }> = {};

      for (const c of contacts) {
        if (isCancelled) break;
        // 如果已經有精確座標，直接採用
        if (c.location?.lat && c.location?.lng && !c.location.isApproximateDistrict) {
          updates[c.id] = { lat: c.location.lat, lng: c.location.lng };
          continue;
        }

        const addr = c.addresses[0];
        if (!addr) continue;

        const precise = await fetchPreciseTaiwanCoords(addr);
        if (precise && !isCancelled) {
          updates[c.id] = precise;
          // 持久化到資料庫，未來秒開
          db.contacts.update(c.id, {
            location: { ...precise, isApproximateDistrict: false },
          }).catch(() => {});
        }
      }

      if (!isCancelled && Object.keys(updates).length > 0) {
        setPreciseCoordsMap((prev) => ({ ...prev, ...updates }));
      }
    };

    resolvePreciseLocations();

    return () => {
      isCancelled = true;
    };
  }, [contacts]);

  // 2. 確定性微位移計算（徹底解決相同地址瞎飄 350 公尺問題）
  const mappedContacts: PositionedContact[] = useMemo(() => {
    // 依據標準化地址將名片分組
    const addressGroups = new Map<string, ContactCard[]>();
    for (const c of contacts) {
      const key = (c.addresses[0] || '').replace(/臺/g, '台').trim();
      if (!key) continue;
      const list = addressGroups.get(key) || [];
      list.push(c);
      addressGroups.set(key, list);
    }

    const results: PositionedContact[] = [];

    addressGroups.forEach((groupCards, addressKey) => {
      // 取得該地址基準座標 (優先精準道路 -> 離線行政區)
      let baseLat: number | undefined;
      let baseLng: number | undefined;
      let isPrecise = false;

      // 檢查該組是否已有解析出的精準座標
      for (const c of groupCards) {
        if (preciseCoordsMap[c.id]) {
          baseLat = preciseCoordsMap[c.id].lat;
          baseLng = preciseCoordsMap[c.id].lng;
          isPrecise = true;
          break;
        }
        if (c.location?.lat && c.location?.lng && !c.location.isApproximateDistrict) {
          baseLat = c.location.lat;
          baseLng = c.location.lng;
          isPrecise = true;
          break;
        }
      }

      // 若無精確道路座標，採用離線行政區
      if (!baseLat || !baseLng) {
        const districtCoord = resolveTaiwanDistrictCoords(addressKey);
        if (districtCoord) {
          baseLat = districtCoord.lat;
          baseLng = districtCoord.lng;
          isPrecise = false;
        }
      }

      if (!baseLat || !baseLng) return;

      const count = groupCards.length;

      // 若只有 1 張名片，0 偏移精確落點；若同地址有多張名片，以緊鄰 8 米微位移並排
      groupCards.forEach((c, idx) => {
        let finalLat = baseLat!;
        let finalLng = baseLng!;

        if (count > 1) {
          const angle = (2 * Math.PI * idx) / count;
          // 0.00008 度在台灣約等於 8 公尺微位移，剛好在同一大樓門口兩側，絕不再相隔數百公尺
          const radius = 0.00008;
          finalLat = Number((baseLat! + Math.sin(angle) * radius).toFixed(6));
          finalLng = Number((baseLng! + Math.cos(angle) * radius).toFixed(6));
        }

        results.push({
          contact: c,
          lat: finalLat,
          lng: finalLng,
          isPrecise,
          sameAddressCount: count,
        });
      });
    });

    return results;
  }, [contacts, preciseCoordsMap]);

  // 台灣中心點
  const defaultCenter: [number, number] = [23.973, 120.982];

  return (
    <div className="w-full h-[calc(100vh-12rem)] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
      <MapContainer
        center={mappedContacts.length > 0 ? [mappedContacts[0].lat, mappedContacts[0].lng] : defaultCenter}
        zoom={mappedContacts.length > 0 ? 14 : 8}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mappedContacts.map(({ contact, lat, lng, isPrecise, sameAddressCount }) => (
          <Marker key={contact.id} position={[lat, lng]} icon={defaultIcon}>
            <Popup>
              <div className="p-1 space-y-1.5 text-xs min-w-[180px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{contact.name}</span>
                  {isPrecise ? (
                    <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-bold flex items-center space-x-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>道路級精準</span>
                    </span>
                  ) : (
                    <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">行政區定位</span>
                  )}
                </div>

                <div className="text-slate-600 flex items-center space-x-1">
                  <Building2 className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="truncate">
                    {contact.company} {contact.jobTitle && `• ${contact.jobTitle}`}
                  </span>
                </div>

                {contact.addresses[0] && (
                  <div className="text-slate-500 text-[11px] leading-tight flex items-start space-x-1">
                    <MapPin className="w-3 h-3 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>{contact.addresses[0]}</span>
                  </div>
                )}

                {sameAddressCount > 1 && (
                  <div className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                    🏢 此地址共有 {sameAddressCount} 位人脈聯絡人
                  </div>
                )}

                {contact.phones[0] && (
                  <div className="pt-0.5">
                    <a
                      href={`tel:${contact.phones[0].normalizedDialString || contact.phones[0].number}`}
                      className="inline-flex items-center space-x-1 text-blue-600 font-bold hover:underline"
                    >
                      <Phone className="w-3 h-3" />
                      <span>
                        {contact.phones[0].number}
                        {contact.phones[0].extension ? ` #${contact.phones[0].extension}` : ''}
                      </span>
                    </a>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    onClick={() => onSelectContact(contact)}
                    className="w-full py-1 text-center bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-[11px] transition-colors"
                  >
                    查看名片詳情
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* 底部浮動統計 */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200/80 shadow-md text-xs font-semibold text-slate-700 flex items-center space-x-2">
        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span>
          已定位名片：{mappedContacts.length} / {contacts.length} 張
        </span>
      </div>
    </div>
  );
};
