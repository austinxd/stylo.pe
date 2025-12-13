import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'

interface Branch {
  id: number
  name: string
  is_active: boolean
}

interface Service {
  id: number
  name: string
  description: string
  category: number | null
  category_name: string | null
  branch: number
  branch_name: string
  gender: 'M' | 'F' | 'U'
  gender_display: string
  duration_minutes: number
  price: string
  buffer_time_before: number
  buffer_time_after: number
  is_active: boolean
  is_featured: boolean
  staff_count: number
  image?: string
}

interface Category {
  id: number
  name: string
  order: number
}

interface ServiceFormData {
  name: string
  description: string
  category: number | null
  branch: number | null  // Para edición (single)
  branch_ids: number[]   // Para creación (multiple)
  gender: 'M' | 'F' | 'U'
  duration_minutes: number
  price: string
  buffer_time_before: number
  buffer_time_after: number
  is_active: boolean
  is_featured: boolean
}

export default function ServicesManagement() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [uploadingImage, setUploadingImage] = useState<number | null>(null)
  const imageInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({})
  const [formData, setFormData] = useState<ServiceFormData>({
    name: '',
    description: '',
    category: null,
    branch: null,
    branch_ids: [],
    gender: 'U',
    duration_minutes: 30,
    price: '',
    buffer_time_before: 0,
    buffer_time_after: 0,
    is_active: true,
    is_featured: false,
  })
  const [isCreating, setIsCreating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Obtener sucursales para el selector
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['dashboard', 'branches'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/branches/')
      // El API puede retornar array directo o paginado { count, results }
      const data = response.data
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.results)) return data.results
      return []
    },
  })

  // Obtener categorias para el selector (globales para toda la plataforma)
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['dashboard', 'services', 'categories'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/services/categories/')
      return Array.isArray(response.data) ? response.data : []
    },
  })

  // Obtener servicios
  const { data: services = [], isLoading, error } = useQuery<Service[]>({
    queryKey: ['dashboard', 'services'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/services/')
      // El API retorna { count, next, previous, results }
      const data = response.data
      if (Array.isArray(data)) return data
      if (data && Array.isArray(data.results)) return data.results
      return []
    },
  })

  // Actualizar servicio
  const updateService = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ServiceFormData> }) => {
      const response = await apiClient.patch(`/dashboard/services/${id}/`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] })
      closeModal()
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al actualizar servicio'
      setErrors({ general: message })
    },
  })

  // Eliminar servicio
  const deleteService = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/dashboard/services/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] })
    },
  })

  const openModal = (service?: Service) => {
    if (service) {
      setEditingService(service)
      setFormData({
        name: service.name,
        description: service.description || '',
        category: service.category,
        branch: service.branch,
        branch_ids: [service.branch], // Single branch for editing
        gender: service.gender || 'U',
        duration_minutes: service.duration_minutes,
        price: service.price,
        buffer_time_before: service.buffer_time_before || 0,
        buffer_time_after: service.buffer_time_after || 0,
        is_active: service.is_active,
        is_featured: service.is_featured,
      })
    } else {
      // Para creación: preseleccionar todas las sucursales activas
      const activeBranchIds = branches.filter(b => b.is_active).map(b => b.id)
      setEditingService(null)
      setFormData({
        name: '',
        description: '',
        category: categories[0]?.id || null,
        branch: null,
        branch_ids: activeBranchIds,
        gender: 'U',
        duration_minutes: 30,
        price: '',
        buffer_time_before: 0,
        buffer_time_after: 0,
        is_active: true,
        is_featured: false,
      })
    }
    setErrors({})
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingService(null)
    setErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validacion basica
    const newErrors: Record<string, string> = {}
    if (!formData.name.trim()) newErrors.name = 'El nombre es requerido'
    if (!formData.price || parseFloat(formData.price) <= 0) newErrors.price = 'El precio debe ser mayor a 0'
    if (formData.duration_minutes < 5) newErrors.duration_minutes = 'La duracion minima es 5 minutos'

    if (editingService) {
      // Para edición, validar single branch
      if (!formData.branch) newErrors.branch = 'La sucursal es requerida'
    } else {
      // Para creación, validar que haya al menos una sucursal seleccionada
      if (formData.branch_ids.length === 0) newErrors.branch = 'Selecciona al menos una sucursal'
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (editingService) {
      updateService.mutate({ id: editingService.id, data: formData })
    } else {
      // Crear servicio en múltiples sucursales
      setIsCreating(true)
      setErrors({})

      try {
        const promises = formData.branch_ids.map(branchId =>
          apiClient.post('/dashboard/services/', {
            ...formData,
            branch: branchId,
          })
        )

        await Promise.all(promises)
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] })
        closeModal()
      } catch (error: any) {
        const errorData = error.response?.data?.error
        const message = typeof errorData === 'string'
          ? errorData
          : errorData?.message || 'Error al crear servicios'
        setErrors({ general: message })
      } finally {
        setIsCreating(false)
      }
    }
  }

  const handleDelete = (service: Service) => {
    if (confirm(`¿Estas seguro de eliminar "${service.name}"?`)) {
      deleteService.mutate(service.id)
    }
  }

  const uploadServiceImage = async (serviceId: number, file: File) => {
    setUploadingImage(serviceId)
    try {
      const formData = new FormData()
      formData.append('image', file)
      await apiClient.patch(`/dashboard/services/${serviceId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'services'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al subir la imagen')
    } finally {
      setUploadingImage(null)
    }
  }

  const handleImageChange = (serviceId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadServiceImage(serviceId, file)
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error al cargar los servicios</p>
        <p className="text-gray-500 text-sm">Verifica que tengas permisos para acceder.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Servicios y Precios</h2>
          <p className="text-sm text-gray-500">Gestiona los servicios de tus sucursales</p>
        </div>
        <Button onClick={() => openModal()}>+ Nuevo Servicio</Button>
      </div>

      {/* Lista de servicios */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : services.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">✂️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay servicios</h3>
          <p className="text-gray-500 mb-4">Crea tu primer servicio para empezar a recibir reservas</p>
          <Button onClick={() => openModal()}>Crear primer servicio</Button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Imagen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Servicio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sucursal
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Para
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duracion
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Precio
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {services.map((service) => (
                <tr key={service.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div
                      className="relative w-12 h-12 rounded-lg bg-gray-100 overflow-hidden group cursor-pointer"
                      onClick={() => imageInputRefs.current[service.id]?.click()}
                    >
                      {service.image ? (
                        <img
                          src={service.image}
                          alt={service.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">
                          ✂️
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {uploadingImage === service.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        ) : (
                          <span className="text-white text-xs">Editar</span>
                        )}
                      </div>
                      <input
                        ref={(el) => { imageInputRefs.current[service.id] = el }}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageChange(service.id, e)}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium text-gray-900">
                        {service.name}
                        {service.is_featured && (
                          <span className="ml-2 text-yellow-500" title="Destacado">⭐</span>
                        )}
                      </p>
                      {service.category_name && (
                        <p className="text-xs text-primary-600">{service.category_name}</p>
                      )}
                      {service.description && (
                        <p className="text-sm text-gray-500 truncate max-w-xs">{service.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {service.branch_name}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        service.gender === 'M'
                          ? 'bg-blue-100 text-blue-800'
                          : service.gender === 'F'
                          ? 'bg-pink-100 text-pink-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {service.gender === 'M' ? 'Hombres' : service.gender === 'F' ? 'Mujeres' : 'Unisex'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {service.duration_minutes} min
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    S/ {parseFloat(service.price).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        service.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {service.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => openModal(service)}
                      className="text-primary-600 hover:text-primary-900 mr-3"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(service)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
              </h3>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {errors.general && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {errors.general}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {editingService ? 'Sucursal *' : 'Sucursales *'}
                </label>
                {editingService ? (
                  // Modo edición: single select
                  <select
                    value={formData.branch || ''}
                    onChange={(e) => setFormData({ ...formData, branch: Number(e.target.value) || null })}
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                      errors.branch ? 'border-red-300' : 'border-gray-200'
                    }`}
                  >
                    <option value="">Selecciona una sucursal</option>
                    {branches.filter(b => b.is_active).map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  // Modo creación: multi-select con checkboxes
                  <div className={`border rounded-lg p-3 space-y-2 ${
                    errors.branch ? 'border-red-300' : 'border-gray-200'
                  }`}>
                    {branches.filter(b => b.is_active).length === 0 ? (
                      <p className="text-gray-500 text-sm">No hay sucursales activas</p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                          <span className="text-xs text-gray-500">
                            {formData.branch_ids.length} de {branches.filter(b => b.is_active).length} seleccionadas
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const activeBranchIds = branches.filter(b => b.is_active).map(b => b.id)
                              const allSelected = formData.branch_ids.length === activeBranchIds.length
                              setFormData({
                                ...formData,
                                branch_ids: allSelected ? [] : activeBranchIds
                              })
                            }}
                            className="text-xs text-primary-600 hover:text-primary-800 font-medium"
                          >
                            {formData.branch_ids.length === branches.filter(b => b.is_active).length
                              ? 'Deseleccionar todas'
                              : 'Seleccionar todas'}
                          </button>
                        </div>
                        {branches.filter(b => b.is_active).map((branch) => (
                          <label key={branch.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={formData.branch_ids.includes(branch.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    branch_ids: [...formData.branch_ids, branch.id]
                                  })
                                } else {
                                  setFormData({
                                    ...formData,
                                    branch_ids: formData.branch_ids.filter(id => id !== branch.id)
                                  })
                                }
                              }}
                              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                            />
                            <span className="text-sm text-gray-700">{branch.name}</span>
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                )}
                {errors.branch && (
                  <p className="text-red-500 text-xs mt-1">{errors.branch}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Categoria
                </label>
                <select
                  value={formData.category || ''}
                  onChange={(e) => setFormData({ ...formData, category: Number(e.target.value) || null })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sin categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Nombre del servicio *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Corte de cabello"
                error={errors.name}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripcion (opcional)
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe el servicio..."
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dirigido a
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="U"
                      checked={formData.gender === 'U'}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'U' })}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Unisex</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="M"
                      checked={formData.gender === 'M'}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'U' })}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Hombres</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value="F"
                      checked={formData.gender === 'F'}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' | 'U' })}
                      className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">Mujeres</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Duracion (minutos) *
                  </label>
                  <input
                    type="number"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                    min="5"
                    step="5"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.duration_minutes && (
                    <p className="text-red-500 text-xs mt-1">{errors.duration_minutes}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio (S/) *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    min="0"
                    step="0.50"
                    placeholder="0.00"
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  {errors.price && (
                    <p className="text-red-500 text-xs mt-1">{errors.price}</p>
                  )}
                </div>
              </div>


              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Activo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                    className="w-4 h-4 text-yellow-500 rounded focus:ring-yellow-500"
                  />
                  <span className="text-sm text-gray-700">Destacado ⭐</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isCreating || updateService.isPending}
                >
                  {isCreating || updateService.isPending
                    ? 'Guardando...'
                    : editingService
                    ? 'Guardar cambios'
                    : formData.branch_ids.length > 1
                    ? `Crear en ${formData.branch_ids.length} sucursales`
                    : 'Crear servicio'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
