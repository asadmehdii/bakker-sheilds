import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { debugService } from './lib/supabase'

// Expose debug utilities to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).debugRLS = async () => {
    await debugService.debugRLS();
  };

  (window as any).quickCheckRLS = async () => {
    return await debugService.quickCheck();
  };

  console.log('🔧 Debug utilities available:');
  console.log('  - debugRLS() - Run comprehensive RLS debugging');
  console.log('  - quickCheckRLS() - Quick RLS check');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)