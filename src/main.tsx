import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { ThemeProvider } from './lib/theme'
import { DataProvider } from './data/DataProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorLogging } from './lib/errors'
import { registerSW } from 'virtual:pwa-register'

installGlobalErrorLogging()

// The service worker auto-updates, but iOS only looks for a new version on a
// cold start — an app parked in memory would stay stale for days. So also
// check whenever the app returns to the foreground, and hourly while open;
// when a new version activates the page reloads itself.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => registration.update().catch(() => {})
    setInterval(check, 60 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <I18nProvider>
          <DataProvider>
            <App />
          </DataProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
)
