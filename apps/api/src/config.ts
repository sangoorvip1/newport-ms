/**
 * إعدادات التشغيل — كلها من متغيرات البيئة مع قيم افتراضية آمنة للبيئة المحلية.
 * لا أسرار في الكود: الأسمار (SAP keys / DB creds) تُقرأ من Vault عبر credentialRef في جدول integration_configs.
 */
export interface AppConfig {
  env: 'development' | 'staging' | 'production';
  port: number;
  publicBaseUrl: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtAccessTtlSec: number;
  refreshTtlDays: number;
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  sync: {
    maxOpsPerPush: number;
    maxRowsPerPull: number;
    changeLogRetentionDays: number;
    requireSchemaMatch: boolean;
  };
  storage: {
    driver: 'minio' | 's3' | 'local';
    bucket: string;
    endpoint: string;
    publicDownloadTtlSec: number;
    /** مجلد المخزن المحلي (نسبي إلى cwd الخادم) — يستعمله driver='local' */
    localDir: string;
    /** سقف الرفع الواحد بالبايت (base64 في JSON ≈ 4/3 منه) */
    maxUploadBytes: number;
  };
  facilityCode: string;
  timezone: string;
  push: { fcmEnabled: boolean; apnsEnabled: boolean };
}

const int = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);
const bool = (v: string | undefined, d = false) => (v === 'true' ? true : v === 'false' ? false : d);
const list = (v: string | undefined, d: string[]) => (v ? v.split(',').map((x) => x.trim()) : d);

export function loadConfig(): AppConfig {
  const env = (process.env.NODE_ENV as AppConfig['env']) || 'development';
  return {
    env,
    port: int(process.env.PORT, 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000',
    corsOrigins: list(process.env.CORS_ORIGINS, ['http://localhost:5173', 'file://']),
    jwtSecret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me-32bytes',
    jwtAccessTtlSec: int(process.env.JWT_ACCESS_TTL_SEC, 15 * 60),
    refreshTtlDays: int(process.env.REFRESH_TTL_DAYS, 30),
    bcryptRounds: int(process.env.BCRYPT_ROUNDS, env === 'production' ? 12 : 8),
    maxLoginAttempts: int(process.env.MAX_LOGIN_ATTEMPTS, 5),
    lockoutMinutes: int(process.env.LOCKOUT_MINUTES, 15),
    sync: {
      maxOpsPerPush: int(process.env.SYNC_MAX_OPS, 500),
      maxRowsPerPull: int(process.env.SYNC_MAX_ROWS, 500),
      changeLogRetentionDays: int(process.env.SYNC_RETENTION_DAYS, 45),
      requireSchemaMatch: bool(process.env.SYNC_REQUIRE_SCHEMA, true),
    },
    storage: {
      // 'local' هو المخزّن المنفَّذ فعليًا (قرص على خادم المعمل). minio/s3 مقبولان في الإعداد
      // لكن مسار الكتابة يرفضهما صراحةً حتى يُضاف عميل الكائنات — لا كتابة صامتة إلى مكان غير مضبوط.
      driver: (process.env.STORAGE_DRIVER as AppConfig['storage']['driver']) || 'local',
      bucket: process.env.STORAGE_BUCKET ?? 'newport-docs',
      endpoint: process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000',
      publicDownloadTtlSec: int(process.env.STORAGE_SIGNED_TTL, 600),
      localDir: process.env.STORAGE_LOCAL_DIR ?? 'storage/documents',
      maxUploadBytes: int(process.env.STORAGE_MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
    },
    facilityCode: process.env.FACILITY_CODE ?? 'BFC-L1',
    timezone: process.env.SITE_TZ ?? 'Asia/Baghdad',
    push: { fcmEnabled: bool(process.env.FCM_ENABLED), apnsEnabled: bool(process.env.APNS_ENABLED) },
  };
}

export const CONFIG = loadConfig();
