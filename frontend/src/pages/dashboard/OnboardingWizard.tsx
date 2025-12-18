import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  MapPin,
  Clock,
  User,
  Scissors,
  Check,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Store
} from 'lucide-react'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'

// ============== TYPES ==============
interface OnboardingData {
  // Step 1: Business
  business_name: string
  business_description: string
  business_category: string
  // Step 2: Branch
  branch_name: string
  branch_address: string
  branch_phone: string
  branch_email: string
  // Step 3: Schedule
  schedule: {
    [key: string]: { open: string; close: string; enabled: boolean }
  }
  // Step 4: First Professional (optional)
  add_self_as_staff: boolean
  staff_specialty: string
  // Step 5: First Service (optional)
  add_first_service: boolean
  service_name: string
  service_duration: number
  service_price: number
}

interface OnboardingStatus {
  needs_onboarding: boolean
  has_business: boolean
}

// ============== CONSTANTS ==============
const STEPS = [
  { id: 1, name: 'Negocio', icon: Building2, required: true },
  { id: 2, name: 'Ubicación', icon: MapPin, required: true },
  { id: 3, name: 'Horarios', icon: Clock, required: true },
  { id: 4, name: 'Profesional', icon: User, required: false },
  { id: 5, name: 'Servicio', icon: Scissors, required: false },
]

