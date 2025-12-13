import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'

interface BranchInfo {
  id: number
  name: string
}

interface Staff {
  id: number
  first_name: string
  last_name: string
  last_name_materno: string
  phone_number: string
  document_type: string
  document_number: string
  photo: string | null
  specialty: string
  branch_ids: number[]
  branches_info: BranchInfo[]
  is_active: boolean
  calendar_color: string
  services_count: number
  services_count_by_branch: Record<number, number>
  appointments_today: number
  services?: number[]
  is_available: boolean
  availability_status: {
    available: boolean
    missing: string[]
    message: string
  }
  has_schedule: boolean
  trial_days_remaining: number | null
  is_billable: boolean
}

interface LookupResult {
  found: boolean
  staff?: {
    id: number
    first_name: string
    last_name_paterno: string
    last_name_materno: string
    phone_number: string
    specialty: string
    branch_ids: number[]
    branches_info: BranchInfo[]
    is_active: boolean
  }
}

interface DNILookupResult {
  found: boolean
  first_name?: string
  last_name_paterno?: string
  last_name_materno?: string
  photo_base64?: string
  birth_date?: string
  gender?: string
  error?: string
}

interface StaffFormData {
  document_type: string
  document_number: string
  first_name: string
  last_name: string
  last_name_materno: string
  phone_number: string
  specialty: string
  bio: string
  branch_ids: number[]
  is_active: boolean
  calendar_color: string
}

interface AvailableBranchService {
  id: number
  service_id: number
  name: string
  category_name: string | null
  duration_minutes: number
  price: number
  gender: 'M' | 'F' | 'U'
  branch_id?: number
  branch_name?: string
}

interface StaffServicesData {
  available_services: AvailableBranchService[]
  assigned_service_ids: number[]
}

interface DaySchedule {
  id?: number
  day_of_week: number
  day_name: string
  start_time: string
  end_time: string
  is_working: boolean
}

// Datos de sucursal para el modal unificado
interface BranchTabData {
  branchId: number
  branchName: string
  services: AvailableBranchService[]
  selectedServiceIds: number[]
  schedule: DaySchedule[]
  isLoadingServices: boolean
  isLoadingSchedule: boolean
}

type ModalMode = 'lookup' | 'create' | 'edit' | 'add_existing'

// Tab type for edit modal
type EditTab = 'profile' | 'branch'

