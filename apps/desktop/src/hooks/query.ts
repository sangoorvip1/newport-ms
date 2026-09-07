/** خطاف القوائم المتصلة مع بدلة احتياطية من المخزن المحلي عند انقطاع الشبكة */
import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiFetch } from '../data/api.js';
import { localStore } from '../data/syncStore.js';
import type { SyncEntity } from '@newport/domain';

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

export function useServerList<T>(key: QueryKey, path: string, params?: Record<string, string | number | undefined>, enabled = true) {
  const online = useOnline();
  return useQuery({
    queryKey: key,
    enabled: enabled && online,
    staleTime: 20_000,
    retry: 1,
    queryFn: () => apiFetch<Paged<T>>(path, { query: params as Record<string, string | undefined> }),
  });
}

/** قراءة كل سجلات كيان من المخزن المحلي (تُستخدم للوضع دون اتصال ولسجل "غير مُرسَل بعد") */
export function useLocalRecords<T = Record<string, unknown>>(entity: SyncEntity) {
  const [rows, setRows] = useState<Array<{ id: string; version: number; data: T }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const ids = await localStore.listIds(entity);
      const out: Array<{ id: string; version: number; data: T }> = [];
      for (const id of ids) {
        const rec = await localStore.read(entity, id);
        if (rec && !rec.deleted) out.push({ id: rec.id, version: rec.version, data: rec.data as T });
      }
      if (alive) {
        setRows(out);
        setLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), 5_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [entity]);
  return { rows, loading };
}
