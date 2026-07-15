import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { I18nProvider } from './lib/i18n'
import { ThemeProvider } from './lib/theme'
import { DataProvider } from './data/DataProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { installGlobalErrorLogging } from './lib/errors'

installGlobalErrorLogging()

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
