/**
 * طبقة الوصول إلى البيانات في سطح المكتب: اقرأ من المخزن المحلي دائمًا، واكتب محليًا + طابور مزامنة.
 * لا تستدعي الشاشات fetch مباشرة (إلا عبر hooks/query.ts للقوائم المتصلة) — هذا ما يجعل التجربة
 * متطابقة سواء كان المعمل متصلًا بالشبكة أو لا.
 */
import {
  SYNC_META,
  newUuidV7,
  slaFor,
  type ChangeOp,
  type LocalMutation,
  type SyncEntity,
  type WorkOrderCreateDto,
} from '@newport/domain';
import type { SyncClient } from '@newport/domain';

/** تُستعمل في إنشاء السجلات المحلية الجديدة مع ختم الهوية من قِبل الخادم لاحقًا */
export function offlineId(): string {
  return newUuidV7();
}

export interface RepoDeps {
  sync: SyncClient;
  read: (entity: SyncEntity, id: string) => Promise<{ data: Record<string, unknown> } | null>;
  subDeptCode: () => string | null;
  userName: () => string;
}

export class LocalRepo {
  constructor(private readonly d: RepoDeps) {}

  private queue(m: LocalMutation): Promise<ChangeOp> {
    return this.d.sync.queue(m);
  }

  /** أمر عمل منشأ في الميدان دون اتصال — يُقبل في الخادم عبر UPSERT (sync-engine يختم الهوية) */
  createWorkOrder(input: WorkOrderCreateDto): Promise<ChangeOp> {
    const sla = slaFor(input.priority);
    const id = offlineId();
    const data: Record<string, unknown> = {
      ...input,
      id,
      number: `OFF-${new Date().getFullYear()}-${id.slice(0, 6).toUpperCase()}`,
      status: 'SUBMITTED',
      subDeptCode: this.d.subDeptCode(),
      slaResponseHours: sla.responseHours,
      slaResolveHours: sla.resolveHours,
      createdBy: this.d.userName(),
      isOfflineCreated: true,
      createdAt: new Date().toISOString(),
    };
    return this.queue({ entity: 'workOrder', id, kind: 'UPSERT', data });
  }

  /** ملاحظة ميدانية على أمر عمل: append دائمًا حتى لا يُلغي فَنِيّ ملاحظة زميله */
  appendWorkOrderNote(workOrderId: string, note: string): Promise<ChangeOp | undefined> {
    if (!note.trim()) return Promise.resolve(undefined);
    return this.d.read('workOrder', workOrderId).then((local) => {
      const prev = typeof local?.data.description === 'string' ? (local.data.description as string) : '';
      return this.queue({
        entity: 'workOrder',
        id: workOrderId,
        kind: 'PATCH',
        data: { description: prev ? `${prev}\n${note.trim()}` : note.trim() },
      });
    });
  }

  /**
   * صورة/مرفق التقطه الفني: يُخزَّن محليًا ويُدفَع كسجل `document` مرفوع إلى أمر العمل.
   * ملاحظة تشغيلية: البايت تبقى على الجهاز حتى يُفعَّل مخزن object-storage؛ نرفع الفهرس
   * (اسم/نوع/حجم/objectKey = مسار محلي مبدئي) فيظهر المرفق في كل الأجهزة فورًا، والتنزيل
   * يُستكمل من `documents.objectKey` بعد إضافة قناة presigned upload.
   */
  attachPhoto(workOrderId: string, photo: { fileName: string; dataUrl: string; takenAt: string; caption?: string }): Promise<ChangeOp> {
    const id = offlineId();
    const approxBytes = Math.max(0, Math.floor((photo.dataUrl.length - (photo.dataUrl.indexOf(',') + 1)) * 0.75));
    return this.queue({
      entity: 'document',
      id,
      kind: 'UPSERT',
      data: {
        titleAr: (photo.caption || photo.fileName).slice(0, 240),
        docType: 'FIELD_PHOTO',
        originalName: photo.fileName.slice(0, 240),
        mimeType: photo.dataUrl.slice(5, photo.dataUrl.indexOf(';')) || 'image/jpeg',
        sizeBytes: approxBytes,
        objectKey: `offline/${id}/${photo.fileName}`.slice(0, 400),
        entityType: 'workOrder',
        entityId: workOrderId,
        status: 'PENDING_UPLOAD',
      },
    });
  }

  /** سجل الوردية الإنتاجي (خط اليوريا/الأمونيا/الأبراج/المختبر) */
  submitShiftLog(input: Record<string, unknown>): Promise<ChangeOp> {
    const id = offlineId();
    return this.queue({ entity: 'shiftLog', id, kind: 'UPSERT', data: { ...input, id, isOfflineCreated: true } });
  }

  /** نتيجة مختبر: تُدخل من الميدان وتُتحقَّق في الشعبة على الخادم (lab.result.verify محمية server-side) */
  submitLabResult(input: Record<string, unknown>): Promise<ChangeOp> {
    const id = offlineId();
    return this.queue({ entity: 'labResult', id, kind: 'UPSERT', data: { ...input, id, isOfflineCreated: true } });
  }

  /** طلب إجازة/ساعة إضافية — مسار الموظفين الذاتي (متاح لنفس المستخدم فقط) */
  submitLeaveRequest(input: Record<string, unknown>): Promise<ChangeOp> {
    const id = offlineId();
    return this.queue({ entity: 'leaveRequest', id, kind: 'UPSERT', data: { ...input, id, isOfflineCreated: true } });
  }

  /** حذف منطقي محلي (للكيانات التي تسمح به) — الخادم يرفض حذف السجلات الحدثية */
  softDelete(entity: SyncEntity, id: string): Promise<ChangeOp | undefined> {
    if (SYNC_META[entity].merge === 'append_only') return Promise.resolve(undefined);
    return this.queue({ entity, id, kind: 'DELETE' });
  }

  entityLabel(entity: SyncEntity): string {
    return SYNC_META[entity]?.descriptionAr ?? entity;
  }
}
