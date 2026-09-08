import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { CONFIG } from './config.js';
import { installBigIntJson } from './common/json-bigint.js';
import { rootIndexMiddleware } from './common/root-index.js';

async function bootstrap() {
  const logger = new Logger('bootstrap');
  installBigIntJson(); // أعمدة BigInt (syncSeq/syncCursor) وإلا 500 عند أول صف خام
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    // الطلبات الميدانية قد تحمل صورًا/نماذج كبيرة — حدّ صريح أفضل من السلوك الافتراضي
    rawBody: false,
  });

  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true); // تطبيقات سطح المكتب/الهاتف ترسل Origin فارغًا أحيانًا
      if (CONFIG.corsOrigins.includes(origin) || /^capacitor:\/\//.test(origin) || /^newportapp:\/\//.test(origin)) return cb(null, true);
      return cb(new Error(`origin not allowed: ${origin}`), false);
    },
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.use((req: { url?: string }, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    // هيدرات أمان أساسية لواجهات الإدارة (تُستعمل في وضع المتصفح أيضًا)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    void req;
    next();
  });
  app.use(rootIndexMiddleware); // بطاقة تعريف على / و/api بدل 404 خام لا يُعرف منه إن كانت الخدمة حيّة

  await app.listen(CONFIG.port, '0.0.0.0');
  logger.log(`Newport API → http://0.0.0.0:${CONFIG.port}/api  (facility=${CONFIG.facilityCode}, tz=${CONFIG.timezone})`);
}

void bootstrap();
