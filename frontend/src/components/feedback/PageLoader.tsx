import { Logo } from '@/components/ui/Logo'

/**
 * Loader full-screen para fallback de Suspense cuando se cargan rutas con lazy.
 * Diseño minimalista: logo + barra de progreso indeterminada.
 */
export function PageLoader({ inline = false }: { inline?: boolean }) {
  const wrapper = inline
    ? 'flex items-center justify-center py-24'
    : 'min-h-screen flex items-center justify-center bg-neutral-50'

  return (
    <div className={wrapper} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <div className="opacity-50">
          <Logo variant="icon" size="lg" />
        </div>
        <div className="w-32 h-0.5 bg-neutral-200 rounded-full overflow-hidden">
          <div className="h-full bg-primary-900 rounded-full animate-progress-indeterminate" />
        </div>
        <span className="sr-only">Cargando…</span>
      </div>
    </div>
  )
}

export default PageLoader
