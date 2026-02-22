import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from "@vercel/speed-insights/react"
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './contexts/AppContext'

if (localStorage.getItem('theme') === null) {
  localStorage.setItem('theme', 'dark')
}

if (localStorage.getItem('useCloudSync') === null) {
  localStorage.setItem('useCloudSync', 'true')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
    <Analytics />
    <SpeedInsights />
  </StrictMode>,
)
