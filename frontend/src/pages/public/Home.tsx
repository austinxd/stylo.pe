import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo, Button } from '@/components/ui'
import api from '@/api/client'

// Tipos
interface Business {
  id: number
  name: string
  slug: string
  logo: string | null
  description: string
  category_display: string
  branches: Branch[]
}

interface Branch {
  id: number
  name: string
  slug: string
  full_address: string
  cover_image: string | null
  city: string
  district: string
}

interface Category {
  id: number
  slug: string
  name: string
  icon: string
  color: string
  order: number
}

// Iconos SVG
const Icons = {
  Search: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  MapPin: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  Star: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  ),
  Scissors: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.848 8.25l1.536.887M7.848 8.25a3 3 0 11-5.196-3 3 3 0 015.196 3zm1.536.887a2.165 2.165 0 011.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 11-5.196 3 3 3 0 015.196-3zm1.536-.887a2.165 2.165 0 001.083-1.838c.005-.352.054-.695.14-1.025m-1.223 2.863l2.077-1.199m0-3.328a4.323 4.323 0 012.068-1.379l5.325-1.628a4.5 4.5 0 012.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.331 4.331 0 0010.607 12m3.736 0l7.794 4.5-.802.215a4.5 4.5 0 01-2.48-.043l-5.326-1.629a4.324 4.324 0 01-2.068-1.379M14.343 12l-2.882 1.664" />
    </svg>
  ),
  Sparkles: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
  Heart: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  Barber: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  Nail: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 3.5c0-.83.67-1.5 1.5-1.5h2c.83 0 1.5.67 1.5 1.5v4c0 .28-.22.5-.5.5h-4a.5.5 0 01-.5-.5v-4zM8 8h8v8a4 4 0 01-4 4h0a4 4 0 01-4-4V8z" />
    </svg>
  ),
  Spa: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3C8 8 4 10 4 14a8 8 0 1016 0c0-4-4-6-8-11z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18c-2 0-4-1.5-4-4" />
    </svg>
  ),
  Face: ({ className = "w-6 h-6" }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path strokeLinecap="round" d="M8 15s1.5 2 4 2 4-2 4-2" />
    </svg>
  ),
  Arrow: ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
  Calendar: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  ),
  Clock: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Users: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  Check: ({ className = "w-5 h-5" }: { className?: string }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
}

// Mapeo de iconos del backend a componentes
const getIconComponent = (iconName: string) => {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    scissors: Icons.Scissors,
    barber: Icons.Barber,
    nail: Icons.Nail,
    spa: Icons.Spa,
    face: Icons.Face,
    sparkles: Icons.Sparkles,
    heart: Icons.Heart,
    star: Icons.Star,
  }
  return iconMap[iconName?.toLowerCase()] || Icons.Star
}

