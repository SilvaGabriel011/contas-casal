import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/errors'

interface State {
  crashed: boolean
}

// Sits OUTSIDE the i18n provider (it must catch provider crashes too),
// so its copy is hardcoded bilingual.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError('render', error)
    if (info.componentStack) logError('render-stack', info.componentStack.slice(0, 300))
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="text-5xl">🫠</div>
        <h1 className="text-xl font-extrabold text-ink">Opa, algo quebrou</h1>
        <p className="text-sm leading-relaxed text-ink2">
          O app tropeçou num erro inesperado. Seus dados estão seguros — recarregue pra continuar.
          <br />
          <span className="opacity-70">Something broke unexpectedly. Your data is safe — reload to continue.</span>
        </p>
        <button
          onClick={() => window.location.reload()}
          className="press grad-accent rounded-2xl px-8 py-3.5 text-[15px] font-bold text-white shadow-md"
        >
          🔄 Recarregar · Reload
        </button>
      </div>
    )
  }
}
