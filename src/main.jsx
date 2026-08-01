import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react"
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Inicialización de Sentry para capturar errores en producción
Sentry.init({
  dsn: "https://9abf96bd7494f85cc02900a7f3c796ba@o4511830372646912.ingest.us.sentry.io/4511830394732544",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Trazas de rendimiento: captura el 100% de las transacciones
  tracesSampleRate: 1.0, 
  // Grabación de sesiones en video: 10% en uso normal, 100% si ocurre un error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)