import { StrictMode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { queryClient } from './data/queryClient'
import './styles/tokens.css'
import './styles.css'
import './brand.css'
import './design-system.css'
import './data-ui.css'
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
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </StrictMode>,
)
