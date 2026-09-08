/**
 * مستودع الميدان: كل إدخال في التطبيق يمر من هنا.
 *  1) تحقق فوري بنفس مخططات zod المستخدمة على الخادم (لا يُقبل نموذج غير مكتمل).
 *  2) كتابة محلية في SQLite + إضافة عملية إلى طابور المزامنة (عبر SyncClient المشترك).
 *  3) نبضة دفع فورية إن كان الجهاز متصلًا.
 * لا تكتب الشاشات في SQLite مباشرة — هذا ما يبقي سلوك الهاتف والمكتب متطابقًا.
 */
import {
  DOCUMENT_ENTITY_TYPES,
  labResultEntryDto,
  mobileFormRecordDto,
  newUuidV7,
  shiftLogDto,
  workOrderCreateDto,
  type LabResultEntryDto,
  type MobileFormRecordDto,
  type ShiftLogDto,
  type SyncEntity,
  type WorkOrderCreateDto,
} from '@newport/domain';
import type { DocumentUploadEntityType } from '@newport/domain';
import type { FieldSync } from '../state/sync.js';

export class ValidationError extends Error {
  constructor(
    readonly issues: string[],
    message = 'بيانات النموذج غير مكتملة',
  ) {
    super(message);
  }
}

type LooseSchema = { safeParse: (v: unknown) => { success: boolean; error?: { issues: Array<any> } } };

/** التحقق بـ مخطط الخادم نفسه (zod) — بلا أي منطق تحقق مكرر على العميل */
function assertParse<T>(schema: LooseSchema, value: T): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    const issues = ((r.error?.issues ?? []) as Array<{ path?: unknown; message?: string }>).map(
      (i) => `${((i.path as Array<string | number> | undefined) ?? []).join('.')}: ${i.message ?? 'قيمة غير صالحة'}`,
    );
    throw new ValidationError(issues);
  }
  return value;
}

export interface OfflinePhoto {
  opId: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  /** نسخة مصغّرة للعرض المحلي؛ الملف الكامل يُرفع عبر قناة المستندات عند أول اتصال */
  thumbDataUrl?: string;
}

export class FieldRepo {
  constructor(private readonly sync: FieldSync) {}

  /** أمر عمل جديد من الميدان (يقبل الخادم إنشائه عبر UPSERT ويختم الهوية) */
  async createWorkOrder(input: WorkOrderCreateDto): Promise<string> {
    assertParse(workOrderCreateDto, input);
    const id = input.id ?? newUuidV7();
    await this.sync.client.queue({
      entity: 'workOrder',
      id,
      kind: 'UPSERT',
      data: { ...input, id, status: 'SUBMITTED', isOfflineCreated: true, createdAt: new Date().toISOString() },
    });
    this.sync.nudge();
    return id;
  }

  /** سجل الوردية الإنتاجية (يوريا/أمونيا/أبراج/منافع/مختبر) */
  async submitShiftLog(input: ShiftLogDto): Promise<string> {
    assertParse(shiftLogDto, input);
    const id = input.id ?? newUuidV7();
    await this.sync.client.queue({ entity: 'shiftLog', id, kind: 'UPSERT', data: { ...input, id, isOfflineCreated: true } });
    this.sync.nudge();
    return id;
  }

  /** نتائج مختبر متعددة المعايير لعينة واحدة */
  async submitLabResult(input: LabResultEntryDto): Promise<string> {
    assertParse(labResultEntryDto, input);
    const id = newUuidV7();
    await this.sync.client.queue({ entity: 'labResult', id, kind: 'UPSERT', data: { id, ...input, isOfflineCreated: true } });
    this.sync.nudge();
    return id;
  }

  /** نموذج ميداني مهيكَل (جولة فحص/تفتيش) مع قراءات وصور وGPS */
  async submitForm(input: MobileFormRecordDto): Promise<string> {
    assertParse(mobileFormRecordDto, input);
    const id = input.id ?? newUuidV7();
    await this.sync.client.queue({ entity: 'mobileFormRecord', id, kind: 'UPSERT', data: { ...input, id, isOfflineCreated: true } });
    this.sync.nudge();
    return id;
  }

  /** ملاحظة تُلحق بأمر عمل — لا تستبدل نص زميل (append على الخادم) */
  async appendNote(workOrderId: string, text: string): Promise<void> {
    const t = text.trim();
    if (!t) return;
    const local = await this.sync.client.readLocal('workOrder', workOrderId);
    const prev = typeof local?.data.description === 'string' ? (local.data.description as string) : '';
    await this.sync.client.queue({
      entity: 'workOrder',
      id: workOrderId,
      kind: 'PATCH',
      data: { description: prev && !prev.includes(t) ? `${prev}\n${t}` : prev || t },
    });
    this.sync.nudge();
  }

  /** صورة مرتبطة بنموذج/أمر عمل — تُخزَّن على الجهاز وتُدفع كمستند (document) عند أول اتصال */
  async attachPhoto(entity: SyncEntity, recordId: string, photo: OfflinePhoto): Promise<void> {
    await this.sync.client.queue({
      entity: 'document',
      id: photo.opId,
      kind: 'UPSERT',
      data: {
        // الأعمدة المطلوبة في documents: titleAr/docType/originalName/mimeType/objectKey (+uploadedById من الخادم)
        titleAr: photo.fileName.slice(0, 240),
        docType: 'FIELD_PHOTO',
        originalName: photo.fileName.slice(0, 240),
        mimeType: photo.mimeType,
        objectKey: `offline/${photo.opId}/${photo.fileName}`.slice(0, 400),
        sha256: photo.sha256,
        entityType: entity,
        entityId: entity === 'workOrder' || entity === 'mobileFormRecord' ? recordId : undefined,
        status: 'PENDING_UPLOAD',
      },
    });
    this.sync.nudge();
  }

  /** إقرار استلام أمر عمل (بصمة/رمز PIN) — سجل append-only */
  async acknowledgeWorkOrder(workOrderId: string, note: string): Promise<void> {
    await this.sync.client.queue({
      entity: 'workOrderLog',
      id: newUuidV7(),
      kind: 'UPSERT',
      data: { workOrderId, kind: 'ACKNOWLEDGED', note, at: new Date().toISOString(), isOfflineCreated: true },
    });
    this.sync.nudge();
  }

  /** طلب إجازة (بوابة الموظف الذاتي، نطاق SELF) */
  async requestLeave(input: { from: string; to: string; typeId: string; reasonAr: string }): Promise<void> {
    await this.sync.client.queue({ entity: 'leaveRequest', id: newUuidV7(), kind: 'UPSERT', data: { ...input, statusAr: 'طلب', isOfflineCreated: true } });
    this.sync.nudge();
  }
}
