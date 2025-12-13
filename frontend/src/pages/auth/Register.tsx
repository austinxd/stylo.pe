import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { Logo, Button, Input } from '@/components/ui'
import authApi from '@/api/auth'
import type { AccountType, RegisterFormData, RegisterCompleteData } from '@/types'

type Step = 'phone' | 'account_type' | 'data' | 'otp' | 'success'

export default function Register() {
  const navigate = useNavigate()

  // Estados
  const [step, setStep] = useState<Step>('phone')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [accountType, setAccountType] = useState<AccountType | null>(null)
  const [formData, setFormData] = useState<RegisterFormData | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [, setRegistrationToken] = useState('')
  const [error, setError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<RegisterFormData>()

  // Mutation: Verificar si el telefono existe (sin enviar OTP)
  // @ts-expect-error - unused but kept for reference
  const _checkPhone = useMutation({
    mutationFn: async (phone: string) => {
      // Usamos el endpoint de start pero solo para verificar
      // El backend deberia tener un endpoint de check, pero usamos verify con codigo falso
      // para detectar si existe o no
      try {
        const response = await authApi.verifyOTP(phone, '000000')
        return response
      } catch {
        // Si da error, el telefono no tiene sesion activa (nuevo usuario potencial)
        return { is_registered: false, needs_registration: true }
      }
    },
    onSuccess: (data) => {
      if (data.is_registered) {
        // Usuario ya existe - redirigir a login
        setError('Este número ya está registrado. Por favor inicia sesión.')
      } else {
        // Usuario nuevo - mostrar seleccion de tipo de cuenta
        setStep('account_type')
        setError('')
      }
    },
    onError: () => {
      // Error de red u otro - asumir que es nuevo usuario
      setStep('account_type')
      setError('')
    },
  })

  // Mutation: Enviar OTP
  const sendOtp = useMutation({
    mutationFn: (phone: string) => authApi.startWhatsApp(phone),
    onSuccess: () => {
      setStep('otp')
      setError('')
    },
    onError: () => {
      setError('Error al enviar el código. Verifica el número e intenta nuevamente.')
    },
  })

  // Mutation: Verificar OTP
  const verifyOtp = useMutation({
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      authApi.verifyOTP(phone, code),
    onSuccess: (data) => {
      if (data.registration_token) {
        setRegistrationToken(data.registration_token)
        // Completar registro automaticamente
        if (formData) {
          completeRegistration.mutate({
            ...formData,
            registration_token: data.registration_token,
          })
        }
      } else if (data.is_registered) {
        // Usuario ya existe (no deberia pasar en este flujo)
        setError('Este número ya está registrado. Por favor inicia sesión.')
      }
    },
    onError: () => {
      setError('Código incorrecto o expirado.')
    },
  })

  // Mutation: Completar registro
  const completeRegistration = useMutation({
    mutationFn: (data: RegisterCompleteData) => authApi.completeRegistration(data),
    onSuccess: () => {
      setStep('success')
      setError('')
    },
    onError: () => {
      setError('Error al completar el registro.')
    },
  })

  // Handlers
  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!phoneNumber || phoneNumber.length < 9) {
      setError('Ingresa un número de teléfono válido')
      return
    }

    // Formatear numero si no tiene codigo de pais
    let formattedPhone = phoneNumber
    if (!phoneNumber.startsWith('+')) {
      formattedPhone = '+51' + phoneNumber
    }
    setPhoneNumber(formattedPhone)

    // Por ahora, ir directo a seleccion de tipo (sin verificar)
    // porque el endpoint de verify necesita una sesion OTP activa
    setStep('account_type')
    setError('')
  }

  const handleSelectAccountType = (type: AccountType) => {
    setAccountType(type)
    // Pre-llenar el telefono en el formulario
    setValue('phone_number', phoneNumber)
    setStep('data')
  }

  const handleDataSubmit = (data: RegisterFormData) => {
    data.account_type = accountType!
    data.phone_number = phoneNumber // Asegurar que use el telefono original
    setFormData(data)
    // Ahora si enviamos el OTP
    sendOtp.mutate(phoneNumber)
  }

  const handleVerifyOtp = () => {
    if (otpCode.length !== 6 || !formData) return
    verifyOtp.mutate({ phone: phoneNumber, code: otpCode })
  }

  const handleResendOtp = () => {
    sendOtp.mutate(phoneNumber)
    setOtpCode('')
    setError('')
  }

  // Calcular progreso
  const getProgress = () => {
    const steps = ['phone', 'account_type', 'data', 'otp']
    const currentIndex = steps.indexOf(step)
    return ((currentIndex + 1) / steps.length) * 100
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-neutral-100">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/">
            <Logo size="sm" />
          </Link>
          <Link to="/auth/login" className="text-sm text-primary-900 hover:underline">
            Ya tengo cuenta
          </Link>
        </div>
      </header>

      {/* Progress bar */}
      {step !== 'success' && (
        <div className="bg-white border-b border-neutral-100">
          <div className="max-w-md mx-auto">
            <div className="h-1 bg-neutral-100">
              <div
                className="h-full bg-primary-900 transition-all duration-300"
                style={{ width: `${getProgress()}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {/* Error */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Step: Ingresar telefono */}
          {step === 'phone' && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <h1 className="text-2xl font-light text-primary-900 mb-2 text-center">
                Crear cuenta
              </h1>
              <p className="text-neutral-600 text-center mb-8">
                Ingresa tu número de WhatsApp para comenzar
              </p>

              <form onSubmit={handlePhoneSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Número de WhatsApp
                  </label>
                  <Input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+51987654321"
                    autoFocus
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Formato internacional con código de país
                  </p>
                </div>

                <Button type="submit" className="w-full">
                  Continuar
                </Button>
              </form>

              <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-amber-800 text-sm text-center">
                  <strong>Nota:</strong> Este registro es exclusivo para dueños de negocio y profesionales.
                  Los clientes no necesitan cuenta para reservar.
                </p>
              </div>
            </div>
          )}

          {/* Step: Seleccionar tipo de cuenta */}
          {step === 'account_type' && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <button
                onClick={() => setStep('phone')}
                className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
              >
                ← Cambiar número
              </button>

              <h1 className="text-2xl font-light text-primary-900 mb-2 text-center">
                Tipo de cuenta
              </h1>
              <p className="text-neutral-600 text-center mb-2">
                Registrando: <strong>{phoneNumber}</strong>
              </p>
              <p className="text-neutral-500 text-sm text-center mb-8">
                Selecciona el tipo de cuenta que deseas crear
              </p>

              <div className="space-y-4">
                <button
                  onClick={() => handleSelectAccountType('business_owner')}
                  className="w-full p-6 border-2 border-neutral-200 rounded-xl hover:border-primary-900 hover:bg-primary-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center text-2xl group-hover:bg-primary-200 transition-colors">
                      🏢
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary-900 mb-1">
                        Dueño de negocio
                      </h3>
                      <p className="text-sm text-neutral-600">
                        Quiero registrar mi salón, barbería o spa para recibir reservas
                      </p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectAccountType('staff')}
                  className="w-full p-6 border-2 border-neutral-200 rounded-xl hover:border-primary-900 hover:bg-primary-50 transition-all text-left group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent-100 flex items-center justify-center text-2xl group-hover:bg-accent-200 transition-colors">
                      ✂️
                    </div>
                    <div>
                      <h3 className="font-semibold text-primary-900 mb-1">
                        Profesional
                      </h3>
                      <p className="text-sm text-neutral-600">
                        Soy estilista, barbero o profesional y quiero unirme a un negocio
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step: Datos completos */}
          {step === 'data' && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8">
              <button
                onClick={() => setStep('account_type')}
                className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
              >
                ← Cambiar tipo de cuenta
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${
                  accountType === 'business_owner' ? 'bg-primary-100' : 'bg-accent-100'
                }`}>
                  {accountType === 'business_owner' ? '🏢' : '✂️'}
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-primary-900">
                    {accountType === 'business_owner' ? 'Registro de dueño' : 'Registro de profesional'}
                  </h1>
                  <p className="text-sm text-neutral-500">
                    Completa tus datos personales
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit(handleDataSubmit)} className="space-y-4">
                {/* Telefono (editable) */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Número de WhatsApp
                  </label>
                  <Input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+51987654321"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Te enviaremos un código de verificación a este número
                  </p>
                </div>

                {/* Tipo de documento y numero */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Documento
                    </label>
                    <select
                      {...register('document_type', { required: true })}
                      className="w-full px-3 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="dni">DNI</option>
                      <option value="ce">CE</option>
                      <option value="pasaporte">Pasaporte</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Número
                    </label>
                    <Input
                      {...register('document_number', {
                        required: 'Requerido',
                        minLength: { value: 8, message: 'Mínimo 8 caracteres' }
                      })}
                      placeholder="12345678"
                      error={errors.document_number?.message}
                    />
                  </div>
                </div>

                {/* Nombres */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Nombres
                  </label>
                  <Input
                    {...register('first_name', { required: 'Requerido' })}
                    placeholder="Juan Carlos"
                    error={errors.first_name?.message}
                  />
                </div>

                {/* Apellidos */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Apellido paterno
                    </label>
                    <Input
                      {...register('last_name_paterno', { required: 'Requerido' })}
                      placeholder="Perez"
                      error={errors.last_name_paterno?.message}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Apellido materno
                    </label>
                    <Input
                      {...register('last_name_materno')}
                      placeholder="Lopez"
                    />
                  </div>
                </div>

                {/* Fecha de nacimiento */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Fecha de nacimiento
                  </label>
                  <Input
                    type="date"
                    {...register('birth_date', { required: 'Requerido' })}
                    error={errors.birth_date?.message}
                  />
                </div>

                {/* Email (opcional) */}
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Email <span className="text-neutral-400">(opcional)</span>
                  </label>
                  <Input
                    type="email"
                    {...register('email')}
                    placeholder="tu@email.com"
                  />
                </div>

                {/* Campos adicionales para profesionales */}
                {accountType === 'staff' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Especialidad
                      </label>
                      <Input
                        {...register('specialty', { required: accountType === 'staff' ? 'Requerido' : false })}
                        placeholder="Ej: Corte de cabello, Colorista, Barbero"
                        error={errors.specialty?.message}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Bio <span className="text-neutral-400">(opcional)</span>
                      </label>
                      <textarea
                        {...register('bio')}
                        className="w-full px-4 py-2.5 border border-neutral-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                        rows={3}
                        placeholder="Cuentanos sobre tu experiencia..."
                      />
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={sendOtp.isPending}
                >
                  {sendOtp.isPending ? 'Enviando código...' : 'Verificar WhatsApp'}
                </Button>
              </form>
            </div>
          )}

          {/* Step: Verificar OTP */}
          {step === 'otp' && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-3xl">📱</span>
              </div>

              <h1 className="text-2xl font-light text-primary-900 mb-2">
                Verifica tu WhatsApp
              </h1>
              <p className="text-neutral-600 mb-8">
                Ingresa el código de 6 dígitos enviado a<br />
                <strong>{phoneNumber}</strong>
              </p>

              <div className="mb-6">
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full text-center text-3xl tracking-[0.5em] font-mono py-4 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
              </div>

              <Button
                onClick={handleVerifyOtp}
                className="w-full mb-4"
                disabled={otpCode.length !== 6 || verifyOtp.isPending || completeRegistration.isPending}
              >
                {verifyOtp.isPending || completeRegistration.isPending ? 'Verificando...' : 'Verificar código'}
              </Button>

              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-neutral-500">¿No recibiste el código?</span>
                <button
                  onClick={handleResendOtp}
                  className="text-primary-900 hover:underline font-medium"
                  disabled={sendOtp.isPending}
                >
                  Reenviar
                </button>
              </div>

              <button
                onClick={() => setStep('data')}
                className="mt-6 text-sm text-neutral-500 hover:text-primary-900"
              >
                ← Volver y corregir datos
              </button>
            </div>
          )}

          {/* Step: Exito */}
          {step === 'success' && (
            <div className="bg-white rounded-2xl border border-neutral-100 p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
                <span className="text-4xl">⏳</span>
              </div>

              <h1 className="text-2xl font-light text-primary-900 mb-4">
                Registro completado
              </h1>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-amber-800 text-sm">
                  <strong>Tu cuenta está pendiente de aprobación.</strong><br />
                  Un administrador revisará tu solicitud y te notificará por WhatsApp cuando esté activa.
                </p>
              </div>

              <p className="text-neutral-600 mb-8">
                {accountType === 'staff' ? (
                  <>Mientras tanto, puedes contactar al negocio donde deseas trabajar para que aceleren el proceso.</>
                ) : (
                  <>Revisaremos tu solicitud lo antes posible. Gracias por tu paciencia.</>
                )}
              </p>

              <Button onClick={() => navigate('/')} variant="secondary" className="w-full">
                Volver al inicio
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