const DAYS = [
  { key: 'monday', label: 'Lunes' },
  { key: 'tuesday', label: 'Martes' },
  { key: 'wednesday', label: 'Miércoles' },
  { key: 'thursday', label: 'Jueves' },
  { key: 'friday', label: 'Viernes' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' },
]

const CATEGORIES = [
  { value: 'salon', label: 'Salón de belleza' },
  { value: 'barbershop', label: 'Barbería' },
  { value: 'spa', label: 'Spa' },
  { value: 'nails', label: 'Uñas' },
  { value: 'massage', label: 'Masajes' },
  { value: 'other', label: 'Otro' },
]

const DEFAULT_SCHEDULE = DAYS.reduce((acc, day) => {
  acc[day.key] = {
    open: '09:00',
    close: '19:00',
    enabled: day.key !== 'sunday',
  }
  return acc
}, {} as OnboardingData['schedule'])

const STORAGE_KEY = 'stylo_onboarding_draft'

// ============== COMPONENT ==============
export default function OnboardingWizard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [currentStep, setCurrentStep] = useState(1)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load saved draft or use defaults
  const [formData, setFormData] = useState<OnboardingData>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // Invalid JSON, use defaults
      }
    }
    return {
      business_name: '',
      business_description: '',
      business_category: 'salon',
      branch_name: 'Sucursal Principal',
      branch_address: '',
      branch_phone: '',
      branch_email: '',
      schedule: DEFAULT_SCHEDULE,
      add_self_as_staff: true,
      staff_specialty: '',
      add_first_service: true,
      service_name: '',
      service_duration: 60,
      service_price: 50,
    }
  })

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(formData))
  }, [formData])

  // Check if user needs onboarding
  const { data: onboardingStatus, isLoading: checkingStatus } = useQuery({
    queryKey: ['dashboard', 'onboarding-status'],
    queryFn: async () => {
      const response = await apiClient.get<OnboardingStatus>('/dashboard/onboarding')
      return response.data
    },
    enabled: user?.role === 'business_owner',
  })

  // Create business mutation
  const createBusiness = useMutation({
    mutationFn: async (data: OnboardingData) => {
      const response = await apiClient.post('/dashboard/onboarding/complete', data)
      return response.data
    },
    onSuccess: () => {
      localStorage.removeItem(STORAGE_KEY)
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('¡Tu negocio está listo!')
      navigate('/dashboard', { replace: true })
    },
    onError: (error: any) => {
      // El backend puede retornar error como string o como objeto {code, message, details}
      const errorData = error.response?.data?.error
      const message = typeof errorData === 'string'
        ? errorData
        : errorData?.message || 'Error al crear el negocio'
      toast.error(message)
      setErrors({ general: message })
    },
  })

  // ============== HANDLERS ==============
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleScheduleChange = (day: string, field: 'open' | 'close' | 'enabled', value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [day]: {
          ...prev.schedule[day],
          [field]: value
        }
      }
    }))
  }

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {}

    switch (step) {
      case 1:
        if (!formData.business_name.trim()) {
          newErrors.business_name = 'El nombre es requerido'
        }
        break
      case 2:
        if (!formData.branch_address.trim()) {
          newErrors.branch_address = 'La dirección es requerida'
        }
        if (!formData.branch_phone.trim()) {
          newErrors.branch_phone = 'El teléfono es requerido'
        }
        break
      case 3:
        const hasOpenDay = Object.values(formData.schedule).some(s => s.enabled)
        if (!hasOpenDay) {
          newErrors.schedule = 'Debes tener al menos un día abierto'
        }
        break
      case 4:
        // Optional step - no validation required
        break
      case 5:
        // Optional step - only validate if they want to add a service
        if (formData.add_first_service && !formData.service_name.trim()) {
          newErrors.service_name = 'El nombre del servicio es requerido'
        }
        break
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
        setCurrentStep(prev => prev + 1)
        window.scrollTo(0, 0)
      }
    }
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(1, prev - 1))
    window.scrollTo(0, 0)
  }

  const handleSkip = () => {
    // Skip optional steps
    if (!STEPS[currentStep - 1].required) {
      if (currentStep === 4) {
        setFormData(prev => ({ ...prev, add_self_as_staff: false }))
      } else if (currentStep === 5) {
        setFormData(prev => ({ ...prev, add_first_service: false }))
      }
      handleNext()
    }
  }

  const handleSubmit = () => {
    if (validateStep(currentStep)) {
      createBusiness.mutate(formData)
    }
  }

  // ============== REDIRECTS ==============
  if (onboardingStatus?.has_business) {
    return <Navigate to="/dashboard" replace />
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white">Cargando...</p>
        </div>
      </div>
    )
  }

  // ============== RENDER ==============
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-900">
      {/* Header with progress */}
      <div className="bg-white/10 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          {/* Logo and title */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-secondary-500 rounded-xl flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Configura tu negocio</h1>
              <p className="text-sm text-white/60">Solo tomará unos minutos</p>
            </div>
          </div>

          {/* Progress steps */}
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon
              const isCompleted = currentStep > step.id
              const isCurrent = currentStep === step.id
              const isOptional = !step.required

              return (
                <div key={step.id} className="flex items-center">
                  {/* Step circle */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-secondary-500 text-white ring-4 ring-secondary-500/30'
                          : 'bg-white/20 text-white/50'
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 hidden sm:block ${
                        isCurrent ? 'text-white font-medium' : 'text-white/50'
                      }`}
                    >
                      {step.name}
                      {isOptional && <span className="text-white/30"> (opcional)</span>}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-8 sm:w-16 h-0.5 mx-1 sm:mx-2 ${
                        currentStep > step.id ? 'bg-green-500' : 'bg-white/20'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {/* Step content */}
          <div className="p-6 sm:p-8">
            {errors.general && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {errors.general}
              </div>
            )}

            {/* Step 1: Business Info */}
            {currentStep === 1 && (
              <StepBusiness
                formData={formData}
                errors={errors}
                onChange={handleChange}
              />
            )}

            {/* Step 2: Branch/Location */}
            {currentStep === 2 && (
              <StepBranch
                formData={formData}
                errors={errors}
                onChange={handleChange}
              />
            )}

            {/* Step 3: Schedule */}
            {currentStep === 3 && (
              <StepSchedule
                formData={formData}
                errors={errors}
                onScheduleChange={handleScheduleChange}
              />
            )}

            {/* Step 4: Professional */}
            {currentStep === 4 && (
              <StepProfessional
                formData={formData}
                onChange={handleChange}
              />
            )}

            {/* Step 5: Service */}
            {currentStep === 5 && (
              <StepService
                formData={formData}
                errors={errors}
                onChange={handleChange}
              />
            )}
          </div>

          {/* Footer with buttons */}
          <div className="px-6 sm:px-8 py-4 bg-gray-50 border-t flex items-center justify-between">
            <div>
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleBack}
                  className="gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Atrás
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Skip button for optional steps */}
              {!STEPS[currentStep - 1].required && currentStep < STEPS.length && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkip}
                  className="text-gray-500"
                >
                  Omitir
                </Button>
              )}

              {/* Next / Submit button */}
              {currentStep < STEPS.length ? (
                <Button type="button" onClick={handleNext} className="gap-2">
                  Continuar
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={createBusiness.isPending}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {createBusiness.isPending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Finalizar
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-white/50 text-sm mt-6">
          Podrás modificar toda esta información después en Configuración
        </p>
      </div>
    </div>
  )
}

// ============== STEP COMPONENTS ==============

interface StepProps {
  formData: OnboardingData
  errors: Record<string, string>
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
}

function StepBusiness({ formData, errors, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Store className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¿Cómo se llama tu negocio?</h2>
        <p className="text-gray-500 mt-2">Este nombre aparecerá en tu página de reservas</p>
      </div>

      <Input
        label="Nombre del negocio *"
        name="business_name"
        value={formData.business_name}
        onChange={onChange}
        placeholder="Ej: Salón María, Barbería Style..."
        error={errors.business_name}
        autoFocus
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Tipo de negocio
        </label>
        <select
          name="business_category"
          value={formData.business_category}
          onChange={onChange}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
        >
          {CATEGORIES.map(cat => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Descripción <span className="text-gray-400">(opcional)</span>
        </label>
        <textarea
          name="business_description"
          value={formData.business_description}
          onChange={onChange}
          placeholder="Cuéntale a tus clientes qué hace especial a tu negocio..."
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          rows={3}
        />
      </div>
    </div>
  )
}

function StepBranch({ formData, errors, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¿Dónde te encuentras?</h2>
        <p className="text-gray-500 mt-2">Agrega la ubicación de tu local principal</p>
      </div>

      <Input
        label="Nombre de la sucursal"
        name="branch_name"
        value={formData.branch_name}
        onChange={onChange}
        placeholder="Ej: Sucursal Miraflores"
      />

      <Input
        label="Dirección *"
        name="branch_address"
        value={formData.branch_address}
        onChange={onChange}
        placeholder="Ej: Av. Larco 123, Miraflores"
        error={errors.branch_address}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Teléfono / WhatsApp *"
          name="branch_phone"
          value={formData.branch_phone}
          onChange={onChange}
          placeholder="+51 987 654 321"
          error={errors.branch_phone}
        />
        <Input
          label="Email"
          name="branch_email"
          type="email"
          value={formData.branch_email}
          onChange={onChange}
          placeholder="contacto@tunegocio.com"
        />
      </div>
    </div>
  )
}

interface StepScheduleProps {
  formData: OnboardingData
  errors: Record<string, string>
  onScheduleChange: (day: string, field: 'open' | 'close' | 'enabled', value: string | boolean) => void
}

function StepSchedule({ formData, errors, onScheduleChange }: StepScheduleProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-orange-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¿Cuándo atiendes?</h2>
        <p className="text-gray-500 mt-2">Define tu horario de atención</p>
      </div>

      {errors.schedule && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {errors.schedule}
        </div>
      )}

      <div className="space-y-3">
        {DAYS.map(day => {
          const daySchedule = formData.schedule[day.key]
          return (
            <div
              key={day.key}
              className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
                daySchedule.enabled ? 'bg-gray-50' : 'bg-gray-100/50'
              }`}
            >
              {/* Toggle */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={daySchedule.enabled}
                  onChange={(e) => onScheduleChange(day.key, 'enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
              </label>

              {/* Day name */}
              <span className={`w-24 font-medium ${daySchedule.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                {day.label}
              </span>

              {/* Time inputs */}
              {daySchedule.enabled ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="time"
                    value={daySchedule.open}
                    onChange={(e) => onScheduleChange(day.key, 'open', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="text-gray-400">a</span>
                  <input
                    type="time"
                    value={daySchedule.close}
                    onChange={(e) => onScheduleChange(day.key, 'close', e.target.value)}
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              ) : (
                <span className="text-gray-400 text-sm">Cerrado</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface StepProfessionalProps {
  formData: OnboardingData
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void
}

function StepProfessional({ formData, onChange }: StepProfessionalProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <User className="w-8 h-8 text-purple-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¿Quién atiende?</h2>
        <p className="text-gray-500 mt-2">Agrega tu primer profesional</p>
      </div>

      {/* Option to add self */}
      <div
        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
          formData.add_self_as_staff
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onChange({ target: { name: 'add_self_as_staff', type: 'checkbox', checked: !formData.add_self_as_staff } } as any)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            formData.add_self_as_staff ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
          }`}>
            <User className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">
              Agregarme como profesional
            </p>
            <p className="text-sm text-gray-500">Empezar a recibir citas directamente</p>
          </div>
          <input
            type="checkbox"
            name="add_self_as_staff"
            checked={formData.add_self_as_staff}
            onChange={onChange}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </div>
      </div>

      {formData.add_self_as_staff && (
        <Input
          label="Especialidad"
          name="staff_specialty"
          value={formData.staff_specialty}
          onChange={onChange}
          placeholder="Ej: Estilista, Barbero, Manicurista..."
        />
      )}

      <div className="bg-blue-50 rounded-xl p-4">
        <p className="text-sm text-blue-700">
          <strong>Tip:</strong> Podrás agregar más profesionales después en la sección "Equipo"
        </p>
      </div>
    </div>
  )
}

function StepService({ formData, errors, onChange }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Scissors className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">¿Qué servicios ofreces?</h2>
        <p className="text-gray-500 mt-2">Agrega tu primer servicio</p>
      </div>

      {/* Toggle to add service */}
      <div
        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
          formData.add_first_service
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-200 hover:border-gray-300'
        }`}
        onClick={() => onChange({ target: { name: 'add_first_service', type: 'checkbox', checked: !formData.add_first_service } } as any)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
            formData.add_first_service ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-400'
          }`}>
            <Scissors className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Agregar un servicio ahora</p>
            <p className="text-sm text-gray-500">Tu primer servicio para empezar a recibir reservas</p>
          </div>
          <input
            type="checkbox"
            name="add_first_service"
            checked={formData.add_first_service}
            onChange={onChange}
            className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500"
          />
        </div>
      </div>

      {formData.add_first_service && (
        <>
          <Input
            label="Nombre del servicio *"
            name="service_name"
            value={formData.service_name}
            onChange={onChange}
            placeholder="Ej: Corte de cabello, Manicure..."
            error={errors.service_name}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duración (minutos)
              </label>
              <select
                name="service_duration"
                value={formData.service_duration}
                onChange={onChange}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hora</option>
                <option value={90}>1h 30min</option>
                <option value={120}>2 horas</option>
              </select>
            </div>

            <Input
              label="Precio (S/)"
              name="service_price"
              type="number"
              value={formData.service_price.toString()}
              onChange={onChange}
              placeholder="50"
            />
          </div>
        </>
      )}

      <div className="bg-green-50 rounded-xl p-4">
        <p className="text-sm text-green-700">
          <strong>Casi listo!</strong> Después de esto tu negocio estará configurado y listo para recibir reservas.
        </p>
      </div>
    </div>
  )
}
