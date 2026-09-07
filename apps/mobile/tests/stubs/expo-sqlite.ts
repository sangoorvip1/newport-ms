/** بديل اختباري لـ expo-sqlite: يُستعمل عبر alias في vitest.config.ts (الحزمة الحقيقية تُثبَّت عند بناء APK/IPA) */
export async function openDatabaseAsync(name: string): Promise<never> {
  throw new Error(`expo-sqlite not available in tests (requested: ${name})`);
}
export type SQLiteResult<Row = Record<string, unknown>> = { rows: Row[] };
export type SQLiteStatement = {
  executeSync<T>(params?: unknown[]): SQLiteResult<T>;
  executeAsync<T>(params?: unknown[]): Promise<SQLiteResult<T>>;
};
export type PreparedSQLTransaction = { execAsync(source: string, params?: unknown[]): Promise<unknown> };
export type SQLiteDatabase = {
  execSync(source: string): void;
  execAsync(source: string): Promise<void>;
  prepareSync(source: string): SQLiteStatement;
  withTransactionAsync(tx: (t: PreparedSQLTransaction) => Promise<void>): Promise<void>;
};
