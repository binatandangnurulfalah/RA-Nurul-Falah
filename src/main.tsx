import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AppErrorBoundary } from './components/layout/AppErrorBoundary'
import './styles.css'
import './brand.css'
import './styles/tokens.css'
import './design-system.css'
import './styles/components.css'
import './mobile-v5.css'

const brandLogoUrl = new URL('logo-ra-nurul-falah.png', document.baseURI).toString()
document.documentElement.style.setProperty('--brand-logo-url', `url("${brandLogoUrl}")`)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </AppErrorBoundary>
  </StrictMode>,
)
