import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'
import CategoryIcon from '@/components/ui/CategoryIcon'

interface Category {
  id: number
  slug: string
  name: string
  icon: string
  color: string
  order: number
}

interface Branch {
  id: number
  name: string
  slug: string
  address: string
  district: string
  city: string
  phone: string
  whatsapp: string
  email: string
  is_main: boolean
  is_active: boolean
  cover_image: string | null
}

interface Business {
  id: number
  name: string
  slug: string
  description: string
  logo: string | null
  cover_image: string | null
  cover_position: number
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  primary_color: string
  secondary_color: string
  is_verified: boolean
  branches_count: number
  categories: Category[]
}

interface BusinessFormData {
  name: string
  description: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  primary_color: string
  secondary_color: string
}

type EditSection = 'info' | 'contact' | 'social' | 'branding' | null

export default function BusinessSettings() {
  const queryClient = useQueryClient()
  const [editSection, setEditSection] = useState<EditSection>(null)
  const [formData, setFormData] = useState<BusinessFormData>({
    name: '',
    description: '',
    email: '',
    phone: '',
    website: '',
    instagram: '',
    facebook: '',
    primary_color: '#1a1a2e',
    secondary_color: '#c9a227',
  })
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [savingCategories, setSavingCategories] = useState(false)
  const [editingCoverPosition, setEditingCoverPosition] = useState(false)
  const [coverPosition, setCoverPosition] = useState(50)
  const [savingCoverPosition, setSavingCoverPosition] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Obtener datos del negocio
  const { data: businessData, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'my-business'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/my-business/')
      return response.data
    },
  })

  // Obtener categorías disponibles
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await apiClient.get('/businesses/categories/')
      return response.data as Category[]
    },
  })

  // Actualizar form cuando carguen los datos
  useEffect(() => {
    if (businessData?.business) {
      const b = businessData.business
      setFormData({
        name: b.name || '',
        description: b.description || '',
        email: b.email || '',
        phone: b.phone || '',
        website: b.website || '',
        instagram: b.instagram || '',
        facebook: b.facebook || '',
        primary_color: b.primary_color || '#1a1a2e',
        secondary_color: b.secondary_color || '#c9a227',
      })
      // Inicializar categorías seleccionadas
      if (b.categories) {
        setSelectedCategories(b.categories.map((c: Category) => c.id))
      }
      // Inicializar posición de portada
      setCoverPosition(b.cover_position ?? 50)
    }
  }, [businessData])

  // Actualizar negocio
  const updateBusiness = useMutation({
    mutationFn: async (data: Partial<BusinessFormData>) => {
      const response = await apiClient.patch('/dashboard/my-business/', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'my-business'] })
      setSuccessMessage('Cambios guardados correctamente')
      setEditSection(null)
      setTimeout(() => setSuccessMessage(''), 3000)
    },
    onError: (error: any) => {
      const message = error.response?.data?.error || 'Error al guardar los cambios'
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(''), 5000)
    },
  })

  // Subir imagen (logo o cover)
  const uploadImage = async (file: File, type: 'logo' | 'cover_image') => {
    const setUploading = type === 'logo' ? setUploadingLogo : setUploadingCover
    setUploading(true)
    setErrorMessage('')

    try {
      const formData = new FormData()
      formData.append(type, file)

      await apiClient.patch('/dashboard/my-business/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      queryClient.invalidateQueries({ queryKey: ['dashboard', 'my-business'] })
      setSuccessMessage(type === 'logo' ? 'Logo actualizado' : 'Imagen de portada actualizada')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al subir la imagen'
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setUploading(false)
    }
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('El archivo es muy grande. Maximo 5MB')
        setTimeout(() => setErrorMessage(''), 5000)
        return
      }
      uploadImage(file, 'logo')
    }
  }

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setErrorMessage('El archivo es muy grande. Maximo 10MB')
        setTimeout(() => setErrorMessage(''), 5000)
        return
      }
      uploadImage(file, 'cover_image')
    }
  }

  const handleSaveCoverPosition = async () => {
    setSavingCoverPosition(true)
    setErrorMessage('')
    try {
      await apiClient.patch('/dashboard/my-business/', {
        cover_position: coverPosition
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'my-business'] })
      setSuccessMessage('Posicion de portada guardada')
      setEditingCoverPosition(false)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar la posicion'
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setSavingCoverPosition(false)
    }
  }

  const handleSave = (section: EditSection) => {
    setErrorMessage('')
    let dataToSave: Partial<BusinessFormData> = {}

    switch (section) {
      case 'info':
        dataToSave = { name: formData.name, description: formData.description }
        break
      case 'contact':
        dataToSave = { email: formData.email, phone: formData.phone, website: formData.website }
        break
      case 'social':
        dataToSave = { instagram: formData.instagram, facebook: formData.facebook }
        break
      case 'branding':
        dataToSave = { primary_color: formData.primary_color, secondary_color: formData.secondary_color }
        break
    }

    updateBusiness.mutate(dataToSave)
  }

  const handleCancel = () => {
    if (businessData?.business) {
      const b = businessData.business
      setFormData({
        name: b.name || '',
        description: b.description || '',
        email: b.email || '',
        phone: b.phone || '',
        website: b.website || '',
        instagram: b.instagram || '',
        facebook: b.facebook || '',
        primary_color: b.primary_color || '#1a1a2e',
        secondary_color: b.secondary_color || '#c9a227',
      })
    }
    setEditSection(null)
    setErrorMessage('')
  }

  // Guardar categorías
  const handleSaveCategories = async () => {
    setSavingCategories(true)
    setErrorMessage('')
    try {
      await apiClient.patch('/dashboard/my-business/', {
        category_ids: selectedCategories
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'my-business'] })
      setSuccessMessage('Categorias actualizadas correctamente')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar las categorias'
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setSavingCategories(false)
    }
  }

  // Toggle categoría
  const handleToggleCategory = (categoryId: number) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Error al cargar la configuracion</h3>
          <p className="text-gray-500">Verifica que tengas permisos para acceder a esta seccion.</p>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const business: Business = businessData?.business
  const branches: Branch[] = businessData?.branches || []

  return (
    <div className="max-w-4xl mx-auto pb-12">
      {/* Messages */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {errorMessage}
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        onChange={handleLogoChange}
        className="hidden"
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverChange}
        className="hidden"
      />

      {/* Hero Section - Business Profile Card */}
      <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-br from-gray-900 to-gray-800 shadow-xl">
        {/* Cover Image */}
        <div className="h-40 bg-gradient-to-r from-primary-900/80 to-primary-700/60 relative group">
          {business?.cover_image ? (
            <img
              src={business.cover_image}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: `center ${editingCoverPosition ? coverPosition : (business.cover_position ?? 50)}%` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent" />

          {/* Position editor overlay */}
          {editingCoverPosition && business?.cover_image && (
            <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3 z-10">
              <p className="text-white text-sm font-medium">Arrastra el slider para ajustar la posicion</p>
              <input
                type="range"
                min="0"
                max="100"
                value={coverPosition}
                onChange={(e) => setCoverPosition(Number(e.target.value))}
                className="w-48 h-2 bg-white/30 rounded-lg appearance-none cursor-pointer accent-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setCoverPosition(business.cover_position ?? 50)
                    setEditingCoverPosition(false)
                  }}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-sm font-medium rounded-lg backdrop-blur-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveCoverPosition}
                  disabled={savingCoverPosition}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-900 text-sm font-medium rounded-lg flex items-center gap-2"
                >
                  {savingCoverPosition ? (
                    <>
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      Guardando...
                    </>
                  ) : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* Edit cover buttons */}
          {!editingCoverPosition && (
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
              {business?.cover_image && (
                <button
                  onClick={() => setEditingCoverPosition(true)}
                  className="px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-sm font-medium rounded-lg backdrop-blur-sm flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  Ajustar
                </button>
              )}
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={uploadingCover}
                className="px-3 py-1.5 bg-black/50 hover:bg-black/70 text-white text-sm font-medium rounded-lg backdrop-blur-sm flex items-center gap-2"
              >
                {uploadingCover ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Cambiar
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Profile Info */}
        <div className="relative px-6 pb-6 -mt-12">
          <div className="flex items-end gap-5">
            {/* Logo */}
            <div className="relative group">
              {business?.logo ? (
                <img
                  src={business.logo}
                  alt={business.name}
                  className="w-24 h-24 rounded-2xl object-cover border-4 border-gray-900 shadow-lg"
                />
              ) : (
                <div
                  className="w-24 h-24 rounded-2xl border-4 border-gray-900 shadow-lg flex items-center justify-center text-3xl font-bold text-white"
                  style={{ backgroundColor: business?.primary_color || '#1a1a2e' }}
                >
                  {business?.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}

              {/* Edit logo button overlay */}
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {uploadingLogo ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>

              {business?.is_verified && (
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-blue-500 rounded-full flex items-center justify-center border-2 border-gray-900">
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            {/* Business Name & URL */}
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-2xl font-bold text-white truncate">{business?.name}</h1>
              <a
                href={`/${business?.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mt-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {window.location.origin}/{business?.slug}
              </a>
            </div>

            {/* Stats */}
            <div className="hidden sm:flex items-center gap-6 text-center pb-1">
              <div>
                <div className="text-2xl font-bold text-white">{branches.length}</div>
                <div className="text-xs text-gray-400">Sucursales</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        {/* Basic Info Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Informacion del negocio</h3>
                <p className="text-sm text-gray-500">Nombre y descripcion de tu negocio</p>
              </div>
            </div>
            {editSection !== 'info' && (
              <button
                onClick={() => setEditSection('info')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Editar
              </button>
            )}
          </div>

          {editSection === 'info' ? (
            <div className="p-5 space-y-4 bg-gray-50">
              <Input
                label="Nombre del negocio"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Salon de Belleza Maria"
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe brevemente tu negocio..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all resize-none"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel}>Cancelar</Button>
                <Button onClick={() => handleSave('info')} disabled={updateBusiness.isPending}>
                  {updateBusiness.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="grid gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Nombre</div>
                  <div className="font-medium text-gray-900">{business?.name || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Descripcion</div>
                  <div className="text-gray-700">{business?.description || 'Sin descripcion'}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Categories Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Categorias del negocio</h3>
                <p className="text-sm text-gray-500">Tipo de servicios que ofreces</p>
              </div>
            </div>
          </div>

          <div className="p-5">
            {categoriesData && categoriesData.length > 0 ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {categoriesData.map((category) => {
                    const isSelected = selectedCategories.includes(category.id)
                    return (
                      <button
                        key={category.id}
                        onClick={() => handleToggleCategory(category.id)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <CategoryIcon
                            icon={category.icon}
                            className={isSelected ? 'text-primary-600' : 'text-gray-500'}
                            size={20}
                          />
                          <span className={`text-sm font-medium ${isSelected ? 'text-primary-700' : 'text-gray-700'}`}>
                            {category.name}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <p className="text-sm text-gray-500">
                    {selectedCategories.length} categoria{selectedCategories.length !== 1 ? 's' : ''} seleccionada{selectedCategories.length !== 1 ? 's' : ''}
                  </p>
                  <Button
                    onClick={handleSaveCategories}
                    disabled={savingCategories}
                    size="sm"
                  >
                    {savingCategories ? 'Guardando...' : 'Guardar categorias'}
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>Cargando categorias...</p>
              </div>
            )}
          </div>
        </div>

        {/* Contact Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Informacion de contacto</h3>
                <p className="text-sm text-gray-500">Email, telefono y sitio web</p>
              </div>
            </div>
            {editSection !== 'contact' && (
              <button
                onClick={() => setEditSection('contact')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Editar
              </button>
            )}
          </div>

          {editSection === 'contact' ? (
            <div className="p-5 space-y-4 bg-gray-50">
              <Input
                label="Email de contacto"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contacto@tunegocio.com"
              />
              <Input
                label="Telefono"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+51 999 999 999"
              />
              <Input
                label="Sitio web"
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://www.tunegocio.com"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel}>Cancelar</Button>
                <Button onClick={() => handleSave('contact')} disabled={updateBusiness.isPending}>
                  {updateBusiness.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-500 mb-1">Email</div>
                  <div className="font-medium text-gray-900">{business?.email || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Telefono</div>
                  <div className="font-medium text-gray-900">{business?.phone || '-'}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">Sitio web</div>
                  {business?.website ? (
                    <a href={business.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-600 hover:underline">
                      {business.website.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <div className="text-gray-400">-</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Social Media Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Redes sociales</h3>
                <p className="text-sm text-gray-500">Instagram y Facebook</p>
              </div>
            </div>
            {editSection !== 'social' && (
              <button
                onClick={() => setEditSection('social')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Editar
              </button>
            )}
          </div>

          {editSection === 'social' ? (
            <div className="p-5 space-y-4 bg-gray-50">
              <Input
                label="Instagram"
                value={formData.instagram}
                onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                placeholder="@tunegocio"
                icon={
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                }
              />
              <Input
                label="Facebook"
                value={formData.facebook}
                onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                placeholder="facebook.com/tunegocio"
                icon={
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel}>Cancelar</Button>
                <Button onClick={() => handleSave('social')} disabled={updateBusiness.isPending}>
                  {updateBusiness.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Instagram</div>
                    {business?.instagram ? (
                      <a href={`https://instagram.com/${business.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:text-primary-600">
                        {business.instagram}
                      </a>
                    ) : (
                      <div className="text-gray-400">No configurado</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Facebook</div>
                    {business?.facebook ? (
                      <a href={`https://facebook.com/${business.facebook}`} target="_blank" rel="noopener noreferrer" className="font-medium text-gray-900 hover:text-primary-600">
                        {business.facebook}
                      </a>
                    ) : (
                      <div className="text-gray-400">No configurado</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Branding Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Marca y colores</h3>
                <p className="text-sm text-gray-500">Personaliza la apariencia de tu pagina publica</p>
              </div>
            </div>
            {editSection !== 'branding' && (
              <button
                onClick={() => setEditSection('branding')}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
              >
                Editar
              </button>
            )}
          </div>

          {editSection === 'branding' ? (
            <div className="p-5 space-y-5 bg-gray-50">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color principal</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="w-14 h-14 rounded-xl cursor-pointer border-2 border-gray-200 overflow-hidden"
                    />
                    <input
                      type="text"
                      value={formData.primary_color}
                      onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      placeholder="#1a1a2e"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color secundario</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                      className="w-14 h-14 rounded-xl cursor-pointer border-2 border-gray-200 overflow-hidden"
                    />
                    <input
                      type="text"
                      value={formData.secondary_color}
                      onChange={(e) => setFormData({ ...formData, secondary_color: e.target.value })}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                      placeholder="#c9a227"
                    />
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Vista previa</label>
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <div
                    className="h-20 relative"
                    style={{ backgroundColor: formData.primary_color }}
                  >
                    <div className="absolute bottom-3 left-4 flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold text-white"
                        style={{ backgroundColor: formData.secondary_color }}
                      >
                        {business?.name?.charAt(0)?.toUpperCase() || 'S'}
                      </div>
                      <div className="text-white font-semibold">{business?.name || 'Tu Negocio'}</div>
                    </div>
                  </div>
                  <div className="p-3 bg-white flex gap-2">
                    <div
                      className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                      style={{ backgroundColor: formData.primary_color }}
                    >
                      Reservar
                    </div>
                    <div
                      className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                      style={{ backgroundColor: formData.secondary_color }}
                    >
                      Ver servicios
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={handleCancel}>Cancelar</Button>
                <Button onClick={() => handleSave('branding')} disabled={updateBusiness.isPending}>
                  {updateBusiness.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-lg shadow-inner"
                    style={{ backgroundColor: business?.primary_color || '#1a1a2e' }}
                  />
                  <div>
                    <div className="text-xs text-gray-500">Principal</div>
                    <div className="text-sm font-mono text-gray-700">{business?.primary_color}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-10 h-10 rounded-lg shadow-inner"
                    style={{ backgroundColor: business?.secondary_color || '#c9a227' }}
                  />
                  <div>
                    <div className="text-xs text-gray-500">Secundario</div>
                    <div className="text-sm font-mono text-gray-700">{business?.secondary_color}</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Branches Section */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 flex items-center justify-between border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Sucursales</h3>
                <p className="text-sm text-gray-500">{branches.length} sucursal{branches.length !== 1 ? 'es' : ''} activa{branches.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <Link
              to="/dashboard/sucursales"
              className="px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
            >
              Administrar
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {branches.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 mb-3">No tienes sucursales configuradas</p>
                <Link to="/dashboard/sucursales" className="text-primary-600 font-medium hover:underline">
                  Agregar sucursal
                </Link>
              </div>
            ) : (
              branches.map((branch) => (
                <div key={branch.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-4">
                    {/* Branch image or placeholder */}
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                      {branch.cover_image ? (
                        <img src={branch.cover_image} alt={branch.name} className="w-full h-full object-cover" />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white text-lg font-bold"
                          style={{ backgroundColor: business?.primary_color || '#1a1a2e' }}
                        >
                          {branch.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Branch info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900">{branch.name}</h4>
                        {branch.is_main && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            Principal
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {branch.address}
                        {branch.district && `, ${branch.district}`}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                        {branch.phone && (
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {branch.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <a
                        href={`/${business?.slug}/${branch.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Ver pagina publica"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="mt-6 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Sobre tu pagina publica</h4>
            <p className="text-sm text-blue-700 leading-relaxed">
              Los colores y la informacion que configures aqui se mostraran en tu pagina publica donde tus clientes pueden
              ver tus servicios y hacer reservas. Comparte el enlace <code className="px-1.5 py-0.5 bg-blue-100 rounded text-blue-800 font-mono text-xs">{window.location.origin}/{business?.slug}</code> con tus clientes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
