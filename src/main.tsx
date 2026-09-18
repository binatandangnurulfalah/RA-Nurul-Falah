import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { queryClient } from './data/queryClient'
import { PwaExperience } from './pwa/PwaExperience'
import { registerPwa } from './pwa/registerPwa'
import './styles/tokens.css'
import './styles.css'
import './brand.css'
import './design-system.css'
import './data-ui.css'
import './mobile-v5.css'
import './pwa.css'

const brandLogoUrl = new URL('logo-ra-nurul-falah.png', document.baseURI).toString()
document.documentElement.style.setProperty('--brand-logo-url', `url("${brandLogoUrl}")`)

if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void registerPwa()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <PwaExperience />
          <App />
        </HashRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
