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
import type { DocumentUploadQueue, SyncClient } from '@newport/domain';

/** تُستعمل في إنشاء السجلات المحلية الجديدة مع ختم الهوية من قِبل الخادم لاحقًا */
export function offlineId(): string {
  return newUuidV7();
}

export interface RepoDeps {
  sync: SyncClient;
  /** طابور رفع المرفقات (/v1/documents) — اختياري حتى لا تنكهر البيئات التي لا تملك IndexedDB */
  docs?: DocumentUploadQueue;
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
   * صورة/مرفق التقطه الفني: يذهب إلى طابور رفع الوثائق (docs/05 §5) لا إلى المزامنة.
   * كان يرسل فهرسًا بـ `objectKey: offline/...` — سطر يبدو سليمًا لكن تحميله 404 للأبد، لأن
   * objectKey/sha256/sizeBytes تُختم من الملف الفعلي في الخادم. الآن يحمل السجل البايتات نفسها،
   * والمعرّف يُولَّد هنا ويُعاد في كل محاولة فلا تتكرر الصورة إذا انقطع الاتصال منتصف الرفع.
   */
  async attachPhoto(
    workOrderId: string,
    photo: { fileName: string; dataUrl: string; takenAt: string; caption?: string },
  ): Promise<{ ok: boolean; id: string; reasonAr?: string }> {
    const docs = this.d.docs;
    const id = offlineId();
    if (!docs) return { ok: false, id, reasonAr: 'طابور الوثائق غير مهيأ — أعد المحاولة بعد اكتمال الجلسة' };
    const semi = photo.dataUrl.indexOf(';');
    const mimeType = semi > 5 ? photo.dataUrl.slice(5, semi) : 'image/jpeg';
    return docs.add({
      id,
      docType: 'FIELD_PHOTO',
      titleAr: (photo.caption?.trim() || photo.fileName).slice(0, 240),
      originalName: photo.fileName.replace(/\s+/g, '_').slice(0, 240),
      mimeType,
      dataBase64: photo.dataUrl.slice(photo.dataUrl.indexOf(',') + 1),
      entityType: 'workOrder',
      entityId: workOrderId,
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
