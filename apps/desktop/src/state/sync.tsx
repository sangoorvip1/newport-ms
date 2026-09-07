/**
 * سياق المزامنة في سطح المكتب: ينشئ SyncClient (من @newport/domain) مرة واحدة، يشغّل النبض الدوري،
 * ويوفّر المستودع المحلي (LocalRepo) للشاشات. كل شاشة تحفظ محليًا ثم تنبّه الدورة (nudge).
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LocalRepo } from '../data/repo.js';
import { localStore, createSyncHandle, type SyncHandle, type SyncStatus } from '../data/syncStore.js';
import { useAuth } from './auth.js';

interface DesktopSync {
  handle: SyncHandle;
  status: SyncStatus;
  repo: LocalRepo;
  nudge(): void;
  syncNow(): void;
}

const Ctx = createContext<DesktopSync | null>(null);
const handle = createSyncHandle();

export function SyncProvider({ children }: { children: ReactNode }) {
  const { me, session, access } = useAuth();
  const [status, setStatus] = useState<SyncStatus>(handle.status);
  const unsub = useRef<(() => void) | null>(null);

  useEffect(() => {
    unsub.current = handle.subscribe(setStatus);
    return () => {
      unsub.current?.();
    };
  }, []);

  useEffect(() => {
    if (!me) {
      handle.stop();
      return;
    }
    handle.bindUser(me.userId);
    handle.start();
    return () => handle.stop();
  }, [me]);

  const repo = useMemo(
    () =>
      new LocalRepo({
        sync: handle.client,
        read: (entity, id) => localStore.read(entity, id),
        subDeptCode: () => session?.user.subDepartmentCode ?? null,
        userName: () => me?.userId ?? 'unknown',
      }),
    [me, session],
  );

  const value = useMemo<DesktopSync>(
    () => ({ handle, status, repo, nudge: () => handle.nudge(), syncNow: () => void handle.client.syncOnce() }),
    [status, repo, access],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesktopSync(): DesktopSync {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDesktopSync must be used inside <SyncProvider>');
  return v;
}
