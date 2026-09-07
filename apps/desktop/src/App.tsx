import { useState } from 'react';
import { Shell, type NavItem } from './ui/Shell.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { NewWorkOrderScreen } from './screens/NewWorkOrderScreen.js';
import { WorkOrdersScreen } from './screens/WorkOrdersScreen.js';
import { AttendanceScreen } from './screens/AttendanceScreen.js';
import { OrgTreeScreen } from './screens/OrgTreeScreen.js';
import { SyncScreen } from './screens/SyncScreen.js';
import { useAuth } from './state/auth.js';
import { useDesktopSync } from './state/sync.js';

const NAV: NavItem[] = [
  { id: 'wo', label: 'أوامر العمل' },
  { id: 'new', label: 'طلب عمل جديد', permission: 'maint.wo.create' },
  { id: 'att', label: 'البصمة والحضور' },
  { id: 'org', label: 'الهيكل والصلاحيات', permission: 'org.dept.view' },
  { id: 'sync', label: 'المزامنة والتعارضات' },
];

export function App() {
  const { status } = useAuth();
  const { status: sync } = useDesktopSync();
  const [screen, setScreen] = useState('wo');
  if (status !== 'authenticated') return <LoginScreen />;
  return (
    <Shell nav={NAV} active={screen} onNavigate={setScreen} sync={sync}>
      {screen === 'wo' && <WorkOrdersScreen />}
      {screen === 'new' && <NewWorkOrderScreen />}
      {screen === 'att' && <AttendanceScreen />}
      {screen === 'org' && <OrgTreeScreen />}
      {screen === 'sync' && <SyncScreen />}
    </Shell>
  );
}
