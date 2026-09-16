import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './brand.css'

const brandLogoUrl = new URL('logo-ra-nurul-falah.png', document.baseURI).toString()
document.documentElement.style.setProperty('--brand-logo-url', `url("${brandLogoUrl}")`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
