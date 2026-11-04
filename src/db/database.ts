import Dexie, { type EntityTable } from 'dexie';
import { ContactCard } from '../types/contact';

export interface CardImageRecord {
  id: string; // 對應 frontImageId 或 backImageId
  mimeType: string;
  data: Uint8Array;
  width?: number;
  height?: number;
  createdAt: string;
}

export class YNHereDB extends Dexie {
  contacts!: EntityTable<ContactCard, 'id'>;
  cardImages!: EntityTable<CardImageRecord, 'id'>;

  constructor() {
    super('YNHereDB');
    this.version(1).stores({
      contacts: 'id, name, company, taxId, updatedAt, isMyDigitalCard, *tags, groupId',
      cardImages: 'id, createdAt',
    });
  }
}

export const db = new YNHereDB();
