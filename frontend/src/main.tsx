import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OcrConfigPanel } from './config/OcrConfigPanel.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'
import { applyMetadataFromNexusToken } from './lib/nexus-token-client'
import { mergeMarketplaceActorMetadata } from './lib/sso-metadata'
import { useWizardStore } from './store/wizardStore'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('OCR de Documentos');

applyMetadataFromNexusToken('nexus_access_token_ocr', (metadata) => {
  const store = useWizardStore.getState();
  store.setMetadataCanal(
    mergeMarketplaceActorMetadata({ ...(store.metadataCanal || {}), ...metadata }),
  );
});

// /config (dev) o /ocr/config (prod con prefijo Apache)
const isConfigRoute = /\/config\/?$/.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConfigRoute
      ? <OcrConfigPanel />
      : (
        <NexusGuard recheckInterval={30}>
          <App />
        </NexusGuard>
      )
    }
  </StrictMode>,
)
