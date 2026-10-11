import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PwaControls() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installing, setInstalling] = useState(false);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  useEffect(() => {
    const available = event => { event.preventDefault(); setInstallPrompt(event); };
    const installed = () => setInstallPrompt(null);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  async function install() {
    setInstalling(true);
    try { await installPrompt.prompt(); await installPrompt.userChoice; }
    finally { setInstallPrompt(null); setInstalling(false); }
  }
  return <div className="pwa-controls">
    {installPrompt && <button className="secondary" disabled={installing} onClick={install}><Download size={18} aria-hidden="true" />Install AgentTrust</button>}
    {needRefresh && <button className="secondary" onClick={() => updateServiceWorker(true)}><RefreshCw size={18} aria-hidden="true" />Update available</button>}
  </div>;
}
