import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { AuthProvider } from './state/auth.js';
import { SyncProvider } from './state/sync.js';
import './styles.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      // في بيئة صناعية: لا نعاقب المستخدم بإعادة محاولات عدوانية عند انقطاع الشبكة
      retry: 1,
      refetchOnWindowFocus: false,
      networkMode: 'online',
    },
    mutations: { networkMode: 'online' },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
