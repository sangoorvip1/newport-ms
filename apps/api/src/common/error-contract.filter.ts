import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * عقد الأخطاء الموحَّد: كل استجابة خطأ تحمل رسالة عربية للمستخدم + معرّف خطأ للبحث في السجلات.
 *
 * لماذا؟ افتراضي Nest يعيد {"statusCode":500,"message":"Internal server error"} فقط، فيبقى
 * المستخدم والعمليات بلا رابط بين ما رآه وما سُجِّل في الخادم. كذلك أخطاء Prisma الخام قد
 * تكشف أسماء جداول/أعمدة — لا تُرَد إلى العميل إطلاقًا.
 *
 * ملاحظة: الاستثناءات المعروفة (HttpException بما فيها Forbidden/Unauthorized التي ترميها
 * طبقات الأمان برسائل عربية) تمر كما هي — يُضاف لها errorId فقط عند 5xx.
 *
 * أخطاء تحقق البيانات لا تظهر هنا أصلًا: مدخلات HTTP تُفحص بـ `ZodPipe` في المتحكمات
 * (400 + `issues[]` بحقول معيّنة) — بما فيها وسائط الاستعلام في قوائم القراءة. ما يبقى
 * هو ما ترفضه القاعدة نفسها بعد الفحص (`P2023` / `22P02` في معرّف uuid): يُرد **400** لا 500،
 * لأنه خطأ في مدخلات العميل لا عطل في الخادم، ورسالة «خطأ غير متوقع» تدفع المشغّل إلى
 * إضاعة ساعة في سجلات سليمة. قياس 2026-09-08: five قائمة/مزامنة كانت 500 لهذا السبب وحده.
 */
const DEFAULT_ARABIC: Record<number, string> = {
  400: 'الطلب غير مكتمل — راجع الحقول المعلَّمة في النموذج.',
  401: 'انتهت الجلسة أو الرمز غير صالح — سجّل الدخول من جديد.',
  403: 'لا تملك صلاحية لهذا الإجراء ضمن نطاق عملك.',
  404: 'العنصر المطلوب غير موجود أو خارج نطاق صلاحياتك.',
  409: 'يوجد تعارض مع نسخة الخادم — حدِّث البيانات وأعد المحاولة.',
  422: 'البيانات المرسلة لا تطابق تعاقد النظام.',
  423: 'الحساب مقفل مؤقتًا — انتظر أو راجع شعبة النظام.',
  429: 'طلبات كثيرة من هذا الجهاز — أعد المحاولة بعد قليل.',
};

@Catch()
export class ErrorContractFilter implements ExceptionFilter {
  private readonly logger = new Logger('http-error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = exception instanceof HttpException ? exception.getResponse() : null;

    // 4xx: نحترم الجسم الذي أعدّه الحارس/المُتحقق (رسائل عربية + حقول إضافية مثل required/yourGrants)
    if (status < 500) {
      const base = typeof payload === 'string' ? { message: payload } : ((payload as Record<string, unknown>) ?? {});
      const messageAr = (base.messageAr as string | undefined) ?? DEFAULT_ARABIC[status] ?? (base.message as string | undefined);
      res.status(status).json({ statusCode: status, ...base, messageAr });
      return;
    }

    const errorId = randomBytes(6).toString('hex');
    const detail = exception instanceof Error ? `${exception.name}: ${exception.message}` : String(exception);

    // رفضتْها القاعدة لأنها صيغة غير مقبولة في عمود uuid: هذا خطأ إدخال، لا عطل خادم
    const prismaCode = (exception as { code?: string } | null)?.code;
    if (prismaCode === 'P2023' || /invalid input syntax|malformed|invalid text representation/i.test(detail)) {
      this.logger.warn(`errorId=${errorId} ${req?.method} ${req?.url} → مدخل مرفوض من القاعدة: ${detail.slice(0, 220)}`);
      res.status(400).json({
        statusCode: 400,
        errorId,
        messageAr: 'قيمة أحد الحقول غير مقبولة لدى القاعدة — راجع المعرّفات والتواريخ ثم أعد المحاولة.',
        hintAr: 'معرّف الخطأ يُستعمل للبحث في سجلات الخادم.',
      });
      return;
    }
    this.logger.error(`errorId=${errorId} ${req?.method} ${req?.url} → ${detail.slice(0, 500)}`);

    res.status(status).json({
      statusCode: status,
      errorId,
      messageAr: 'تعذّر إتمام الطلب بسبب خطأ غير متوقع في الخادم. أبلغ المشرف عن معرّف الخطأ.',
      hintAr: 'معرّف الخطأ يُستعمل للبحث في سجلات الخادم خلال 24 ساعة.',
    });
  }
}
