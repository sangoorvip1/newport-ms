/** سياق التطبيق في الهاتف: يحمل FieldSync + FieldRepo + حالة التنقل.
 *  نُبقي الملف بلا JSX حتى يظل استيراد السياق خفيفًا على الحزمة (الموفِّر يُعرَّف في App.tsx). */
import { createContext, useContext } from 'react';
import type { AccessView } from '@newport/domain';
import type { FieldRepo } from '../data/fieldRepo.js';
import type { FieldSync } from './sync.js';

export type ScreenName = 'login' | 'tasks' | 'shift' | 'round' | 'lab' | 'sync' | 'settings';

export interface AppCtxValue {
  sync: FieldSync;
  repo: FieldRepo;
  access: AccessView;
  online: boolean;
  pending: number;
  conflicts: number;
  screen: ScreenName;
  go(s: ScreenName): void;
  /** بعد أي كتابة محلية: أعد قراءة العدّادات وأعد الرسم */
  bump(): void;
}

export const AppContext = createContext<AppCtxValue | null>(null);

export function useApp(): AppCtxValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp must be used inside AppContext.Provider');
  return v;
}
