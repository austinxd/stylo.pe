import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'

// Ciudades principales de Peru
const CITIES_PERU = [
  'Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Iquitos', 'Cusco',
  'Huancayo', 'Tacna', 'Chimbote', 'Ica', 'Pucallpa', 'Juliaca', 'Sullana',
  'Ayacucho', 'Chincha Alta', 'Huanuco', 'Tarapoto', 'Cajamarca', 'Puno'
]

// Distritos por ciudad
const DISTRICTS_BY_CITY: Record<string, string[]> = {
  'Lima': [
    'Ate', 'Barranco', 'Breña', 'Carabayllo', 'Cercado de Lima', 'Chaclacayo',
    'Chorrillos', 'Cieneguilla', 'Comas', 'El Agustino', 'Independencia',
    'Jesus Maria', 'La Molina', 'La Victoria', 'Lince', 'Los Olivos',
    'Lurigancho', 'Lurin', 'Magdalena del Mar', 'Miraflores', 'Pachacamac',
    'Pucusana', 'Pueblo Libre', 'Puente Piedra', 'Punta Hermosa', 'Punta Negra',
    'Rimac', 'San Bartolo', 'San Borja', 'San Isidro', 'San Juan de Lurigancho',
    'San Juan de Miraflores', 'San Luis', 'San Martin de Porres', 'San Miguel',
    'Santa Anita', 'Santa Maria del Mar', 'Santa Rosa', 'Santiago de Surco',
    'Surquillo', 'Villa El Salvador', 'Villa Maria del Triunfo'
  ],
  'Arequipa': [
    'Alto Selva Alegre', 'Arequipa', 'Cayma', 'Cerro Colorado', 'Characato',
    'Jacobo Hunter', 'Jose Luis Bustamante y Rivero', 'Mariano Melgar',
    'Miraflores', 'Paucarpata', 'Sachaca', 'Socabaya', 'Tiabaya', 'Yanahuara'
  ],
  'Trujillo': [
    'El Porvenir', 'Florencia de Mora', 'Huanchaco', 'La Esperanza',
    'Laredo', 'Moche', 'Salaverry', 'Trujillo', 'Victor Larco Herrera'
  ],
  'Cusco': [
    'Cusco', 'San Jeronimo', 'San Sebastian', 'Santiago', 'Wanchaq'
  ]
}

// Iconos SVG reutilizables
const Icons = {
  location: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  phone: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  services: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  star: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  externalLink: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  camera: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  gallery: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
}

// Funcion para geocodificar direccion usando Google Geocoding API
const geocodeAddress = async (address: string, district: string, city: string): Promise<{ lat: number; lng: number } | null> => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.warn('Google Maps API key no configurada')
    return null
  }

  // Construir direccion incluyendo distrito solo si existe
  const addressParts = [address, district, city, 'Peru'].filter(Boolean)
  const fullAddress = addressParts.join(', ')
  const encodedAddress = encodeURIComponent(fullAddress)

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
    )
    const data = await response.json()

    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const { lat, lng } = data.results[0].geometry.location
      // Limitar a 6 decimales para evitar error del backend
      return {
        lat: Math.round(lat * 1000000) / 1000000,
        lng: Math.round(lng * 1000000) / 1000000
      }
    }

    console.warn('No se pudo geocodificar la direccion:', data.status)
    return null
  } catch (error) {
    console.error('Error al geocodificar:', error)
    return null
  }
}