export default function Home() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadBusinesses()
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const response = await api.get('/businesses/categories/')
      setCategories(response.data || [])
    } catch (error) {
      console.error('Error loading categories:', error)
    }
  }

  const loadBusinesses = async () => {
    try {
      const response = await api.get('/businesses/')
      setBusinesses(response.data.results || response.data || [])
    } catch (error) {
      console.error('Error loading businesses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/buscar?q=${encodeURIComponent(searchQuery)}`)
    }
  }

  const handleCategoryClick = (categoryId: string) => {
    navigate(`/buscar?categoria=${categoryId}`)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Logo size="md" />

            {/* Desktop Search - compact version in navbar */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <form onSubmit={handleSearch} className="w-full">
                <div className="flex items-center bg-neutral-100 rounded-full px-4 py-2 hover:shadow-md transition-shadow border border-transparent hover:border-neutral-200">
                  <Icons.Search className="w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Buscar salón, servicio..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-sm px-3 placeholder-neutral-400"
                  />
                  <div className="h-6 w-px bg-neutral-300" />
                  <button type="button" className="pl-3 text-sm text-neutral-500 hover:text-neutral-700 flex items-center gap-1">
                    <Icons.MapPin className="w-4 h-4" />
                    Lima
                  </button>
                </div>
              </form>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/para-negocios" className="hidden sm:block text-sm text-neutral-600 hover:text-neutral-900 font-medium">
                Para negocios
              </Link>
              <Link to="/auth/login">
                <Button variant="ghost" size="sm">
                  Ingresar
                </Button>
              </Link>
              <Link to="/auth/login" className="hidden sm:block">
                <Button size="sm">
                  Reservar
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Airbnb style */}
      <section className="pt-20 pb-6 md:pt-32 md:pb-16 bg-gradient-to-b from-primary-50/50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-6 md:mb-10">
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold text-neutral-900 mb-2 md:mb-4 tracking-tight">
              Encuentra tu próxima
              <span className="text-primary-600"> experiencia de belleza</span>
            </h1>
            <p className="text-sm md:text-xl text-neutral-600">
              Descubre los mejores salones y profesionales cerca de ti
            </p>
          </div>

          {/* Main Search Bar - Compact on mobile */}
          <form onSubmit={handleSearch} className="max-w-3xl mx-auto">
            {/* Mobile: Simple search bar */}
            <div className="sm:hidden">
              <div className="bg-white rounded-2xl shadow-lg border border-neutral-200 p-3 flex items-center gap-3">
                <Icons.Search className="w-5 h-5 text-neutral-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar salón o servicio..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-neutral-700 placeholder-neutral-400 text-sm"
                />
                <button
                  type="submit"
                  className="bg-primary-600 hover:bg-primary-700 text-white rounded-xl p-2.5 transition-colors"
                >
                  <Icons.Search className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Desktop: Full search bar */}
            <div className="hidden sm:flex bg-white rounded-full shadow-xl border border-neutral-200 p-2 items-center">
              {/* Service/Business search */}
              <div className="flex-1 px-4">
                <label className="block text-xs font-semibold text-neutral-800 mb-1">Qué buscas</label>
                <div className="flex items-center">
                  <Icons.Search className="w-5 h-5 text-neutral-400 mr-2 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Corte de cabello, manicure, spa..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent border-none outline-none text-neutral-700 placeholder-neutral-400"
                  />
                </div>
              </div>

              {/* Divider */}
              <div className="h-10 w-px bg-neutral-200" />

              {/* Location */}
              <div className="flex-1 px-4">
                <label className="block text-xs font-semibold text-neutral-800 mb-1">Dónde</label>
                <div className="flex items-center">
                  <Icons.MapPin className="w-5 h-5 text-neutral-400 mr-2 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Lima, Miraflores..."
                    className="w-full bg-transparent border-none outline-none text-neutral-700 placeholder-neutral-400"
                  />
                </div>
              </div>

              {/* Search Button */}
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white rounded-full p-3 m-1 transition-colors flex items-center justify-center"
              >
                <Icons.Search className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-8 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-lg md:text-3xl font-semibold text-neutral-900 mb-4 md:mb-8">
            Explora por categoría
          </h2>

          {/* Mobile: Horizontal scroll */}
          <div className="sm:hidden overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            <div className="flex gap-3 w-max">
              {categories.map((category) => {
                const IconComponent = getIconComponent(category.icon)
                return (
                  <button
                    key={category.slug}
                    onClick={() => handleCategoryClick(category.slug)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white shadow-sm border border-neutral-100 hover:shadow-md transition-all min-w-[80px]"
                  >
                    <div className={`w-12 h-12 rounded-xl ${category.color} flex items-center justify-center`}>
                      <IconComponent className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-medium text-neutral-700 whitespace-nowrap">
                      {category.name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Desktop: Grid */}
          <div className="hidden sm:grid sm:grid-cols-6 gap-4 md:gap-6">
            {categories.map((category) => {
              const IconComponent = getIconComponent(category.icon)
              return (
                <button
                  key={category.slug}
                  onClick={() => handleCategoryClick(category.slug)}
                  className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-neutral-50 transition-all group"
                >
                  <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl ${category.color} flex items-center justify-center group-hover:scale-110 transition-transform`}>
                    <IconComponent className="w-7 h-7 md:w-8 md:h-8" />
                  </div>
                  <span className="text-sm font-medium text-neutral-700 group-hover:text-neutral-900">
                    {category.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Featured Businesses - Airbnb card style */}
      <section id="negocios" className="py-8 md:py-16 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-4 md:mb-8">
            <div>
              <h2 className="text-lg md:text-3xl font-semibold text-neutral-900">
                Destacados cerca de ti
              </h2>
              <p className="text-sm md:text-base text-neutral-600 mt-0.5 md:mt-1">Los salones mejor valorados en tu zona</p>
            </div>
            <a href="#negocios" className="hidden sm:flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium">
              Ver todos
              <Icons.Arrow className="w-4 h-4" />
            </a>
          </div>

          {loading ? (
            <>
              {/* Mobile skeleton */}
              <div className="sm:hidden space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl overflow-hidden animate-pulse flex">
                    <div className="w-24 h-24 bg-neutral-200 flex-shrink-0" />
                    <div className="p-3 flex-1 space-y-2">
                      <div className="h-4 bg-neutral-200 rounded w-3/4" />
                      <div className="h-3 bg-neutral-200 rounded w-1/2" />
                      <div className="h-3 bg-neutral-200 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop skeleton */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden animate-pulse">
                    <div className="aspect-[4/3] bg-neutral-200" />
                    <div className="p-4 space-y-3">
                      <div className="h-5 bg-neutral-200 rounded w-3/4" />
                      <div className="h-4 bg-neutral-200 rounded w-1/2" />
                      <div className="h-4 bg-neutral-200 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : businesses.length > 0 ? (
            <>
              {/* Mobile: Compact horizontal cards */}
              <div className="sm:hidden space-y-3">
                {businesses.slice(0, 5).map((business) => {
                  const firstBranch = business.branches?.[0]
                  const coverImage = firstBranch?.cover_image

                  return (
                    <Link
                      key={business.id}
                      to={`/${business.slug}${firstBranch ? `/${firstBranch.slug}` : ''}`}
                      className="group bg-white rounded-xl overflow-hidden shadow-sm flex"
                    >
                      {/* Image */}
                      <div className="relative w-24 h-24 flex-shrink-0 overflow-hidden bg-neutral-100">
                        {coverImage ? (
                          <img
                            src={coverImage.startsWith('http') ? coverImage : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${coverImage}`}
                            alt={business.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
                            <Icons.Scissors className="w-8 h-8 text-primary-400" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-3 flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-sm text-neutral-900 line-clamp-1">
                            {business.name}
                          </h3>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Icons.Star className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-neutral-700">4.9</span>
                          </div>
                        </div>
                        {firstBranch && (
                          <p className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                            <Icons.MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="line-clamp-1">
                              {firstBranch.district || firstBranch.city || 'Lima'}
                            </span>
                          </p>
                        )}
                        <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                          {business.description || 'Reserva tu cita online'}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>

              {/* Desktop: Grid */}
              <div className="hidden sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {businesses.slice(0, 8).map((business) => {
                  const firstBranch = business.branches?.[0]
                  const coverImage = firstBranch?.cover_image

                  return (
                    <Link
                      key={business.id}
                      to={`/${business.slug}${firstBranch ? `/${firstBranch.slug}` : ''}`}
                      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300"
                    >
                      {/* Image */}
                      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
                        {coverImage ? (
                          <img
                            src={coverImage.startsWith('http') ? coverImage : `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${coverImage}`}
                            alt={business.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-200">
                            <Icons.Scissors className="w-12 h-12 text-primary-400" />
                          </div>
                        )}
                        {/* Favorite button */}
                        <button
                          className="absolute top-3 right-3 p-2 rounded-full bg-white/80 hover:bg-white transition-colors"
                          onClick={(e) => { e.preventDefault(); }}
                        >
                          <Icons.Heart className="w-5 h-5 text-neutral-600 hover:text-red-500" />
                        </button>
                        {/* Category badge */}
                        <div className="absolute bottom-3 left-3">
                          <span className="px-3 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-neutral-700">
                            {business.category_display || 'Salón'}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors line-clamp-1">
                            {business.name}
                          </h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Icons.Star className="w-4 h-4 text-amber-500" />
                            <span className="text-sm font-medium text-neutral-700">4.9</span>
                          </div>
                        </div>
                        {firstBranch && (
                          <p className="text-sm text-neutral-500 flex items-center gap-1 mb-2">
                            <Icons.MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="line-clamp-1">
                              {firstBranch.district || firstBranch.city || 'Lima'}
                            </span>
                          </p>
                        )}
                        <p className="text-sm text-neutral-600 line-clamp-2">
                          {business.description || 'Reserva tu cita online y disfruta de los mejores servicios de belleza'}
                        </p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl">
              <Icons.Search className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Aún no hay negocios registrados
              </h3>
              <p className="text-neutral-500 mb-6">
                Sé el primero en unirte a Stylo
              </p>
              <Link to="/auth/register">
                <Button>Registrar mi negocio</Button>
              </Link>
            </div>
          )}

          {/* Mobile see all */}
          <div className="sm:hidden mt-6 text-center">
            <a href="#negocios">
              <Button variant="secondary" fullWidth>
                Ver todos los negocios
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-10 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6 md:mb-16">
            <h2 className="text-lg md:text-3xl font-semibold text-neutral-900 mb-1 md:mb-3">
              Reservar es muy facil
            </h2>
            <p className="text-sm md:text-base text-neutral-600 max-w-xl mx-auto">
              En solo 3 pasos tendras tu cita confirmada
            </p>
          </div>

          {/* Mobile: Compact horizontal layout */}
          <div className="md:hidden space-y-4">
            {[
              {
                step: '1',
                icon: Icons.Search,
                title: 'Busca y elige',
                description: 'Explora salones cerca de ti',
              },
              {
                step: '2',
                icon: Icons.Calendar,
                title: 'Selecciona horario',
                description: 'Elige el dia y hora',
              },
              {
                step: '3',
                icon: Icons.Check,
                title: 'Confirma tu cita',
                description: 'Valida con WhatsApp',
              },
            ].map((item) => {
              const IconComponent = item.icon
              return (
                <div key={item.step} className="flex items-center gap-4 bg-neutral-50 rounded-xl p-4">
                  <div className="relative flex-shrink-0 w-14 h-14 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center">
                    <IconComponent className="w-6 h-6" />
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                      {item.step}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-neutral-900 text-sm">
                      {item.title}
                    </h3>
                    <p className="text-neutral-600 text-xs">
                      {item.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: Grid layout */}
          <div className="hidden md:grid md:grid-cols-3 gap-8 md:gap-12 max-w-4xl mx-auto">
            {[
              {
                step: '1',
                icon: Icons.Search,
                title: 'Busca y elige',
                description: 'Explora salones cerca de ti, compara servicios y precios',
              },
              {
                step: '2',
                icon: Icons.Calendar,
                title: 'Selecciona horario',
                description: 'Elige el dia y hora que mejor te convenga',
              },
              {
                step: '3',
                icon: Icons.Check,
                title: 'Confirma tu cita',
                description: 'Valida con tu WhatsApp y listo. Sin cuentas ni contrasenas',
              },
            ].map((item, index) => {
              const IconComponent = item.icon
              return (
                <div key={item.step} className="text-center relative">
                  {/* Connector line */}
                  {index < 2 && (
                    <div className="hidden md:block absolute top-10 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary-200 to-primary-100" />
                  )}
                  <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 mb-6">
                    <IconComponent className="w-8 h-8" />
                    <span className="absolute -top-2 -right-2 w-7 h-7 bg-primary-600 text-white text-sm font-bold rounded-full flex items-center justify-center">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-neutral-600 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* For Business CTA */}
      <section className="py-10 md:py-24 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div className="text-white text-center lg:text-left">
              <span className="inline-block px-3 py-1 md:px-4 md:py-1.5 bg-white/10 rounded-full text-xs md:text-sm font-medium mb-4 md:mb-6">
                Para negocios
              </span>
              <h2 className="text-xl md:text-4xl font-semibold mb-3 md:mb-6">
                Haz crecer tu negocio con Stylo
              </h2>
              <p className="text-sm md:text-lg text-primary-100 mb-6 md:mb-8 leading-relaxed">
                Gestiona citas, profesionales y sucursales desde un solo lugar.
              </p>

              {/* Mobile: 2 column compact grid */}
              <div className="grid grid-cols-2 gap-2 md:gap-4 mb-6 md:mb-10">
                {[
                  'Agenda online 24/7',
                  'Recordatorios',
                  'Analytics',
                  'Multi-sucursal',
                  'Gestión equipo',
                  'Sin comisiones',
                ].map((feature, index) => (
                  <div key={feature} className="flex items-center gap-2 md:gap-3 text-left">
                    <div className="w-4 h-4 md:w-5 md:h-5 rounded-full bg-accent-500 flex items-center justify-center flex-shrink-0">
                      <Icons.Check className="w-2.5 h-2.5 md:w-3 md:h-3 text-white" />
                    </div>
                    <span className="text-xs md:text-base text-primary-100">{feature}</span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center lg:justify-start">
                <Link to="/auth/register" className="w-full sm:w-auto">
                  <Button variant="accent" size="sm" fullWidth className="md:!px-6 md:!py-3">
                    Registrar mi negocio
                  </Button>
                </Link>
                <Link to="/para-negocios" className="w-full sm:w-auto">
                  <Button variant="secondary" size="sm" fullWidth className="!bg-white/10 !text-white hover:!bg-white/20 !border-0 md:!px-6 md:!py-3">
                    Conocer mas
                  </Button>
                </Link>
              </div>
            </div>

            {/* Stats/Preview - hidden on mobile */}
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 border border-white/20">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white/10 rounded-2xl p-5">
                    <p className="text-4xl font-light text-white mb-1">5k+</p>
                    <p className="text-sm text-primary-200">Reservas/mes</p>
                  </div>
                  <div className="bg-white/10 rounded-2xl p-5">
                    <p className="text-4xl font-light text-accent-400 mb-1">98%</p>
                    <p className="text-sm text-primary-200">Satisfaccion</p>
                  </div>
                </div>
                <div className="bg-white/10 rounded-2xl p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-accent-500 flex items-center justify-center">
                      <Icons.Users className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-white font-medium">+200 negocios</p>
                      <p className="text-sm text-primary-200">confian en Stylo</p>
                    </div>
                  </div>
                  <div className="flex -space-x-2">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 border-2 border-primary-800"
                      />
                    ))}
                    <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-primary-800 flex items-center justify-center">
                      <span className="text-xs text-white">+</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-10 md:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-lg md:text-3xl font-semibold text-neutral-900 mb-2 md:mb-4">
            Listo para tu proxima cita?
          </h2>
          <p className="text-sm md:text-lg text-neutral-600 mb-4 md:mb-8">
            Descubre los mejores profesionales de belleza
          </p>
          <a href="#negocios">
            <Button size="sm" className="md:!px-6 md:!py-3" icon={<Icons.Arrow />} iconPosition="right">
              Explorar ahora
            </Button>
          </a>
        </div>
      </section>

      {/* Footer - Single responsive footer */}
      <footer className="border-t border-neutral-200 py-8 lg:py-12 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Logo and description */}
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-8 mb-8">
            <div className="lg:max-w-xs">
              <Logo size="sm" />
              <p className="mt-3 text-sm text-neutral-500 hidden lg:block">
                La plataforma que conecta profesionales de belleza con sus clientes
              </p>
            </div>

            {/* Links grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-12">
              <div>
                <h4 className="font-semibold text-neutral-900 text-sm mb-3">Descubre</h4>
                <ul className="space-y-2 text-sm text-neutral-600">
                  <li><a href="#negocios" className="hover:text-primary-600">Buscar salones</a></li>
                  <li><a href="#negocios" className="hover:text-primary-600">Peluquerias</a></li>
                  <li><a href="#negocios" className="hover:text-primary-600">Barberias</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-neutral-900 text-sm mb-3">Para negocios</h4>
                <ul className="space-y-2 text-sm text-neutral-600">
                  <li><Link to="/para-negocios" className="hover:text-primary-600">Como funciona</Link></li>
                  <li><Link to="/auth/register" className="hover:text-primary-600">Registrar negocio</Link></li>
                </ul>
              </div>
              <div className="hidden lg:block">
                <h4 className="font-semibold text-neutral-900 text-sm mb-3">Soporte</h4>
                <ul className="space-y-2 text-sm text-neutral-600">
                  <li><a href="#" className="hover:text-primary-600">Centro de ayuda</a></li>
                  <li><a href="#" className="hover:text-primary-600">Contacto</a></li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="border-t border-neutral-200 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-neutral-400">
              Powered by austin
            </p>
            <div className="flex items-center gap-4 text-sm text-neutral-500">
              <a href="#" className="hover:text-primary-600">Terminos</a>
              <span className="text-neutral-300">|</span>
              <a href="#" className="hover:text-primary-600">Privacidad</a>
              <span className="text-neutral-300 hidden sm:inline">|</span>
              <span className="hidden sm:flex items-center gap-1">
                <Icons.MapPin className="w-4 h-4" />
                Lima, Peru
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
