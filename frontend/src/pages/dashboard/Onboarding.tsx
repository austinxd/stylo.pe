import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { Button, Input } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'

interface OnboardingData {
  business_name: string
  business_description: string
  branch_name: string
  branch_address: string
  branch_phone: string
  branch_email: string
  primary_color: string
  secondary_color: string
}

interface OnboardingStatus {
  needs_onboarding: boolean
  has_business: boolean
}

export default function Onboarding() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState<OnboardingData>({
    business_name: '',
    business_description: '',
    branch_name: 'Sucursal Principal',
    branch_address: '',
    branch_phone: '',
    branch_email: '',
    primary_color: '#1a1a2e',
    secondary_color: '#c9a227',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Verificar si el usuario necesita onboarding
  const { data: onboardingStatus, isLoading: checkingStatus } = useQuery({
    queryKey: ['dashboard', 'onboarding-status'],
    queryFn: async () => {
      const response = await apiClient.get<OnboardingStatus>('/dashboard/onboarding')
      return response.data
    },
    enabled: user?.role === 'business_owner',
  })

  const createBusiness = useMutation({
    mutationFn: async (data: OnboardingData) => {
      const response = await apiClient.post('/dashboard/onboarding', data)
      return response.data
    },
    onSuccess: () => {
      // Invalidar todos los queries del dashboard para que recarguen
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      navigate('/dashboard', { replace: true })
    },
    onError: (error: any) => {
      setErrors({ general: error.response?.data?.error || 'Error al crear el negocio' })
    },
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const validateStep1 = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.business_name.trim()) {
      newErrors.business_name = 'El nombre del negocio es requerido'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const validateStep2 = () => {
    const newErrors: Record<string, string> = {}
    if (!formData.branch_name.trim()) {
      newErrors.branch_name = 'El nombre de la sucursal es requerido'
    }
    if (!formData.branch_address.trim()) {
      newErrors.branch_address = 'La direccion es requerida'
    }
    if (!formData.branch_phone.trim()) {
      newErrors.branch_phone = 'El telefono es requerido'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) {
      setStep(2)
    } else if (step === 2 && validateStep2()) {
      setStep(3)
    }
  }

  const handleBack = () => {
    setStep(prev => Math.max(1, prev - 1))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createBusiness.mutate(formData)
  }

  // Si ya tiene negocio, redirigir al dashboard
  if (onboardingStatus?.has_business) {
    return <Navigate to="/dashboard" replace />
  }

  // Mostrar loading mientras verifica
  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">Verificando estado...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary-900 text-white p-6">
          <h1 className="text-2xl font-bold">Configura tu negocio</h1>
          <p className="text-primary-200 mt-1">
            Paso {step} de 3
          </p>
          {/* Progress bar */}
          <div className="flex gap-2 mt-4">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 flex-1 rounded-full transition-colors ${
                  s <= step ? 'bg-secondary-500' : 'bg-primary-700'
                }`}
              />
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {errors.general && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {errors.general}
            </div>
          )}

          {/* Step 1: Datos del negocio */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Informacion del negocio
              </h2>

              <Input
                label="Nombre del negocio"
                name="business_name"
                value={formData.business_name}
                onChange={handleChange}
                placeholder="Ej: Salon de Belleza Maria"
                error={errors.business_name}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripcion (opcional)
                </label>
                <textarea
                  name="business_description"
                  value={formData.business_description}
                  onChange={handleChange}
                  placeholder="Describe brevemente tu negocio..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color principal
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      name="primary_color"
                      value={formData.primary_color}
                      onChange={handleChange}
                      className="w-12 h-12 rounded-lg cursor-pointer"
                    />
                    <span className="text-sm text-gray-500">{formData.primary_color}</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Color secundario
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      name="secondary_color"
                      value={formData.secondary_color}
                      onChange={handleChange}
                      className="w-12 h-12 rounded-lg cursor-pointer"
                    />
                    <span className="text-sm text-gray-500">{formData.secondary_color}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Datos de la sucursal */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Informacion de la sucursal principal
              </h2>

              <Input
                label="Nombre de la sucursal"
                name="branch_name"
                value={formData.branch_name}
                onChange={handleChange}
                placeholder="Ej: Sucursal Miraflores"
                error={errors.branch_name}
              />

              <Input
                label="Direccion"
                name="branch_address"
                value={formData.branch_address}
                onChange={handleChange}
                placeholder="Ej: Av. Larco 123, Miraflores"
                error={errors.branch_address}
              />

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Telefono"
                  name="branch_phone"
                  value={formData.branch_phone}
                  onChange={handleChange}
                  placeholder="+51 987 654 321"
                  error={errors.branch_phone}
                />
                <Input
                  label="Email (opcional)"
                  name="branch_email"
                  type="email"
                  value={formData.branch_email}
                  onChange={handleChange}
                  placeholder="contacto@negocio.com"
                />
              </div>
            </div>
          )}

          {/* Step 3: Confirmacion */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Confirma los datos
              </h2>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Negocio</p>
                  <p className="font-medium text-gray-900">{formData.business_name}</p>
                  {formData.business_description && (
                    <p className="text-sm text-gray-600">{formData.business_description}</p>
                  )}
                </div>

                <hr className="border-gray-200" />

                <div>
                  <p className="text-sm text-gray-500">Sucursal</p>
                  <p className="font-medium text-gray-900">{formData.branch_name}</p>
                  <p className="text-sm text-gray-600">{formData.branch_address}</p>
                  <p className="text-sm text-gray-600">{formData.branch_phone}</p>
                  {formData.branch_email && (
                    <p className="text-sm text-gray-600">{formData.branch_email}</p>
                  )}
                </div>

                <hr className="border-gray-200" />

                <div>
                  <p className="text-sm text-gray-500">Colores de marca</p>
                  <div className="flex gap-2 mt-1">
                    <div
                      className="w-8 h-8 rounded-lg"
                      style={{ backgroundColor: formData.primary_color }}
                    />
                    <div
                      className="w-8 h-8 rounded-lg"
                      style={{ backgroundColor: formData.secondary_color }}
                    />
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-500 text-center">
                Podras modificar estos datos posteriormente en la configuracion.
              </p>
            </div>
          )}

          {/* Botones */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <Button type="button" variant="secondary" onClick={handleBack}>
                Atras
              </Button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <Button type="button" onClick={handleNext}>
                Continuar
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={createBusiness.isPending}
              >
                {createBusiness.isPending ? 'Creando...' : 'Crear negocio'}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