// Componente de mapa estatico usando Google Maps Static API
const StaticMap = ({ lat, lng, className = '' }: { lat: number; lng: number; className?: string }) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  if (!apiKey) return null

  const mapUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=16&size=600x200&scale=2&markers=color:red%7C${lat},${lng}&key=${apiKey}`

  return (
    <img
      src={mapUrl}
      alt="Ubicacion en mapa"
      className={`w-full rounded-xl ${className}`}
    />
  )
}

interface BranchPhoto {
  id: number
  image: string
  caption: string
  is_cover: boolean
  order: number
  created_at?: string
}

interface Branch {
  id: number
  name: string
  slug: string
  address: string
  address_reference: string
  district: string
  city: string
  latitude: number | null
  longitude: number | null
  phone: string
  email: string
  opening_time: string
  closing_time: string
  is_active: boolean
  is_main: boolean
  staff_count?: number
  services_count?: number
  cover_image?: string
  full_address?: string
  google_maps_url?: string
  photos?: BranchPhoto[]
}

interface BranchFormData {
  name: string
  address: string
  address_reference: string
  district: string
  city: string
  latitude: number | null
  longitude: number | null
  phone: string
  email: string
  opening_time: string
  closing_time: string
  is_active: boolean
  cover_image?: File | null
}

// Pasos del wizard (reducidos de 4 a 3)
const STEPS = [
  { id: 1, title: 'Informacion y Fotos', icon: '1' },
  { id: 2, title: 'Ubicacion', icon: '2' },
  { id: 3, title: 'Configuracion', icon: '3' },
]

export default function BranchesManagement() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [uploadingImage, setUploadingImage] = useState<number | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRefs = useRef<{ [key: number]: HTMLInputElement | null }>({})
  const modalImageInputRef = useRef<HTMLInputElement>(null)
  // Ref para mantener el archivo de imagen seleccionado (no se pierde con re-renders)
  const selectedImageFileRef = useRef<File | null>(null)
  // Gallery modal state
  const [, setIsGalleryOpen] = useState(false)
  const [galleryBranch, setGalleryBranch] = useState<Branch | null>(null)
  const [galleryPhotos, setGalleryPhotos] = useState<BranchPhoto[]>([])
  const [, setIsLoadingPhotos] = useState(false)
  const [, setIsUploadingPhoto] = useState(false)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<BranchFormData>({
    name: '',
    address: '',
    address_reference: '',
    district: '',
    city: 'Lima',
    latitude: null,
    longitude: null,
    phone: '',
    email: '',
    opening_time: '09:00',
    closing_time: '19:00',
    is_active: true,
    cover_image: null,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Estados para galeria integrada en el modal
  const [modalPhotos, setModalPhotos] = useState<BranchPhoto[]>([])
  const [isLoadingModalPhotos, setIsLoadingModalPhotos] = useState(false)
  const [isUploadingModalPhoto, setIsUploadingModalPhoto] = useState(false)
  const modalGalleryInputRef = useRef<HTMLInputElement>(null)

  // Obtener sucursales
  const { data: branches = [], isLoading, error } = useQuery<Branch[]>({
    queryKey: ['dashboard', 'branches'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/branches/')
      // La API puede devolver un array o un objeto paginado con results
      if (Array.isArray(response.data)) {
        return response.data
      }
      if (response.data?.results && Array.isArray(response.data.results)) {
        return response.data.results
      }
      return []
    },
  })

  // Eliminar sucursal
  const deleteBranch = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/dashboard/branches/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    },
  })

  // Marcar como principal
  const setMainBranch = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiClient.post(`/dashboard/branches/${id}/set_main/`)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al marcar como principal'
      alert(message)
    },
  })

  const openModal = async (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch)
      setFormData({
        name: branch.name,
        address: branch.address || '',
        address_reference: branch.address_reference || '',
        district: branch.district || '',
        city: branch.city || 'Lima',
        latitude: branch.latitude,
        longitude: branch.longitude,
        phone: branch.phone || '',
        email: branch.email || '',
        opening_time: branch.opening_time || '09:00',
        closing_time: branch.closing_time || '19:00',
        is_active: branch.is_active,
        cover_image: null,
      })
      setImagePreview(branch.cover_image || null)
      // Limpiar el ref de imagen seleccionada (no hay nueva imagen)
      selectedImageFileRef.current = null
      // Si tiene coordenadas, mostrar el mapa
      if (branch.latitude && branch.longitude) {
        setMapCoords({ lat: branch.latitude, lng: branch.longitude })
      } else {
        setMapCoords(null)
      }
      // Cargar fotos de la galeria
      setIsLoadingModalPhotos(true)
      try {
        const response = await apiClient.get(`/dashboard/branches/${branch.id}/photos/`)
        setModalPhotos(response.data || [])
      } catch (error) {
        console.error('Error loading photos:', error)
        setModalPhotos([])
      } finally {
        setIsLoadingModalPhotos(false)
      }
    } else {
      setEditingBranch(null)
      setFormData({
        name: '',
        address: '',
        address_reference: '',
        district: '',
        city: 'Lima',
        latitude: null,
        longitude: null,
        phone: '',
        email: '',
        opening_time: '09:00',
        closing_time: '19:00',
        is_active: true,
        cover_image: null,
      })
      setImagePreview(null)
      setMapCoords(null)
      setModalPhotos([])
    }
    setErrors({})
    setCurrentStep(1)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingBranch(null)
    setErrors({})
    setCurrentStep(1)
    setImagePreview(null)
    setModalPhotos([])
    // Limpiar ref de imagen seleccionada
    selectedImageFileRef.current = null
  }

  // Funciones para manejo de fotos en el modal
  const handleModalAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingBranch) return

    setIsUploadingModalPhoto(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await apiClient.post(`/dashboard/branches/${editingBranch.id}/photos/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setModalPhotos([...modalPhotos, response.data])
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al subir la foto')
    } finally {
      setIsUploadingModalPhoto(false)
      if (modalGalleryInputRef.current) {
        modalGalleryInputRef.current.value = ''
      }
    }
  }

  const handleModalDeletePhoto = async (photoId: number) => {
    if (!editingBranch) return
    if (!confirm('¿Eliminar esta foto?')) return

    try {
      await apiClient.delete(`/dashboard/branches/${editingBranch.id}/photos/${photoId}/`)
      setModalPhotos(modalPhotos.filter(p => p.id !== photoId))
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al eliminar la foto')
    }
  }

  const handleModalSetCover = async (photoId: number) => {
    if (!editingBranch) return

    try {
      await apiClient.post(`/dashboard/branches/${editingBranch.id}/photos/${photoId}/set-cover/`)
      setModalPhotos(modalPhotos.map(p => ({
        ...p,
        is_cover: p.id === photoId
      })))
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al marcar como portada')
    }
  }

  // Validacion por paso
  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    if (step === 1) {
      if (!formData.name.trim()) newErrors.name = 'El nombre es requerido'
      if (!formData.phone.trim()) newErrors.phone = 'El telefono es requerido'
    } else if (step === 2) {
      if (!formData.address.trim()) newErrors.address = 'La direccion es requerida'
      if (!formData.city.trim()) newErrors.city = 'La ciudad es requerida'
      // Distrito es opcional - el usuario puede escribir cualquier valor o dejarlo vacio
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length))
    }
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  // Manejar imagen en el modal
  const handleModalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      console.log('[BranchModal] Nueva imagen seleccionada:', file.name, file.type, file.size, 'bytes')
      // Guardar el archivo File en el ref (mas estable que state)
      selectedImageFileRef.current = file
      // Tambien guardar en formData para compatibilidad
      setFormData(prev => ({ ...prev, cover_image: file }))
      // Generar preview base64
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        console.log('[BranchModal] Preview generado, longitud:', base64.length)
        setImagePreview(base64)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setFormData({ ...formData, cover_image: null })
    setImagePreview(null)
    // Limpiar el ref
    selectedImageFileRef.current = null
    if (modalImageInputRef.current) {
      modalImageInputRef.current.value = ''
    }
  }

  const [isGeocoding, setIsGeocoding] = useState(false)
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null)

  // Funcion para convertir base64 a File
  const base64ToFile = (base64String: string, filename: string): File | null => {
    try {
      // Verificar si es una URL del servidor (no base64)
      if (!base64String.startsWith('data:')) {
        return null
      }
      const arr = base64String.split(',')
      const mimeMatch = arr[0].match(/:(.*?);/)
      if (!mimeMatch) return null
      const mime = mimeMatch[1]
      const bstr = atob(arr[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      const extension = mime.split('/')[1] || 'jpg'
      return new File([u8arr], `${filename}.${extension}`, { type: mime })
    } catch (e) {
      console.error('Error converting base64 to file:', e)
      return null
    }
  }

  // Funcion para buscar ubicacion en el mapa
  const handleSearchLocation = async () => {
    if (!formData.address || !formData.city) {
      setErrors({ ...errors, address: 'Completa direccion y ciudad' })
      return
    }
    setIsGeocoding(true)
    const coords = await geocodeAddress(formData.address, formData.district, formData.city)
    setIsGeocoding(false)
    if (coords) {
      setMapCoords(coords)
      setFormData({ ...formData, latitude: coords.lat, longitude: coords.lng })
      setErrors({ ...errors, address: '' })
    } else {
      setErrors({ ...errors, address: 'No se pudo encontrar la ubicacion. Verifica la direccion.' })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validar ultimo paso
    if (!validateStep(currentStep)) return

    // Geocodificar direccion si no tenemos coordenadas
    let latitude = formData.latitude
    let longitude = formData.longitude

    if (!latitude || !longitude) {
      setIsGeocoding(true)
      const coords = await geocodeAddress(formData.address, formData.district, formData.city)
      setIsGeocoding(false)

      if (coords) {
        latitude = coords.lat
        longitude = coords.lng
      }
    }

    // Preparar datos para enviar
    const submitData = new FormData()
    submitData.append('name', formData.name)
    submitData.append('address', formData.address)
    submitData.append('address_reference', formData.address_reference)
    submitData.append('district', formData.district)
    submitData.append('city', formData.city)
    submitData.append('phone', formData.phone)
    submitData.append('email', formData.email)
    submitData.append('opening_time', formData.opening_time)
    submitData.append('closing_time', formData.closing_time)
    submitData.append('is_active', String(formData.is_active))
    if (latitude) submitData.append('latitude', String(latitude))
    if (longitude) submitData.append('longitude', String(longitude))

    // Manejar imagen de portada
    // PRIORIDAD: Usar el ref que es mas confiable que el state
    const fileToUpload = selectedImageFileRef.current || (formData.cover_image instanceof File ? formData.cover_image : null)

    console.log('[BranchSubmit] Estado de imagen:', {
      hasFileInRef: !!selectedImageFileRef.current,
      refFileName: selectedImageFileRef.current?.name,
      hasFileInFormData: formData.cover_image instanceof File,
      formDataFileName: formData.cover_image instanceof File ? formData.cover_image.name : null,
      imagePreview: imagePreview ? (imagePreview.startsWith('data:') ? 'base64' : 'url') : 'null'
    })

    // Caso 1: Si tenemos un archivo File (del ref o del formData)
    if (fileToUpload) {
      console.log('[BranchSubmit] Enviando cover_image desde File:', fileToUpload.name, fileToUpload.size, 'bytes')
      submitData.append('cover_image', fileToUpload)
    }
    // Caso 2: Si tenemos un preview en base64 pero no hay File (fallback)
    else if (imagePreview && imagePreview.startsWith('data:')) {
      console.log('[BranchSubmit] Convirtiendo base64 a File (fallback)...')
      const convertedFile = base64ToFile(imagePreview, `cover_${formData.name || 'branch'}`)
      if (convertedFile) {
        console.log('[BranchSubmit] File convertido:', convertedFile.name, convertedFile.size, 'bytes')
        submitData.append('cover_image', convertedFile)
      } else {
        console.error('[BranchSubmit] Error: No se pudo convertir base64 a File')
      }
    }
    // Caso 3: Si es edicion y el preview es una URL del servidor, no enviar nada (mantener imagen actual)
    else if (imagePreview && !imagePreview.startsWith('data:')) {
      console.log('[BranchSubmit] Manteniendo imagen existente del servidor:', imagePreview)
    }
    // Caso 4: No hay imagen
    else {
      console.log('[BranchSubmit] No hay imagen para enviar')
    }

    if (editingBranch) {
      // Para edicion, usar el mutate normal pero con FormData
      try {
        await apiClient.patch(`/dashboard/branches/${editingBranch.id}/`, submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
        closeModal()
      } catch (error: any) {
        const errorData = error.response?.data?.error
        const message = typeof errorData === 'string'
          ? errorData
          : errorData?.message || 'Error al actualizar sucursal'
        setErrors({ general: message })
      }
    } else {
      // Para creacion
      try {
        await apiClient.post('/dashboard/branches/', submitData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
        closeModal()
      } catch (error: any) {
        const errorData = error.response?.data?.error
        const message = typeof errorData === 'string'
          ? errorData
          : errorData?.message || 'Error al crear sucursal'
        setErrors({ general: message })
      }
    }
  }

  const handleDelete = (branch: Branch) => {
    if (confirm(`¿Estas seguro de eliminar la sucursal "${branch.name}"? Esta accion no se puede deshacer.`)) {
      deleteBranch.mutate(branch.id)
    }
  }

  const uploadCoverImage = async (branchId: number, file: File) => {
    setUploadingImage(branchId)
    try {
      const formData = new FormData()
      formData.append('cover_image', file)
      await apiClient.patch(`/dashboard/branches/${branchId}/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al subir la imagen')
    } finally {
      setUploadingImage(null)
    }
  }

  const handleImageChange = (branchId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadCoverImage(branchId, file)
    }
  }

  // Gallery functions - prefixed with _ to indicate they're defined but UI not yet implemented
  const _openGallery = async (branch: Branch) => {
    setGalleryBranch(branch)
    setIsGalleryOpen(true)
    setIsLoadingPhotos(true)
    try {
      const response = await apiClient.get(`/dashboard/branches/${branch.id}/photos/`)
      setGalleryPhotos(response.data || [])
    } catch (error) {
      console.error('Error loading photos:', error)
      setGalleryPhotos([])
    } finally {
      setIsLoadingPhotos(false)
    }
  }
  void _openGallery // TODO: wire up to UI

  const _closeGallery = () => {
    setIsGalleryOpen(false)
    setGalleryBranch(null)
    setGalleryPhotos([])
  }
  void _closeGallery // TODO: wire up to UI

  const _handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !galleryBranch) return

    setIsUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const response = await apiClient.post(`/dashboard/branches/${galleryBranch.id}/photos/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setGalleryPhotos([...galleryPhotos, response.data])
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al subir la foto')
    } finally {
      setIsUploadingPhoto(false)
      if (galleryInputRef.current) {
        galleryInputRef.current.value = ''
      }
    }
  }
  void _handleAddPhoto // TODO: wire up to UI

  const _handleDeletePhoto = async (photoId: number) => {
    if (!galleryBranch) return
    if (!confirm('¿Eliminar esta foto?')) return

    try {
      await apiClient.delete(`/dashboard/branches/${galleryBranch.id}/photos/${photoId}/`)
      setGalleryPhotos(galleryPhotos.filter(p => p.id !== photoId))
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al eliminar la foto')
    }
  }
  void _handleDeletePhoto // TODO: wire up to UI

  const _handleSetCover = async (photoId: number) => {
    if (!galleryBranch) return

    try {
      await apiClient.post(`/dashboard/branches/${galleryBranch.id}/photos/${photoId}/set-cover/`)
      setGalleryPhotos(galleryPhotos.map(p => ({
        ...p,
        is_cover: p.id === photoId
      })))
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'branches'] })
    } catch (error: any) {
      alert(error.response?.data?.error || 'Error al marcar como portada')
    }
  }
  void _handleSetCover // TODO: wire up to UI

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error al cargar las sucursales</p>
        <p className="text-gray-500 text-sm">Verifica que tengas permisos para acceder.</p>
      </div>
    )
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

  return (
    <div className="space-y-6">
      {/* Header con estilo Planity */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Sucursales</h1>
          <p className="text-gray-500 mt-1">Administra las ubicaciones de tu negocio</p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all hover:shadow-lg hover:shadow-primary-600/25 active:scale-[0.98]"
        >
          {Icons.plus}
          <span>Nueva Sucursal</span>
        </button>
      </div>

      {/* Stats resumen */}
      {branches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl font-bold text-gray-900">{branches.length}</div>
            <div className="text-sm text-gray-500">Sucursales</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl font-bold text-green-600">{branches.filter(b => b.is_active).length}</div>
            <div className="text-sm text-gray-500">Activas</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl font-bold text-gray-900">
              {Math.max(...branches.map(b => b.staff_count || 0), 0)}
            </div>
            <div className="text-sm text-gray-500">Max. profesionales</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-2xl font-bold text-gray-900">
              {Math.max(...branches.map(b => b.services_count || 0), 0)}
            </div>
            <div className="text-sm text-gray-500">Max. servicios</div>
          </div>
        </div>
      )}

      {/* Lista de sucursales estilo Planity */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-gray-200 border-t-primary-600"></div>
            <p className="text-sm text-gray-500">Cargando sucursales...</p>
          </div>
        </div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Sin sucursales</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            Crea tu primera sucursal para comenzar a recibir reservas de tus clientes.
          </p>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-xl font-medium hover:bg-primary-700 transition-all"
          >
            {Icons.plus}
            <span>Crear primera sucursal</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 hover:shadow-lg hover:shadow-gray-100/50 transition-all duration-300"
            >
              <div className="flex flex-col lg:flex-row">
                {/* Imagen */}
                <div
                  className="relative lg:w-72 h-48 lg:h-auto bg-gradient-to-br from-primary-500 to-primary-600 group cursor-pointer flex-shrink-0"
                  onClick={() => imageInputRefs.current[branch.id]?.click()}
                >
                  {branch.cover_image ? (
                    <img
                      src={branch.cover_image}
                      alt={branch.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="text-center text-white/80">
                        {Icons.camera}
                        <p className="text-xs mt-2 font-medium">Agregar foto</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    {uploadingImage === branch.id ? (
                      <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-white border-t-transparent" />
                    ) : (
                      <div className="text-center text-white">
                        {Icons.camera}
                        <p className="text-sm mt-2 font-medium">Cambiar foto</p>
                      </div>
                    )}
                  </div>
                  <input
                    ref={(el) => { imageInputRefs.current[branch.id] = el }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageChange(branch.id, e)}
                  />

                  {/* Badges sobre la imagen */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {branch.is_main && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white/95 text-primary-700 shadow-sm backdrop-blur-sm">
                        {Icons.star}
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="absolute top-3 right-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm backdrop-blur-sm ${
                        branch.is_active
                          ? 'bg-green-500/90 text-white'
                          : 'bg-gray-500/90 text-white'
                      }`}
                    >
                      {branch.is_active ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                </div>

                {/* Contenido */}
                <div className="flex-1 p-6">
                  <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">{branch.name}</h3>
                        <p className="text-sm text-gray-400">/{branch.slug}</p>
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-5">
                      {/* Ubicacion */}
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0 text-primary-600">
                          {Icons.location}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 font-medium truncate">
                            {branch.full_address || branch.address || 'Sin direccion'}
                          </p>
                          {branch.google_maps_url && (
                            <a
                              href={branch.google_maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 mt-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Ver en mapa
                              {Icons.externalLink}
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Telefono */}
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0 text-green-600">
                          {Icons.phone}
                        </div>
                        <div>
                          <p className="text-sm text-gray-900 font-medium">{branch.phone || 'Sin telefono'}</p>
                          {branch.email && <p className="text-xs text-gray-500">{branch.email}</p>}
                        </div>
                      </div>

                      {/* Horario */}
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0 text-amber-600">
                          {Icons.clock}
                        </div>
                        <div>
                          <p className="text-sm text-gray-900 font-medium">
                            {formatTime(branch.opening_time)} - {formatTime(branch.closing_time)}
                          </p>
                          <p className="text-xs text-gray-500">Horario de atencion</p>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 text-purple-600">
                          {Icons.users}
                        </div>
                        <div>
                          <p className="text-sm text-gray-900 font-medium">
                            {branch.staff_count || 0} profesionales
                          </p>
                          <p className="text-xs text-gray-500">{branch.services_count || 0} servicios</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-auto pt-4 border-t border-gray-100">
                      <button
                        onClick={() => openModal(branch)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        {Icons.edit}
                        Editar
                      </button>
                      {!branch.is_main && (
                        <button
                          onClick={() => setMainBranch.mutate(branch.id)}
                          disabled={setMainBranch.isPending}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-700 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors disabled:opacity-50"
                        >
                          {Icons.star}
                          {setMainBranch.isPending ? 'Marcando...' : 'Principal'}
                        </button>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={() => handleDelete(branch)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        {Icons.trash}
                        Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal con Wizard */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Header con titulo y boton cerrar */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary-50 to-white">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">
                  {editingBranch ? 'Editar Sucursal' : 'Nueva Sucursal'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {editingBranch ? 'Modifica los datos de tu sucursal' : 'Completa los datos para crear una nueva sucursal'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center justify-between">
                {STEPS.map((step, index) => (
                  <div key={step.id} className="flex items-center flex-1">
                    <button
                      type="button"
                      onClick={() => {
                        // Permitir ir a cualquier paso si estamos editando
                        // Para crear, solo permitir ir a pasos anteriores o al siguiente validado
                        if (editingBranch) {
                          setCurrentStep(step.id)
                        } else if (step.id < currentStep) {
                          setCurrentStep(step.id)
                        } else if (step.id === currentStep + 1 && validateStep(currentStep)) {
                          setCurrentStep(step.id)
                        }
                      }}
                      className="flex items-center gap-3 group"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 ${
                          currentStep > step.id
                            ? 'bg-green-500 text-white group-hover:bg-green-600'
                            : currentStep === step.id
                            ? 'bg-primary-600 text-white ring-4 ring-primary-100'
                            : editingBranch
                              ? 'bg-gray-200 text-gray-500 group-hover:bg-gray-300 cursor-pointer'
                              : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {currentStep > step.id ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.icon
                        )}
                      </div>
                      <span className={`text-sm font-medium hidden sm:block ${
                        currentStep >= step.id ? 'text-gray-900' : 'text-gray-400'
                      } ${editingBranch ? 'group-hover:text-primary-600' : ''}`}>
                        {step.title}
                      </span>
                    </button>
                    {index < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-4 transition-colors duration-300 ${
                        currentStep > step.id ? 'bg-green-500' : 'bg-gray-200'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
              <div className="p-6">
                {errors.general && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-3">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    {errors.general}
                  </div>
                )}

                {/* PASO 1: Informacion basica y Fotos */}
                {currentStep === 1 && (
                  <div className="space-y-6">
                    {/* Imagen de portada */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Imagen de portada
                      </label>
                      <div
                        onClick={() => modalImageInputRef.current?.click()}
                        className="relative h-40 rounded-xl border-2 border-dashed border-gray-300 hover:border-primary-400 transition-colors cursor-pointer overflow-hidden group"
                      >
                        {imagePreview ? (
                          <>
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                              <span className="text-white text-sm font-medium">Cambiar imagen</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeImage(); }}
                                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-gray-400 group-hover:text-primary-500 transition-colors">
                            <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium">Haz clic para subir una imagen</span>
                            <span className="text-xs mt-1">PNG, JPG hasta 5MB</span>
                          </div>
                        )}
                        <input
                          ref={modalImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleModalImageChange}
                        />
                      </div>
                    </div>

                    {/* Galeria de fotos - solo disponible al editar */}
                    {editingBranch && (
                      <div className="border-t border-gray-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">Galeria de fotos</h4>
                            <p className="text-xs text-gray-500 mt-0.5">Fotos adicionales que se muestran en la pagina de reservas</p>
                          </div>
                        </div>

                        {isLoadingModalPhotos ? (
                          <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-[3px] border-gray-200 border-t-indigo-600"></div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-4 gap-3">
                            {/* Boton agregar foto */}
                            <button
                              type="button"
                              onClick={() => modalGalleryInputRef.current?.click()}
                              disabled={isUploadingModalPhoto}
                              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 transition-colors flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-indigo-500 disabled:opacity-50"
                            >
                              {isUploadingModalPhoto ? (
                                <div className="animate-spin rounded-full h-6 w-6 border-[2px] border-gray-200 border-t-indigo-600" />
                              ) : (
                                <>
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                                  </svg>
                                  <span className="text-xs font-medium">Agregar</span>
                                </>
                              )}
                            </button>
                            <input
                              ref={modalGalleryInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleModalAddPhoto}
                            />

                            {/* Fotos existentes */}
                            {modalPhotos.map((photo) => (
                              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group">
                                <img
                                  src={photo.image}
                                  alt={photo.caption || 'Foto de sucursal'}
                                  className="w-full h-full object-cover"
                                />

                                {/* Badge portada */}
                                {photo.is_cover && (
                                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-indigo-600 text-white text-[10px] font-semibold rounded">
                                    Portada
                                  </div>
                                )}

                                {/* Overlay con acciones */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                                  {!photo.is_cover && (
                                    <button
                                      type="button"
                                      onClick={() => handleModalSetCover(photo.id)}
                                      className="px-2 py-1 bg-white text-gray-900 text-xs font-medium rounded hover:bg-indigo-50 transition-colors"
                                    >
                                      Portada
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleModalDeletePhoto(photo.id)}
                                    className="px-2 py-1 bg-red-500 text-white text-xs font-medium rounded hover:bg-red-600 transition-colors"
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* Estado vacio */}
                            {modalPhotos.length === 0 && (
                              <div className="col-span-3 py-4 text-center">
                                <p className="text-xs text-gray-400">Sin fotos adicionales</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nombre */}
                    <Input
                      label="Nombre de la sucursal *"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ej: Sucursal Miraflores"
                      error={errors.name}
                    />

                    {/* Contacto */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Telefono *"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+51 987 654 321"
                        error={errors.phone}
                      />
                      <Input
                        label="Email (opcional)"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="contacto@negocio.com"
                      />
                    </div>
                  </div>
                )}

                {/* PASO 2: Ubicacion */}
                {currentStep === 2 && (
                  <div className="space-y-5">
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <p className="text-sm text-blue-800 font-medium">Direccion de la sucursal</p>
                          <p className="text-xs text-blue-600 mt-0.5">Ingresa la direccion completa de tu sucursal. La ubicacion en el mapa se calculara automaticamente.</p>
                        </div>
                      </div>
                    </div>

                    {/* Ciudad y Distrito con autocompletado */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ciudad *
                        </label>
                        <input
                          type="text"
                          list="cities-list"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value, district: '' })}
                          placeholder="Escribe para buscar..."
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-gray-900"
                        />
                        <datalist id="cities-list">
                          {CITIES_PERU.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Distrito (opcional)
                        </label>
                        <input
                          type="text"
                          list="districts-list"
                          value={formData.district}
                          onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                          placeholder={DISTRICTS_BY_CITY[formData.city]?.length > 0 ? 'Escribe para buscar...' : 'Escribe el distrito si aplica'}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white text-gray-900"
                        />
                        <datalist id="districts-list">
                          {(DISTRICTS_BY_CITY[formData.city] || []).map((district) => (
                            <option key={district} value={district} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {/* Direccion */}
                    <Input
                      label="Direccion *"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Ej: Av. Larco 123"
                      error={errors.address}
                    />

                    {/* Boton buscar ubicacion y mapa */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleSearchLocation}
                          disabled={isGeocoding || !formData.address || !formData.city}
                          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                        >
                          {isGeocoding ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Buscando...
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                              </svg>
                              Buscar ubicacion
                            </>
                          )}
                        </button>
                        <span className="text-xs text-gray-500">
                          Completa direccion y ciudad para buscar
                        </span>
                      </div>

                      {/* Mapa de preview */}
                      {mapCoords && (
                        <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                          <StaticMap lat={mapCoords.lat} lng={mapCoords.lng} />
                          <div className="bg-white px-4 py-3 border-t border-gray-100">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-900">Ubicacion encontrada</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {[formData.address, formData.district, formData.city].filter(Boolean).join(', ')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-lg bg-green-100 text-green-700 text-xs font-medium">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                  Verificado
                                </span>
                                <a
                                  href={`https://www.google.com/maps?q=${mapCoords.lat},${mapCoords.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
                                >
                                  Ver en Google Maps
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Mensaje si no hay mapa */}
                      {!mapCoords && formData.address && formData.city && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-amber-800">Verifica la ubicacion</p>
                              <p className="text-xs text-amber-600 mt-0.5">
                                Presiona "Buscar ubicacion" para verificar que la direccion sea correcta en el mapa.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PASO 3: Horario y configuracion */}
                {currentStep === 3 && (
                  <div className="space-y-6">
                    {/* Horario */}
                    <div className="bg-gray-50 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Horario de atencion
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Hora de apertura
                          </label>
                          <input
                            type="time"
                            value={formData.opening_time}
                            onChange={(e) => setFormData({ ...formData, opening_time: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Hora de cierre
                          </label>
                          <input
                            type="time"
                            value={formData.closing_time}
                            onChange={(e) => setFormData({ ...formData, closing_time: e.target.value })}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Estado */}
                    <div className="bg-gray-50 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Configuracion
                      </h4>
                      <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 cursor-pointer hover:border-primary-300 transition-colors">
                        <div>
                          <span className="text-sm font-medium text-gray-900">Sucursal activa</span>
                          <p className="text-xs text-gray-500 mt-0.5">Los clientes podran ver y reservar en esta sucursal</p>
                        </div>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={formData.is_active}
                            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-100 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </div>
                      </label>
                    </div>

                    {/* Resumen */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                      <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Resumen de tu sucursal
                      </h4>
                      <div className="space-y-2 text-sm">
                        <p><span className="font-medium text-green-900">Nombre:</span> <span className="text-green-700">{formData.name || '-'}</span></p>
                        <p><span className="font-medium text-green-900">Direccion:</span> <span className="text-green-700">{formData.address || '-'}</span></p>
                        <p><span className="font-medium text-green-900">Horario:</span> <span className="text-green-700">{formData.opening_time} - {formData.closing_time}</span></p>
                        <p><span className="font-medium text-green-900">Estado:</span> <span className={formData.is_active ? 'text-green-700' : 'text-orange-600'}>{formData.is_active ? 'Activa' : 'Inactiva'}</span></p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer con botones de navegacion */}
              <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                <div>
                  {currentStep > 1 && (
                    <Button type="button" variant="secondary" onClick={prevStep}>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      Anterior
                    </Button>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={closeModal}>
                    Cancelar
                  </Button>
                  {currentStep < STEPS.length ? (
                    <Button type="button" onClick={nextStep}>
                      Siguiente
                      <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isGeocoding}>
                      {isGeocoding ? (
                        <>
                          <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Ubicando...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          {editingBranch ? 'Guardar cambios' : 'Crear sucursal'}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
