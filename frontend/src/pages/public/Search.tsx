import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '@/api/client'

interface Business {
  id: number
  name: string
  slug: string
  logo: string | null
  is_verified: boolean
  branches_count: number
  categories: Category[]
}

interface Category {
  id: number
  slug: string
  name: string
  icon: string
  color: string
}

interface Branch {
  id: number
  name: string
  slug: string
  cover_image: string | null
  address: string
  district: string
  city: string
  average_rating: number | null
  total_reviews: number
}

export default function Search() {
  const [searchParams] = useSearchParams()
  const categoria = searchParams.get('categoria')
  const query = searchParams.get('q')

  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryName, setCategoryName] = useState<string>('')

  useEffect(() => {
    const loadBusinesses = async () => {
      setLoading(true)
      try {
        let url = '/businesses/'
        const params = new URLSearchParams()

        if (categoria) {
          params.append('category', categoria)
        }
        if (query) {
          params.append('search', query)
        }

        if (params.toString()) {
          url += `?${params.toString()}`
        }

        const response = await api.get(url)
        setBusinesses(response.data.results || response.data || [])

        // Get category name if filtering by category
        if (categoria) {
          const catResponse = await api.get('/businesses/categories/')
          const categories = catResponse.data || []
          const cat = categories.find((c: Category) => c.slug === categoria)
          if (cat) {
            setCategoryName(cat.name)
          }
        }
      } catch (error) {
        console.error('Error loading businesses:', error)
        setBusinesses([])
      } finally {
        setLoading(false)
      }
    }

    loadBusinesses()
  }, [categoria, query])

  const getTitle = () => {
    if (categoryName) return categoryName
    if (query) return `Resultados para "${query}"`
    return 'Todos los negocios'
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <div className="bg-white border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Link to="/" className="text-primary-600 hover:text-primary-700 text-sm mb-2 inline-block">
            &larr; Volver al inicio
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">
            {getTitle()}
          </h1>
          {!loading && (
            <p className="text-neutral-600 mt-1">
              {businesses.length} {businesses.length === 1 ? 'negocio encontrado' : 'negocios encontrados'}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
          </div>
        ) : businesses.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-24 h-24 mx-auto mb-6 bg-neutral-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-neutral-900 mb-2">
              No se encontraron negocios
            </h2>
            <p className="text-neutral-600 mb-6">
              {categoria
                ? 'No hay negocios registrados en esta categoría todavía.'
                : 'No hay negocios que coincidan con tu búsqueda.'}
            </p>
            <Link
              to="/"
              className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors"
            >
              Explorar todos los negocios
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {businesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BusinessCard({ business }: { business: Business }) {
  const [branches, setBranches] = useState<Branch[]>([])
  const [, setLoadingBranches] = useState(true)

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await api.get(`/businesses/${business.slug}/branches/`)
        setBranches(response.data.results || response.data || [])
      } catch (error) {
        console.error('Error loading branches:', error)
      } finally {
        setLoadingBranches(false)
      }
    }
    loadBranches()
  }, [business.slug])

  const mainBranch = branches[0]
  const coverImage = mainBranch?.cover_image

  return (
    <Link
      to={mainBranch ? `/${business.slug}/${mainBranch.slug}` : `/${business.slug}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100 hover:shadow-lg hover:border-neutral-200 transition-all duration-300"
    >
      {/* Image */}
      <div className="aspect-[4/3] bg-neutral-100 relative overflow-hidden">
        {coverImage ? (
          <img
            src={coverImage.startsWith('http') ? coverImage : `http://localhost:8000${coverImage}`}
            alt={business.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary-100 to-primary-50">
            <span className="text-4xl font-bold text-primary-300">
              {business.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Categories badges */}
        {business.categories.length > 0 && (
          <div className="absolute top-3 left-3 flex gap-1 flex-wrap">
            {business.categories.slice(0, 2).map((cat) => (
              <span
                key={cat.id}
                className="px-2 py-1 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-neutral-700"
              >
                {cat.name}
              </span>
            ))}
          </div>
        )}

        {/* Verified badge */}
        {business.is_verified && (
          <div className="absolute top-3 right-3">
            <span className="px-2 py-1 bg-green-500 text-white rounded-full text-xs font-medium flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Verificado
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors line-clamp-1">
            {business.name}
          </h3>
          {mainBranch?.average_rating && (
            <div className="flex items-center gap-1 text-sm">
              <svg className="w-4 h-4 text-yellow-400 fill-current" viewBox="0 0 20 20">
                <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
              </svg>
              <span className="font-medium">{mainBranch.average_rating}</span>
              <span className="text-neutral-400">({mainBranch.total_reviews})</span>
            </div>
          )}
        </div>

        {mainBranch && (
          <p className="text-sm text-neutral-500 line-clamp-1">
            {mainBranch.district}, {mainBranch.city}
          </p>
        )}

        {business.branches_count > 1 && (
          <p className="text-xs text-primary-600 mt-2">
            {business.branches_count} sucursales
          </p>
        )}
      </div>
    </Link>
  )
}
