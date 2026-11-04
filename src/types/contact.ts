import { z } from 'zod';
import { isValidTaiwanTaxId } from '../services/ocr/twValidators';

export const PhoneItemSchema = z.object({
  type: z.enum(['mobile', 'work', 'fax', 'other']),
  number: z.string().min(1),
  extension: z.string().optional(),
  normalizedDialString: z.string().min(1),
});

export const CareerSnapshotSchema = z.object({
  id: z.string().uuid(),
  company: z.string(),
  department: z.string().default(''),
  jobTitle: z.string().default(''),
  frontImageId: z.string().optional(),
  backImageId: z.string().optional(),
  archivedAt: z.string().datetime(),
});

export const RibbonTaskSchema = z.object({
  status: z.enum(['none', 'pending', 'in_progress', 'follow_up', 'overdue', 'completed']),
  taskTitle: z.string().default(''),
  dueDate: z.string().datetime().optional(),
});

export const TimelineNoteSchema = z.object({
  id: z.string().uuid(),
  content: z.string().min(1),
  createdAt: z.string().datetime(),
  category: z.enum(['visit', 'call', 'email', 'meeting', 'note']).default('note'),
});

export const ContactCardSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  frontImageId: z.string().optional(),
  backImageId: z.string().optional(),
  thumbnailDataUrl: z.string().optional(),

  name: z.string().min(1).default('未命名聯絡人'),
  nameEn: z.string().default(''),
  company: z.string().default(''),
  department: z.string().default(''),
  jobTitle: z.string().default(''),
  taxId: z.string().default('').refine(
    (val) => val === '' || isValidTaiwanTaxId(val),
    { message: '統一編號不符合財政部 8 碼檢核邏輯' }
  ),

  phones: z.array(PhoneItemSchema).default([]),
  emails: z.array(z.string().email().or(z.literal(''))).default([]),
  websites: z.array(z.string()).default([]),
  addresses: z.array(z.string()).default([]),
  socialLinks: z.record(z.string(), z.string()).default({}),

  location: z.object({
    lat: z.number(),
    lng: z.number(),
    isApproximateDistrict: z.boolean().default(true),
  }).optional(),

  groupId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  ribbon: RibbonTaskSchema.default({ status: 'none', taskTitle: '' }),
  timelineNotes: z.array(TimelineNoteSchema).default([]),
  careerHistory: z.array(CareerSnapshotSchema).default([]),
  isMyDigitalCard: z.boolean().default(false),
});

export type ContactCard = z.infer<typeof ContactCardSchema>;
export type PhoneItem = z.infer<typeof PhoneItemSchema>;
export type CareerSnapshot = z.infer<typeof CareerSnapshotSchema>;
export type RibbonTask = z.infer<typeof RibbonTaskSchema>;
export type TimelineNote = z.infer<typeof TimelineNoteSchema>;
