import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// The home page's typefaces, served from this app rather than a font service, so opening the
// page tells no third party who is reading about RTI. Only the weights the page uses.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/noto-serif/400.css'
import '@fontsource/noto-serif/600.css'
import '@fontsource/noto-serif/700.css'
import '@fontsource/noto-serif/400-italic.css'
import '@fontsource/noto-serif/600-italic.css'
import '@fontsource/khand/600.css'
import '@fontsource/khand/700.css'
import '@fontsource/kalam/400.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
