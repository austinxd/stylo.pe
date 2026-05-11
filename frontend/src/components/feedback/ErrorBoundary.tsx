import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack)
    // TODO: Integrar Sentry aquí cuando se configure
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(this.state.error, this.reset)
    }

    return <DefaultFallback error={this.state.error} reset={this.reset} />
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div
      role="alert"
      className="min-h-screen flex items-center justify-center bg-neutral-50 px-4"
    >
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-error-100 mb-6">
          <AlertTriangle className="w-8 h-8 text-error-600" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold text-neutral-900 mb-2">
          Algo salió mal
        </h1>
        <p className="text-neutral-600 mb-2">
          Encontramos un error inesperado. Puedes intentar de nuevo o volver al inicio.
        </p>
        {import.meta.env.DEV && (
          <pre className="text-xs text-left bg-neutral-100 rounded-lg p-3 my-4 overflow-auto max-h-40">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <button onClick={reset} className="btn-primary">
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Reintentar
          </button>
          <a href="/" className="btn-secondary">
            <Home className="w-4 h-4" aria-hidden="true" />
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  )
}

export default ErrorBoundary
