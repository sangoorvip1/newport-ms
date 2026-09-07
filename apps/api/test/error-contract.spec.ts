import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ErrorContractFilter } from '../src/common/error-contract.filter.js';

/** جسم وهمي لـ Nest: نسجّل ما يصل إلى res.json() ونعيد به assertions */
function fakeHost(exception: unknown) {
  let sent: { status?: number; body?: any } = {};
  const res = {
    status(code: number) {
      sent.status = code;
      return this;
    },
    json(body: unknown) {
      sent.body = body;
      return this;
    },
  };
  const req = { method: 'GET', url: '/api/v1/test' };
  const host = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) } as any;
  return { host, sent: () => sent, exception };
}

describe('error contract (Arabic for users, details hidden for 5xx)', () => {
  it('4xx يحتفظ بحقول الحارس ويضمن messageAr', () => {
    const f = new ErrorContractFilter();
    const h = fakeHost(
      new HttpException({ statusCode: 403, messageAr: 'لا تملك صلاحية لهذا الإجراء ضمن نطاق عملك', required: ['maint.wo.close'], yourGrants: ['a:view'] }, 403),
    );
    f.catch(h.exception as never, h.host);
    const out = h.sent();
    expect(out.status).toBe(403);
    expect(out.body.messageAr).toContain('لا تملك صلاحية');
    expect(out.body.required).toEqual(['maint.wo.close']);
  });

  it('Unauthorized برمز نصي (رسالة إنجليزية) يُترجَم إلى رسالة عربية افتراضية', () => {
    const f = new ErrorContractFilter();
    const h = fakeHost(new HttpException('invalid or expired token', HttpStatus.UNAUTHORIZED));
    f.catch(h.exception as never, h.host);
    const out = h.sent();
    expect(out.status).toBe(401);
    expect(out.body.messageAr).toContain('انتهت الجلسة');
    expect(out.body.message).toBe('invalid or expired token'); // للمبرمج/العميل الآلي
  });

  it('5xx لا يسرّب التفاصيل ويحمل errorId', () => {
    const f = new ErrorContractFilter();
    const h = fakeHost(new Error('PrismaClientKnownRequestError: Invalid `prisma.workOrder.create()` … table work_orders'));
    f.catch(h.exception as never, h.host);
    const out = h.sent();
    expect(out.status).toBe(500);
    expect(typeof out.body.errorId).toBe('string');
    expect(out.body.errorId).toHaveLength(12);
    expect(JSON.stringify(out.body)).not.toContain('Prisma');
    expect(JSON.stringify(out.body)).not.toContain('work_orders');
    expect(out.body.messageAr).toContain('معرّف الخطأ');
  });
});
