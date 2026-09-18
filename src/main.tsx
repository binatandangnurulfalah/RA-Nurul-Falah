import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { PwaStatus } from './components/PwaStatus'
import { queryClient } from './data/queryClient'
import './styles/tokens.css'
import './styles.css'
import './brand.css'
import './design-system.css'
import './data-ui.css'
import './pwa-status.css'
import './mobile-v5.css'

const brandLogoUrl = new URL('logo-ra-nurul-falah.png', document.baseURI).toString()
document.documentElement.style.setProperty('--brand-logo-url', `url("${brandLogoUrl}")`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
        <PwaStatus />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
