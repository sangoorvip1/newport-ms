/** ValidationPipe مبني على Zod — يضمن أن نفس العقد (DTO) يتحقق على العميل والخادم */
import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        messageAr: 'بيانات غير صالحة في الطلب',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
      });
    }
    return parsed.data;
  }
}
