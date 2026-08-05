import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { OcrConfigPanel } from './config/OcrConfigPanel.tsx'
import './lib/bridge'
import { NexusGuard } from './nexus/NexusGuard'
import { applyExelixiBranding } from './lib/exelixi-branding'

// Identidad Exélixi (colores + favicon) solo si el flujo activo es el catálogo.
applyExelixiBranding('OCR de Documentos');

// Enrutamiento simple: /config → panel de configuración, resto → app normal.
const isConfigRoute = window.location.pathname === '/config';

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
