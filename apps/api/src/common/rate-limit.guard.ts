import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * حدّ معدل بسيط في الذاكرة (token bucket) — يفرض على مسارات auth/sync الحساسة.
 * في الإنتاج يُستبدل بـ Redis إذا كان لدينا أكثر من نسخة من الخدمة (لأن العدّاد يجب أن يكون مشتركًا).
 */
interface Bucket {
  tokens: number;
  updated: number;
}

const POLICIES: Record<string, { capacity: number; refillPerSec: number }> = {
  '/v1/auth/login': { capacity: 5, refillPerSec: 0.1 },
  '/v1/auth/refresh': { capacity: 20, refillPerSec: 1 },
  '/v1/sync/push': { capacity: 30, refillPerSec: 2 },
  '/v1/sync/pull': { capacity: 60, refillPerSec: 5 },
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const path = req.path.replace(/\/$/, '');
    const policy = POLICIES[path];
    if (!policy) return true;

    const key = `${path}:${req.ip}`;
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: policy.capacity, updated: now };
    bucket.tokens = Math.min(policy.capacity, bucket.tokens + ((now - bucket.updated) / 1000) * policy.refillPerSec);
    bucket.updated = now;
    if (bucket.tokens < 1) {
      this.buckets.set(key, bucket);
      res.setHeader?.('retry-after', Math.ceil((1 - bucket.tokens) / policy.refillPerSec));
      throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, messageAr: 'محاولات كثيرة جدًا — انتظر قليلًا ثم أعد المحاولة' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    bucket.tokens -= 1;
    this.buckets.set(key, bucket);
    return true;
  }
}