export default function StaffManagement() {
  const queryClient = useQueryClient()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ModalMode>('lookup')
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)
  const [foundStaff, setFoundStaff] = useState<LookupResult['staff'] | null>(null)
  const [lookupData, setLookupData] = useState({
    document_type: 'dni',
    document_number: '',
  })
  const [formData, setFormData] = useState<StaffFormData>({
    document_type: 'dni',
    document_number: '',
    first_name: '',
    last_name: '',
    last_name_materno: '',
    phone_number: '',
    specialty: '',
    bio: '',
    branch_ids: [],
    is_active: true,
    calendar_color: '#3B82F6',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLookingUp, setIsLookingUp] = useState(false)

  // Para el modal de edicion con tabs por sucursal
  const [activeBranchTab, setActiveBranchTab] = useState<number | null>(null)
  const [branchTabsData, setBranchTabsData] = useState<Record<number, BranchTabData>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Para el tab de perfil vs sucursales en modo edit
  const [activeEditTab, setActiveEditTab] = useState<EditTab>('profile')
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // DNI lookup states for create mode
  const [isDNILookingUp, setIsDNILookingUp] = useState(false)
  const [dniPhotoBase64, setDniPhotoBase64] = useState<string | null>(null)

  // Legacy states for create mode
  const [selectedServices, setSelectedServices] = useState<number[]>([])
  const [availableServices, setAvailableServices] = useState<AvailableBranchService[]>([])
  const [isLoadingServices, setIsLoadingServices] = useState(false)

  // Obtener sucursales
  const { data: branches = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['dashboard', 'branches'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/branches/')
      if (Array.isArray(response.data)) return response.data
      if (response.data?.results) return response.data.results
      return []
    },
  })

  // Obtener staff
  const { data: staffList = [], isLoading, error } = useQuery<Staff[]>({
    queryKey: ['dashboard', 'staff'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/staff/')
      if (Array.isArray(response.data)) return response.data
      if (response.data?.results) return response.data.results
      return []
    },
  })

  // Agrupar staff por sucursal (un profesional puede estar en multiples sucursales)
  const staffByBranch = useMemo(() => {
    const grouped: Record<string, { branchName: string; branchId: number | null; staff: Staff[] }> = {}

    // Primero agregar "Sin sucursal asignada"
    grouped['unassigned'] = { branchName: 'Sin sucursal asignada', branchId: null, staff: [] }

    // Crear grupos para cada sucursal
    branches.forEach(branch => {
      grouped[`branch_${branch.id}`] = { branchName: branch.name, branchId: branch.id, staff: [] }
    })

    // Distribuir staff en los grupos (puede aparecer en multiples sucursales)
    staffList.forEach(staff => {
      if (staff.branch_ids && staff.branch_ids.length > 0) {
        staff.branch_ids.forEach(branchId => {
          const key = `branch_${branchId}`
          if (grouped[key]) {
            grouped[key].staff.push(staff)
          }
        })
      } else {
        grouped['unassigned'].staff.push(staff)
      }
    })

    // Filtrar grupos vacios (excepto sin asignar si hay staff sin sucursal)
    return Object.entries(grouped)
      .filter(([key, group]) => group.staff.length > 0 || key !== 'unassigned')
      .sort((a, b) => {
        // "Sin sucursal" al final
        if (a[0] === 'unassigned') return 1
        if (b[0] === 'unassigned') return -1
        return a[1].branchName.localeCompare(b[1].branchName)
      })
  }, [staffList, branches])

  // Crear staff (con soporte para foto)
  const createStaff = useMutation({
    mutationFn: async ({ data, photo }: { data: StaffFormData; photo?: File | null }) => {
      if (photo) {
        // Si hay foto, usar FormData
        const formData = new FormData()
        formData.append('document_type', data.document_type)
        formData.append('document_number', data.document_number)
        formData.append('first_name', data.first_name)
        formData.append('last_name', data.last_name)
        if (data.last_name_materno) formData.append('last_name_materno', data.last_name_materno)
        if (data.phone_number) formData.append('phone_number', data.phone_number)
        if (data.specialty) formData.append('specialty', data.specialty)
        if (data.bio) formData.append('bio', data.bio)
        formData.append('is_active', String(data.is_active))
        data.branch_ids.forEach(id => formData.append('branch_ids', String(id)))
        formData.append('photo', photo)

        const response = await apiClient.post('/dashboard/staff/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
        return response.data
      } else {
        // Sin foto, enviar JSON normal
        const response = await apiClient.post('/dashboard/staff/', data)
        return response.data
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
      closeModal()
    },
    onError: (error: any) => {
      const errorData = error.response?.data
      if (errorData?.document_number) {
        setErrors({ document_number: errorData.document_number })
      } else {
        const message = typeof errorData?.error === 'string'
          ? errorData.error
          : errorData?.error?.message || 'Error al crear profesional'
        setErrors({ general: message })
      }
    },
  })

  // Actualizar staff
  const updateStaff = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<StaffFormData> }) => {
      const response = await apiClient.patch(`/dashboard/staff/${id}/`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
      closeModal()
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al actualizar profesional'
      setErrors({ general: message })
    },
  })

  // Actualizar perfil con foto (FormData)
  const updateStaffProfile = useMutation({
    mutationFn: async ({ id, formData: profileFormData }: { id: number; formData: FormData }) => {
      const response = await apiClient.patch(`/dashboard/staff/${id}/`, profileFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
      closeModal()
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al actualizar perfil'
      setErrors({ general: message })
    },
  })

  // Agregar staff existente a sucursal
  const addToBranch = useMutation({
    mutationFn: async (data: { staff_id: number; branch_id: number }) => {
      const response = await apiClient.post('/dashboard/staff/add-to-branch/', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
      closeModal()
    },
    onError: (error: any) => {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al agregar profesional'
      setErrors({ general: message })
    },
  })

  // Eliminar staff
  const deleteStaff = useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/dashboard/staff/${id}/`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
    },
  })

  // Actualizar servicios del staff
  const updateStaffServices = useMutation({
    mutationFn: async ({ staffId, branchServiceIds }: { staffId: number; branchServiceIds: number[] }) => {
      const response = await apiClient.put(`/dashboard/staff/${staffId}/services/`, {
        branch_service_ids: branchServiceIds,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
    },
  })

  // Cargar datos de una sucursal para el tab (servicios + horarios)
  const loadBranchTabData = async (staffId: number, branchId: number, branchName: string) => {
    // Marcar como cargando
    setBranchTabsData(prev => ({
      ...prev,
      [branchId]: {
        ...prev[branchId],
        branchId,
        branchName,
        services: prev[branchId]?.services || [],
        selectedServiceIds: prev[branchId]?.selectedServiceIds || [],
        schedule: prev[branchId]?.schedule || [],
        isLoadingServices: true,
        isLoadingSchedule: true,
      }
    }))

    // Cargar servicios y horarios en paralelo
    const [servicesResult, scheduleResult] = await Promise.allSettled([
      apiClient.get<StaffServicesData>(`/dashboard/staff/${staffId}/services/`, { params: { branch_id: branchId } }),
      apiClient.get(`/dashboard/staff/${staffId}/schedule/`, { params: { branch_id: branchId } })
    ])

    const days = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
    const defaultSchedule = days.map((name, i) => ({
      day_of_week: i,
      day_name: name,
      start_time: '09:00',
      end_time: '18:00',
      is_working: false
    }))

    setBranchTabsData(prev => ({
      ...prev,
      [branchId]: {
        branchId,
        branchName,
        services: servicesResult.status === 'fulfilled' ? servicesResult.value.data.available_services : [],
        selectedServiceIds: servicesResult.status === 'fulfilled' ? servicesResult.value.data.assigned_service_ids : [],
        schedule: scheduleResult.status === 'fulfilled' ? (scheduleResult.value.data.schedules || defaultSchedule) : defaultSchedule,
        isLoadingServices: false,
        isLoadingSchedule: false,
      }
    }))
  }

  // Cargar servicios de una sucursal (modo create)
  const loadBranchServices = async (branchId: number) => {
    if (!branchId) {
      setAvailableServices([])
      setSelectedServices([])
      return
    }

    setIsLoadingServices(true)
    try {
      const response = await apiClient.get(`/dashboard/services/`, {
        params: { branch_id: branchId }
      })
      const services = Array.isArray(response.data) ? response.data : response.data.results || []

      const formattedServices: AvailableBranchService[] = services.map((s: any) => ({
        id: s.id,
        service_id: s.id,
        name: s.name,
        category_name: s.category_name || null,
        duration_minutes: s.duration_minutes,
        price: s.price,
        gender: s.gender
      }))

      setAvailableServices(formattedServices)
      setSelectedServices([])
    } catch (error) {
      console.error('Error loading branch services:', error)
      setAvailableServices([])
      setSelectedServices([])
    } finally {
      setIsLoadingServices(false)
    }
  }

  // DNI lookup for auto-fill form
  const handleDNILookup = async (dni: string) => {
    // Only lookup for DNI type with 8 digits
    if (lookupData.document_type !== 'dni' || dni.replace(/\D/g, '').length !== 8) {
      return
    }

    setIsDNILookingUp(true)
    try {
      const response = await apiClient.post<DNILookupResult>('/dashboard/staff/lookup-dni/', { dni })
      const result = response.data

      if (result.found) {
        // Auto-fill form data
        setFormData(prev => ({
          ...prev,
          first_name: result.first_name || prev.first_name,
          last_name: result.last_name_paterno || prev.last_name,
          last_name_materno: result.last_name_materno || prev.last_name_materno,
        }))

        // Store photo base64 if available and convert to File
        if (result.photo_base64) {
          setDniPhotoBase64(result.photo_base64)
          // Convert base64 to File for upload
          try {
            const base64Data = result.photo_base64.replace(/^data:image\/\w+;base64,/, '')
            const byteCharacters = atob(base64Data)
            const byteNumbers = new Array(byteCharacters.length)
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i)
            }
            const byteArray = new Uint8Array(byteNumbers)
            const blob = new Blob([byteArray], { type: 'image/jpeg' })
            const file = new File([blob], `dni_photo_${dni}.jpg`, { type: 'image/jpeg' })
            setSelectedPhoto(file)
            setPhotoPreview(result.photo_base64)
          } catch (e) {
            console.error('Error converting base64 to File:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error looking up DNI:', error)
    } finally {
      setIsDNILookingUp(false)
    }
  }

  const handleLookup = async () => {
    if (!lookupData.document_number.trim()) {
      setErrors({ document_number: 'Ingresa el numero de documento' })
      return
    }

    setIsLookingUp(true)
    setErrors({})

    try {
      const response = await apiClient.post('/dashboard/staff/lookup/', lookupData)
      const result: LookupResult = response.data

      if (result.found && result.staff) {
        setFoundStaff(result.staff)
        setModalMode('add_existing')
        setFormData({
          ...formData,
          branch_ids: branches.length > 0 ? [branches[0].id] : [],
        })
      } else {
        setModalMode('create')
        // Preserve auto-filled data from DNI lookup
        setFormData(prev => ({
          ...prev,
          document_type: lookupData.document_type,
          document_number: lookupData.document_number,
          // Keep the auto-filled names if they exist, otherwise use empty strings
          first_name: prev.first_name || '',
          last_name: prev.last_name || '',
          last_name_materno: prev.last_name_materno || '',
          phone_number: prev.phone_number || '',
          specialty: prev.specialty || '',
          bio: prev.bio || '',
          branch_ids: branches.length > 0 ? [branches[0].id] : [],
          is_active: true,
        }))
      }
    } catch (error: any) {
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al buscar profesional'
      setErrors({ general: message })
    } finally {
      setIsLookingUp(false)
    }
  }

  const openModal = (staff?: Staff, branchId?: number | null) => {
    if (staff) {
      setEditingStaff(staff)
      setModalMode('edit')
      setFormData({
        document_type: staff.document_type || 'dni',
        document_number: staff.document_number || '',
        first_name: staff.first_name,
        last_name: staff.last_name || '',
        last_name_materno: staff.last_name_materno || '',
        phone_number: staff.phone_number || '',
        specialty: staff.specialty || '',
        bio: '',
        branch_ids: staff.branch_ids || [],
        is_active: staff.is_active,
        calendar_color: staff.calendar_color || '#3B82F6',
      })
      // Inicializar tab de perfil como activo por defecto
      setActiveEditTab('profile')
      setSelectedPhoto(null)
      setPhotoPreview(staff.photo || null)
      // Inicializar tabs de sucursales
      setBranchTabsData({})
      const staffBranches = staff.branches_info || []
      // Si branchId del contexto, activar ese tab primero
      const initialBranchId = branchId ?? (staffBranches.length > 0 ? staffBranches[0].id : null)
      setActiveBranchTab(initialBranchId)
      // Cargar datos del tab activo (solo si vamos a la seccion de sucursales)
      if (initialBranchId) {
        const branchName = staffBranches.find(b => b.id === initialBranchId)?.name || ''
        loadBranchTabData(staff.id, initialBranchId, branchName)
      }
    } else {
      setEditingStaff(null)
      setFoundStaff(null)
      setModalMode('lookup')
      setLookupData({
        document_type: 'dni',
        document_number: '',
      })
      setFormData({
        document_type: 'dni',
        document_number: '',
        first_name: '',
        last_name: '',
        last_name_materno: '',
        phone_number: '',
        specialty: '',
        bio: '',
        branch_ids: branches.length > 0 ? [branches[0].id] : [],
        is_active: true,
        calendar_color: '#3B82F6',
      })
      setAvailableServices([])
      setSelectedServices([])
      setBranchTabsData({})
      setActiveBranchTab(null)
      // Reset DNI lookup states
      setDniPhotoBase64(null)
      setIsDNILookingUp(false)
    }
    setErrors({})
    setIsModalOpen(true)
  }

  // Handler para cambiar de tab de sucursal en el modal de edicion
  const handleBranchTabChange = (branchId: number) => {
    if (!editingStaff) return
    setActiveBranchTab(branchId)
    // Si no tenemos datos cargados para este tab, cargarlos
    if (!branchTabsData[branchId]) {
      const branchName = editingStaff.branches_info?.find(b => b.id === branchId)?.name || ''
      loadBranchTabData(editingStaff.id, branchId, branchName)
    }
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingStaff(null)
    setFoundStaff(null)
    setModalMode('lookup')
    setErrors({})
    setAvailableServices([])
    setSelectedServices([])
    setBranchTabsData({})
    setActiveBranchTab(null)
    setIsSaving(false)
    setActiveEditTab('profile')
    setSelectedPhoto(null)
    setPhotoPreview(null)
    // Reset DNI lookup states
    setDniPhotoBase64(null)
    setIsDNILookingUp(false)
  }

  // Toggle servicio en el tab de sucursal activo
  const toggleBranchService = (serviceId: number) => {
    if (!activeBranchTab) return
    setBranchTabsData(prev => {
      const tabData = prev[activeBranchTab]
      if (!tabData) return prev
      const isSelected = tabData.selectedServiceIds.includes(serviceId)
      return {
        ...prev,
        [activeBranchTab]: {
          ...tabData,
          selectedServiceIds: isSelected
            ? tabData.selectedServiceIds.filter(id => id !== serviceId)
            : [...tabData.selectedServiceIds, serviceId]
        }
      }
    })
  }

  // Toggle dia de horario en el tab de sucursal activo
  const toggleBranchScheduleDay = (dayOfWeek: number) => {
    if (!activeBranchTab) return
    setBranchTabsData(prev => {
      const tabData = prev[activeBranchTab]
      if (!tabData) return prev
      return {
        ...prev,
        [activeBranchTab]: {
          ...tabData,
          schedule: tabData.schedule.map(day =>
            day.day_of_week === dayOfWeek ? { ...day, is_working: !day.is_working } : day
          )
        }
      }
    })
  }

  // Actualizar hora de horario en el tab de sucursal activo
  const updateBranchScheduleTime = (dayOfWeek: number, field: 'start_time' | 'end_time', value: string) => {
    if (!activeBranchTab) return
    setBranchTabsData(prev => {
      const tabData = prev[activeBranchTab]
      if (!tabData) return prev
      return {
        ...prev,
        [activeBranchTab]: {
          ...tabData,
          schedule: tabData.schedule.map(day =>
            day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
          )
        }
      }
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (modalMode === 'add_existing' && foundStaff) {
      if (formData.branch_ids.length === 0) {
        setErrors({ branch_ids: 'Selecciona al menos una sucursal' })
        return
      }
      addToBranch.mutate({
        staff_id: foundStaff.id,
        branch_id: formData.branch_ids[0],
      })
      return
    }

    const newErrors: Record<string, string> = {}
    if (modalMode === 'create') {
      if (!formData.document_type) newErrors.document_type = 'Selecciona el tipo de documento'
      if (!formData.document_number.trim()) newErrors.document_number = 'El documento es requerido'
    }
    if (!formData.first_name.trim()) newErrors.first_name = 'El nombre es requerido'
    if (formData.branch_ids.length === 0) newErrors.branch_ids = 'Selecciona al menos una sucursal'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    if (editingStaff) {
      // Solo actualizar datos basicos del profesional
      updateStaff.mutate({ id: editingStaff.id, data: formData })
    } else {
      // Crear nuevo staff - pasar foto como File si existe
      createStaff.mutate({ data: formData, photo: selectedPhoto }, {
        onSuccess: (newStaff: Staff) => {
          if (selectedServices.length > 0 && newStaff?.id) {
            updateStaffServices.mutate({
              staffId: newStaff.id,
              branchServiceIds: selectedServices,
            })
          }
        },
      })
    }
  }

  // Guardar horarios y servicios de la sucursal activa
  const handleSaveBranchData = async () => {
    if (!editingStaff || !activeBranchTab) return

    const tabData = branchTabsData[activeBranchTab]
    if (!tabData) return

    setIsSaving(true)
    setErrors({})

    try {
      // Guardar servicios y horarios en paralelo
      await Promise.all([
        apiClient.put(`/dashboard/staff/${editingStaff.id}/services/`, {
          branch_service_ids: tabData.selectedServiceIds,
          branch_id: activeBranchTab,
        }),
        apiClient.put(`/dashboard/staff/${editingStaff.id}/schedule/`, {
          branch_id: activeBranchTab,
          schedules: tabData.schedule,
        })
      ])

      queryClient.invalidateQueries({ queryKey: ['dashboard', 'staff'] })
      closeModal()
    } catch (error: any) {
      const message = error.response?.data?.error || 'Error al guardar'
      setErrors({ general: message })
    } finally {
      setIsSaving(false)
    }
  }

  const toggleService = (serviceId: number) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    )
  }

  const handleDelete = (staff: Staff) => {
    if (confirm(`¿Estas seguro de eliminar a "${staff.first_name} ${staff.last_name}"?`)) {
      deleteStaff.mutate(staff.id)
    }
  }

  // Manejar seleccion de foto
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        setErrors({ photo: 'Solo se permiten imagenes' })
        return
      }
      // Validar tamaño (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors({ photo: 'La imagen no debe superar 5MB' })
        return
      }
      setSelectedPhoto(file)
      setPhotoPreview(URL.createObjectURL(file))
      setErrors({})
    }
  }

  // Guardar perfil del profesional
  const handleSaveProfile = async () => {
    if (!editingStaff) return

    setIsSaving(true)
    setErrors({})

    const profileFormData = new FormData()
    profileFormData.append('first_name', formData.first_name)
    profileFormData.append('last_name', formData.last_name)
    profileFormData.append('last_name_materno', formData.last_name_materno)
    profileFormData.append('phone_number', formData.phone_number)
    profileFormData.append('specialty', formData.specialty)
    profileFormData.append('is_active', String(formData.is_active))
    profileFormData.append('calendar_color', formData.calendar_color)

    if (selectedPhoto) {
      profileFormData.append('photo', selectedPhoto)
    }

    updateStaffProfile.mutate(
      { id: editingStaff.id, formData: profileFormData },
      {
        onSuccess: () => {
          setIsSaving(false)
          closeModal()
        },
        onError: () => {
          setIsSaving(false)
        },
      }
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error al cargar el equipo</p>
        <p className="text-gray-500 text-sm">Verifica que tengas permisos para acceder.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Equipo de Trabajo</h2>
          <p className="text-sm text-gray-500">Gestiona los profesionales de tu negocio</p>
        </div>
        <Button onClick={() => openModal()}>+ Nuevo Profesional</Button>
      </div>

      {/* Lista de profesionales agrupados por sucursal */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : staffList.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">👥</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay profesionales</h3>
          <p className="text-gray-500 mb-4">Agrega profesionales para que puedan recibir citas</p>
          <Button onClick={() => openModal()}>Agregar primer profesional</Button>
        </div>
      ) : (
        <div className="space-y-8">
          {staffByBranch.map(([key, group]) => (
            <div key={key}>
              {/* Header de sucursal */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${key === 'unassigned' ? 'bg-amber-400' : 'bg-primary-500'}`}></div>
                <h3 className="text-md font-semibold text-gray-800">{group.branchName}</h3>
                <span className="text-sm text-gray-500">({group.staff.length} profesionales)</span>
              </div>

              {group.staff.length === 0 ? (
                <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500 text-center">
                  No hay profesionales asignados a esta sucursal
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.staff.map((staff) => (
                    <div
                      key={staff.id}
                      className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 text-xl font-semibold flex-shrink-0">
                          {staff.photo ? (
                            <img
                              src={staff.photo}
                              alt={staff.first_name}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            staff.first_name.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: staff.calendar_color || '#3B82F6' }}
                                  title="Color del calendario"
                                />
                                <h3 className="font-medium text-gray-900 truncate">
                                  {staff.first_name} {staff.last_name}
                                </h3>
                              </div>
                              <p className="text-sm text-gray-500">{staff.specialty || 'Sin especialidad'}</p>
                            </div>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                                staff.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {staff.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>

                          {/* Badge de trial */}
                          {staff.trial_days_remaining !== null && !staff.is_billable && (
                            <div className={`mt-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              staff.trial_days_remaining <= 3
                                ? 'bg-orange-100 text-orange-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {staff.trial_days_remaining <= 0
                                ? 'Trial vencido'
                                : `${staff.trial_days_remaining} dias de trial`}
                            </div>
                          )}

                          {/* Estado de disponibilidad */}
                          {!staff.is_available && staff.availability_status && (
                            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                              {staff.availability_status.message}
                            </div>
                          )}

                          <div className="flex gap-4 mt-3 text-sm">
                            <div>
                              <span className="text-gray-500">Servicios:</span>{' '}
                              <span className="font-medium">
                                {group.branchId && staff.services_count_by_branch
                                  ? (staff.services_count_by_branch[group.branchId] || 0)
                                  : staff.services_count}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Citas hoy:</span>{' '}
                              <span className="font-medium">{staff.appointments_today}</span>
                            </div>
                          </div>

                          <div className="flex gap-2 mt-4">
                            <button
                              onClick={() => openModal(staff, group.branchId)}
                              className="text-sm text-primary-600 hover:text-primary-900"
                            >
                              Gestionar
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              onClick={() => handleDelete(staff)}
                              className="text-sm text-red-600 hover:text-red-900"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalMode === 'lookup' && 'Buscar Profesional'}
                  {modalMode === 'create' && 'Nuevo Profesional'}
                  {modalMode === 'edit' && `${editingStaff?.first_name} ${editingStaff?.last_name}`}
                  {modalMode === 'add_existing' && 'Agregar Profesional'}
                </h3>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {modalMode === 'lookup' && (
                <p className="text-sm text-gray-500 mt-1">
                  Ingresa el documento para verificar si ya existe
                </p>
              )}

              {/* Tabs principales para modo edit: Perfil | Sucursales */}
              {modalMode === 'edit' && editingStaff && (
                <div className="flex gap-1 mt-4 -mb-6 -mx-6 px-6 overflow-x-auto pb-0 border-b border-gray-200">
                  <button
                    onClick={() => setActiveEditTab('profile')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                      activeEditTab === 'profile'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Perfil
                  </button>
                  {editingStaff.branches_info && editingStaff.branches_info.length > 0 && (
                    editingStaff.branches_info.map((branch) => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setActiveEditTab('branch')
                          handleBranchTabChange(branch.id)
                        }}
                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                          activeEditTab === 'branch' && activeBranchTab === branch.id
                            ? 'border-primary-600 text-primary-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        {branch.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Lookup Form */}
            {modalMode === 'lookup' && (
              <div className="p-6 space-y-4">
                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {errors.general}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de documento
                  </label>
                  <select
                    value={lookupData.document_type}
                    onChange={(e) => {
                      setLookupData({ ...lookupData, document_type: e.target.value })
                      // Reset DNI data when changing document type
                      setDniPhotoBase64(null)
                      setFormData(prev => ({
                        ...prev,
                        first_name: '',
                        last_name: '',
                        last_name_materno: '',
                      }))
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="dni">DNI</option>
                    <option value="ce">Carnet de Extranjeria</option>
                    <option value="pasaporte">Pasaporte</option>
                  </select>
                </div>

                <div className="relative">
                  <Input
                    label="Numero de documento"
                    value={lookupData.document_number}
                    onChange={(e) => {
                      const value = e.target.value
                      setLookupData({ ...lookupData, document_number: value })
                      // Trigger DNI lookup when 8 digits are entered
                      if (lookupData.document_type === 'dni' && value.replace(/\D/g, '').length === 8) {
                        handleDNILookup(value)
                      }
                    }}
                    placeholder="12345678"
                    error={errors.document_number}
                  />
                  {isDNILookingUp && (
                    <div className="absolute right-3 top-8 flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      <span className="text-xs text-gray-500">Consultando RENIEC...</span>
                    </div>
                  )}
                </div>

                {/* DNI Preview when data is found */}
                {dniPhotoBase64 && lookupData.document_type === 'dni' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-4">
                    <div className="w-16 h-20 rounded overflow-hidden border border-green-200 flex-shrink-0">
                      <img
                        src={`data:image/jpeg;base64,${dniPhotoBase64}`}
                        alt="Foto DNI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-sm text-green-800">
                      <p className="font-medium">Datos obtenidos de RENIEC</p>
                      <p>Los campos se llenaran automaticamente al crear el profesional</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="secondary" onClick={closeModal}>
                    Cancelar
                  </Button>
                  <Button onClick={handleLookup} disabled={isLookingUp}>
                    {isLookingUp ? 'Buscando...' : 'Buscar'}
                  </Button>
                </div>
              </div>
            )}

            {/* Add Existing Staff Form */}
            {modalMode === 'add_existing' && foundStaff && (
              <div className="p-6 space-y-4">
                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {errors.general}
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 font-medium mb-2">
                    Profesional encontrado
                  </p>
                  <div className="text-sm text-blue-700">
                    <p><strong>Nombre:</strong> {foundStaff.first_name} {foundStaff.last_name_paterno} {foundStaff.last_name_materno}</p>
                    {foundStaff.phone_number && (
                      <p><strong>Telefono:</strong> {foundStaff.phone_number}</p>
                    )}
                    <p><strong>Especialidad:</strong> {foundStaff.specialty || 'Sin especialidad'}</p>
                    {foundStaff.branches_info && foundStaff.branches_info.length > 0 && (
                      <p><strong>Sucursales actuales:</strong> {foundStaff.branches_info.map(b => b.name).join(', ')}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Agregar a sucursal
                  </label>
                  <select
                    value={formData.branch_ids[0] || ''}
                    onChange={(e) => setFormData({ ...formData, branch_ids: e.target.value ? [Number(e.target.value)] : [] })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Selecciona sucursal</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  {errors.branch_ids && <p className="text-red-500 text-xs mt-1">{errors.branch_ids}</p>}
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setModalMode('lookup')}>
                    Volver
                  </Button>
                  <Button onClick={handleSubmit} disabled={addToBranch.isPending}>
                    {addToBranch.isPending ? 'Agregando...' : 'Agregar a sucursal'}
                  </Button>
                </div>
              </div>
            )}

            {/* Create Form */}
            {modalMode === 'create' && (
              <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
                {errors.general && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {errors.general}
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                  <strong>Documento:</strong> {formData.document_type.toUpperCase()} - {formData.document_number}
                </div>

                {/* DNI Photo Preview in create mode */}
                {dniPhotoBase64 && formData.document_type === 'dni' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-4">
                    <div className="w-16 h-20 rounded overflow-hidden border border-green-200 flex-shrink-0">
                      <img
                        src={`data:image/jpeg;base64,${dniPhotoBase64}`}
                        alt="Foto DNI"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="text-sm text-green-800">
                      <p className="font-medium">Datos obtenidos de RENIEC</p>
                      <p>Nombre: {formData.first_name}</p>
                      <p>Apellidos: {formData.last_name} {formData.last_name_materno}</p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sucursales</label>
                  <div className="space-y-2">
                    {branches.map((branch) => (
                      <label key={branch.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.branch_ids.includes(branch.id)}
                          onChange={(e) => {
                            const newBranchIds = e.target.checked
                              ? [...formData.branch_ids, branch.id]
                              : formData.branch_ids.filter(id => id !== branch.id)
                            setFormData({ ...formData, branch_ids: newBranchIds })
                            if (e.target.checked) loadBranchServices(branch.id)
                          }}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">{branch.name}</span>
                      </label>
                    ))}
                  </div>
                  {errors.branch_ids && <p className="text-red-500 text-xs mt-1">{errors.branch_ids}</p>}
                </div>

                <Input label="Nombres" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} placeholder="Juan Carlos" error={errors.first_name} />
                <div className="grid grid-cols-2 gap-4">
                  <Input label="Apellido paterno" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} placeholder="Perez" />
                  <Input label="Apellido materno" value={formData.last_name_materno} onChange={(e) => setFormData({ ...formData, last_name_materno: e.target.value })} placeholder="Garcia" />
                </div>
                <Input label="Telefono" value={formData.phone_number} onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })} placeholder="+51 987 654 321" />
                <Input label="Especialidad" value={formData.specialty} onChange={(e) => setFormData({ ...formData, specialty: e.target.value })} placeholder="Ej: Corte, Colorista, Barbero" />

                {isLoadingServices && (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3 flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                    Cargando servicios...
                  </div>
                )}

                {!isLoadingServices && availableServices.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Servicios que ofrece</label>
                    <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                      {availableServices.map((service) => (
                        <label key={service.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                          <input type="checkbox" checked={selectedServices.includes(service.id)} onChange={() => toggleService(service.id)} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                          <span className="text-sm text-gray-900 flex-1">{service.name}</span>
                          <span className="text-xs text-gray-500">{service.duration_minutes}min - S/{service.price}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500" />
                  <span className="text-sm text-gray-700">Profesional activo</span>
                </label>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="secondary" onClick={() => setModalMode('lookup')}>Volver</Button>
                  <Button type="submit" disabled={createStaff.isPending}>{createStaff.isPending ? 'Guardando...' : 'Crear profesional'}</Button>
                </div>
              </form>
            )}

            {/* Edit Form - Contenido por tab (Perfil o Sucursal) */}
            {modalMode === 'edit' && editingStaff && (
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Messages */}
                {errors.general && (
                  <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {errors.general}
                  </div>
                )}
                {errors.success && (
                  <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                    {errors.success}
                  </div>
                )}
                {errors.photo && (
                  <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    {errors.photo}
                  </div>
                )}

                {/* Tab Perfil - Formulario de edicion */}
                {activeEditTab === 'profile' && (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Foto de perfil */}
                    <div className="flex items-center gap-6">
                      <div className="relative">
                        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden border-2 border-gray-200">
                          {photoPreview ? (
                            <img
                              src={photoPreview}
                              alt={editingStaff.first_name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-3xl font-semibold text-gray-400">
                              {editingStaff.first_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <label
                          htmlFor="photo-upload"
                          className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-700 transition-colors"
                        >
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </label>
                        <input
                          id="photo-upload"
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoChange}
                          className="hidden"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-700">Foto de perfil</p>
                        <p className="text-xs text-gray-500">JPG, PNG o GIF. Max 5MB</p>
                        {selectedPhoto && (
                          <p className="text-xs text-primary-600 mt-1">Nueva foto seleccionada</p>
                        )}
                      </div>
                    </div>

                    {/* Campos del perfil */}
                    <div className="space-y-4">
                      <Input
                        label="Nombres"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        placeholder="Juan Carlos"
                      />

                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="Apellido paterno"
                          value={formData.last_name}
                          onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                          placeholder="Perez"
                        />
                        <Input
                          label="Apellido materno"
                          value={formData.last_name_materno}
                          onChange={(e) => setFormData({ ...formData, last_name_materno: e.target.value })}
                          placeholder="Garcia"
                        />
                      </div>

                      <Input
                        label="Telefono"
                        value={formData.phone_number}
                        onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                        placeholder="+51 987 654 321"
                      />

                      <Input
                        label="Especialidad"
                        value={formData.specialty}
                        onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                        placeholder="Ej: Corte, Colorista, Barbero"
                      />

                      {/* Color del calendario */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Color en el calendario
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={formData.calendar_color}
                            onChange={(e) => setFormData({ ...formData, calendar_color: e.target.value })}
                            className="w-12 h-10 rounded cursor-pointer border border-gray-200"
                          />
                          <div
                            className="flex-1 h-10 rounded-lg flex items-center px-4 text-white text-sm font-medium"
                            style={{ backgroundColor: formData.calendar_color }}
                          >
                            Vista previa del color
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Este color se usara para identificar las citas de este profesional en el calendario
                        </p>
                      </div>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                          className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Profesional activo</span>
                      </label>
                    </div>

                    {/* Info de documento (solo lectura) */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-xs text-gray-500 mb-1">Documento de identidad</p>
                      <p className="text-sm font-medium text-gray-900">
                        {editingStaff.document_type?.toUpperCase() || 'DNI'} - {editingStaff.document_number || 'Sin documento'}
                      </p>
                    </div>

                    {/* Boton guardar perfil */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button type="button" variant="secondary" onClick={closeModal}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSaveProfile} disabled={isSaving || updateStaffProfile.isPending}>
                        {isSaving || updateStaffProfile.isPending ? 'Guardando...' : 'Guardar perfil'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Tab Sucursal - Contenido por sucursal (horarios y servicios) */}
                {activeEditTab === 'branch' && activeBranchTab && branchTabsData[activeBranchTab] ? (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Horarios */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Horario de trabajo</h4>
                      {branchTabsData[activeBranchTab].isLoadingSchedule ? (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {branchTabsData[activeBranchTab].schedule.map((day) => (
                            <div key={day.day_of_week} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                              <label className="flex items-center gap-2 w-24 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={day.is_working}
                                  onChange={() => toggleBranchScheduleDay(day.day_of_week)}
                                  className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                                />
                                <span className={`text-sm ${day.is_working ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                                  {day.day_name}
                                </span>
                              </label>
                              {day.is_working ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <select
                                    value={day.start_time}
                                    onChange={(e) => updateBranchScheduleTime(day.day_of_week, 'start_time', e.target.value)}
                                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                                  >
                                    {Array.from({ length: 48 }, (_, i) => {
                                      const hour = Math.floor(i / 2).toString().padStart(2, '0')
                                      const min = i % 2 === 0 ? '00' : '30'
                                      return <option key={i} value={`${hour}:${min}`}>{`${hour}:${min}`}</option>
                                    })}
                                  </select>
                                  <span className="text-gray-400">a</span>
                                  <select
                                    value={day.end_time}
                                    onChange={(e) => updateBranchScheduleTime(day.day_of_week, 'end_time', e.target.value)}
                                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                                  >
                                    {Array.from({ length: 48 }, (_, i) => {
                                      const hour = Math.floor(i / 2).toString().padStart(2, '0')
                                      const min = i % 2 === 0 ? '00' : '30'
                                      return <option key={i} value={`${hour}:${min}`}>{`${hour}:${min}`}</option>
                                    })}
                                  </select>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400 italic">Descansa</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Servicios */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Servicios que ofrece</h4>
                      {branchTabsData[activeBranchTab].isLoadingServices ? (
                        <div className="flex justify-center py-4">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                        </div>
                      ) : branchTabsData[activeBranchTab].services.length > 0 ? (
                        <div className="border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                          {branchTabsData[activeBranchTab].services.map((service) => (
                            <label key={service.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0">
                              <input
                                type="checkbox"
                                checked={branchTabsData[activeBranchTab].selectedServiceIds.includes(service.id)}
                                onChange={() => toggleBranchService(service.id)}
                                className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-900 flex-1">{service.name}</span>
                              <span className="text-xs text-gray-500">{service.duration_minutes}min - S/{service.price}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                          No hay servicios en esta sucursal
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {branchTabsData[activeBranchTab].selectedServiceIds.length} servicios seleccionados
                      </p>
                    </div>

                    {/* Boton guardar */}
                    <div className="flex justify-end gap-3 pt-4 border-t">
                      <Button type="button" variant="secondary" onClick={closeModal}>Cancelar</Button>
                      <Button onClick={handleSaveBranchData} disabled={isSaving}>
                        {isSaving ? 'Guardando...' : 'Guardar cambios'}
                      </Button>
                    </div>
                  </div>
                ) : activeBranchTab && branchTabsData[activeBranchTab] === undefined ? (
                  <div className="flex-1 flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
                      <p className="text-sm text-gray-500">Cargando datos de la sucursal...</p>
                    </div>
                  </div>
                ) : !activeBranchTab ? (
                  <div className="p-6 text-center text-gray-500">
                    <p>Este profesional no tiene sucursales asignadas.</p>
                    <p className="text-sm mt-2">Asigna sucursales al profesional primero.</p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
