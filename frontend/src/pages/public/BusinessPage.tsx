import { useParams, Link, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import businessApi from '@/api/business'
import { Button } from '@/components/ui'

// Iconos SVG
const Icons = {
  Location: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  Phone: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  ),
  Clock: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Mail: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  ),
  Instagram: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
    </svg>
  ),
  Verified: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
    </svg>
  ),
  Arrow: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
  Star: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
  ),
  ChevronRight: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  Users: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  Services: ({ className = 'w-5 h-5' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  ExternalLink: ({ className = 'w-4 h-4' }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  ),
}

// Formatear horario
const formatTime = (time: string) => {
  if (!time) return ''
  const [hours, minutes] = time.split(':')
  const h = parseInt(hours)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export default function BusinessPage() {
  const { businessSlug } = useParams<{ businessSlug: string }>()
  const [imageError, setImageError] = useState<Record<number, boolean>>({})

  const { data: business, isLoading, error } = useQuery({
    queryKey: ['business', businessSlug],
    queryFn: () => businessApi.getBusiness(businessSlug!),
    enabled: !!businessSlug,
  })

  // Estilos CSS personalizados basados en los colores del negocio
  const brandStyles = useMemo(() => {
    if (!business) return {}
    return {
      '--brand-primary': business.primary_color || '#1a1a2e',
      '--brand-secondary': business.secondary_color || '#6366f1',
    } as React.CSSProperties
  }, [business])

  // Si hay una sola sucursal, redirigir directamente al booking
  if (business && business.branches?.length === 1) {
    return <Navigate to={`/${businessSlug}/${business.branches[0].slug}`} replace />
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-[3px] border-gray-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  if (error || !business) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Negocio no encontrado
          </h1>
          <p className="text-gray-600 mb-8">
            El negocio que buscas no existe o no está disponible en este momento.
          </p>
          <Link to="/">
            <Button>Volver al inicio</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50" style={brandStyles}>
      {/* Hero Section - Estilo Planity (contenido centrado, no full width) */}
      <div className="bg-gray-50 pt-4 md:pt-6">
        <div className="max-w-5xl mx-auto px-4">
          <div className="relative rounded-2xl overflow-hidden">
            {/* Cover Image o Gradiente */}
            <div className="relative h-56 md:h-72">
              {business.cover_image ? (
                <img
                  src={business.cover_image}
                  alt={business.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{
                    background: `linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)`
                  }}
                />
              )}
              {/* Overlay gradiente */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </div>

            {/* Contenido sobre el hero */}
            <div className="absolute inset-x-0 bottom-0 px-6 md:px-8 pb-6 md:pb-8">
              <div className="flex flex-col md:flex-row md:items-end gap-4 md:gap-6">
                {/* Logo */}
                <div className="flex-shrink-0">
                  {business.logo ? (
                    <img
                      src={business.logo}
                      alt={business.name}
                      className="w-24 h-24 md:w-28 md:h-28 rounded-2xl object-cover shadow-xl border-4 border-white bg-white"
                    />
                  ) : (
                    <div
                      className="w-24 h-24 md:w-28 md:h-28 rounded-2xl flex items-center justify-center shadow-xl border-4 border-white"
                      style={{ backgroundColor: 'var(--brand-secondary)' }}
                    >
                      <span className="text-4xl md:text-5xl text-white font-bold">
                        {business.name.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info del negocio */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow-lg">
                      {business.name}
                    </h1>
                    {business.is_verified && (
                      <span className="text-blue-400" title="Negocio verificado">
                        <Icons.Verified className="w-5 h-5" />
                      </span>
                    )}
                  </div>
                  {business.description && (
                    <p className="text-white/90 text-sm max-w-xl line-clamp-1">
                      {business.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-6 py-4 overflow-x-auto scrollbar-hide">
            {business.phone && (
              <a
                href={`tel:${business.phone}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                  <Icons.Phone className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">{business.phone}</span>
              </a>
            )}
            {business.email && (
              <a
                href={`mailto:${business.email}`}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                  <Icons.Mail className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">{business.email}</span>
              </a>
            )}
            {business.instagram && (
              <a
                href={`https://instagram.com/${business.instagram}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors whitespace-nowrap"
              >
                <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center text-pink-600">
                  <Icons.Instagram className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">@{business.instagram}</span>
              </a>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
              <Icons.Location className="w-4 h-4" />
              <span className="text-sm">
                {business.branches_count} {business.branches_count === 1 ? 'ubicacion' : 'ubicaciones'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sucursales Section */}
      <div className="max-w-5xl mx-auto px-4 py-10">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Nuestras ubicaciones
          </h2>
          <p className="text-gray-600">
            Selecciona una sucursal para ver servicios y reservar
          </p>
        </div>

        {business.branches && business.branches.length > 0 ? (
          <div className="grid gap-6">
            {business.branches.map((branch) => (
              <Link
                key={branch.id}
                to={`/${businessSlug}/${branch.slug}`}
                className="group"
              >
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-xl hover:shadow-gray-100/50 transition-all duration-300">
                  <div className="flex flex-col md:flex-row">
                    {/* Imagen de la sucursal */}
                    <div className="relative md:w-80 h-48 md:h-auto flex-shrink-0 overflow-hidden">
                      {branch.cover_image && !imageError[branch.id] ? (
                        <img
                          src={branch.cover_image}
                          alt={branch.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={() => setImageError(prev => ({ ...prev, [branch.id]: true }))}
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{
                            background: `linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)`
                          }}
                        >
                          <Icons.Location className="w-12 h-12 text-white/50" />
                        </div>
                      )}
                      {/* Badge principal */}
                      {branch.is_main && (
                        <div className="absolute top-4 left-4">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/95 text-gray-900 shadow-lg backdrop-blur-sm">
                            <Icons.Star className="w-3.5 h-3.5 text-amber-500" />
                            Principal
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Contenido */}
                    <div className="flex-1 p-6 flex flex-col">
                      <div className="flex-1">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-xl font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                                {branch.name}
                              </h3>
                              {branch.average_rating && (
                                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                                  <Icons.Star className="w-3.5 h-3.5 text-amber-500" />
                                  <span className="text-sm font-semibold">{branch.average_rating}</span>
                                  {branch.total_reviews && (
                                    <span className="text-xs text-amber-600">({branch.total_reviews})</span>
                                  )}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-400">/{branch.slug}</p>
                          </div>
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white opacity-80 group-hover:opacity-100 transition-all group-hover:scale-110"
                            style={{ backgroundColor: 'var(--brand-secondary)' }}
                          >
                            <Icons.ChevronRight className="w-5 h-5" />
                          </div>
                        </div>

                        {/* Info Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Direccion */}
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                              <Icons.Location className="w-4 h-4 text-primary-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900 line-clamp-1">
                                {branch.address || 'Sin direccion'}
                              </p>
                              <p className="text-xs text-gray-500">
                                {[branch.district, branch.city].filter(Boolean).join(', ') || 'Ubicacion'}
                              </p>
                            </div>
                          </div>

                          {/* Horario */}
                          {(branch.opening_time && branch.closing_time) && (
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                                <Icons.Clock className="w-4 h-4 text-amber-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {formatTime(branch.opening_time)} - {formatTime(branch.closing_time)}
                                </p>
                                <p className="text-xs text-gray-500">Horario de atencion</p>
                              </div>
                            </div>
                          )}

                          {/* Telefono */}
                          {branch.phone && (
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
                                <Icons.Phone className="w-4 h-4 text-green-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{branch.phone}</p>
                                <p className="text-xs text-gray-500">Telefono</p>
                              </div>
                            </div>
                          )}

                          {/* Stats */}
                          {(branch.staff_count !== undefined || branch.services_count !== undefined) && (
                            <div className="flex items-start gap-3">
                              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                                <Icons.Users className="w-4 h-4 text-purple-600" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">
                                  {branch.staff_count || 0} profesionales
                                </p>
                                <p className="text-xs text-gray-500">
                                  {branch.services_count || 0} servicios disponibles
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* CTA */}
                      <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-sm text-gray-500">
                          Ver servicios y reservar
                        </span>
                        <span
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all group-hover:gap-3"
                          style={{ backgroundColor: 'var(--brand-secondary)' }}
                        >
                          Reservar
                          <Icons.Arrow className="w-4 h-4" />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <div className="w-20 h-20 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-6">
              <Icons.Location className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Sin ubicaciones disponibles
            </h3>
            <p className="text-gray-500 max-w-sm mx-auto">
              Este negocio no tiene sucursales disponibles en este momento.
            </p>
          </div>
        )}
      </div>

      {/* Footer simple */}
      <footer className="bg-white border-t border-gray-100 py-8">
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className="text-sm text-gray-500">
            Reservas en linea para {business.name}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Powered by Stylo
          </p>
        </div>
      </footer>
    </div>
  )
}
