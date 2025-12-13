import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import authApi from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Logo, Button, Input, DatePicker } from '@/components/ui'
import type { AccountType, DocumentType, RegisterFormData, RegisterCompleteData } from '@/types'

type Step = 'document' | 'password' | 'account_type' | 'register_form' | 'otp' | 'success'

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirectParam = searchParams.get('redirect')

  // Función para determinar el redirect según el rol
  const getRedirectUrl = (role: string) => {
    if (redirectParam) return redirectParam
    // Por defecto, redirigir al dashboard para roles de negocio
    if (['super_admin', 'business_owner', 'branch_manager', 'staff'].includes(role)) {
      return '/dashboard'
    }
    return '/'
  }

  const { setAuth } = useAuthStore()

  // Estados
  const [step, setStep] = useState<Step>('document')
  const [documentType, setDocumentType] = useState<DocumentType>('dni')
  const [documentNumber, setDocumentNumber] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [error, setError] = useState('')
  const [isExistingUser, setIsExistingUser] = useState(false)
  const [existingUserName, setExistingUserName] = useState<string | null>(null)
  const [, setExistingUserRole] = useState<string | null>(null)
  const [accountType, setAccountType] = useState<AccountType | null>(null)
  const [formData, setFormData] = useState<RegisterFormData | null>(null)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<RegisterFormData>()

  // Mutation: Verificar si el documento existe
  const checkDocument = useMutation({
    mutationFn: () => authApi.checkDocument(documentType, documentNumber),
    onSuccess: (data) => {
      if (data.exists) {
        // Usuario existe
        if (!data.is_active) {
          setError('Tu cuenta está pendiente de aprobación. Te notificaremos por WhatsApp cuando esté activa.')
          return
        }
        setIsExistingUser(true)
        setExistingUserName(data.name || null)
        setExistingUserRole(data.role || null)
        setStep('password')
        setError('')
      } else {
        // Usuario nuevo - mostrar opciones de registro
        setIsExistingUser(false)
        setStep('account_type')
        setError('')
      }
    },
    onError: () => {
      setError('Error al verificar el documento. Intenta nuevamente.')
    },
  })

  // Mutation: Login con documento + password
  const documentLogin = useMutation({
    mutationFn: () => authApi.documentLogin(documentType, documentNumber, password),
    onSuccess: (data) => {
      if (data.success && data.access_token && data.user) {
        setAuth({
          user: data.user,
          client: undefined,
          accessToken: data.access_token,
          refreshToken: data.refresh_token!,
        })
        navigate(getRedirectUrl(data.user.role))
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Credenciales incorrectas'
      if (error?.response?.data?.pending_approval) {
        setError('Tu cuenta está pendiente de aprobación. Te notificaremos por WhatsApp cuando esté activa.')
      } else {
        setError(message)
      }
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
      setError('Error al enviar el código. Verifica el número.')
    },
  })

  // Mutation: Verificar OTP
  const verifyOtp = useMutation({
    mutationFn: () => authApi.verifyOTP(phoneNumber, otpCode),
    onSuccess: (data) => {
      if (data.is_registered && data.access_token && data.user) {
        // Usuario existe, login exitoso
        setAuth({
          user: data.user,
          client: data.client,
          accessToken: data.access_token,
          refreshToken: data.refresh_token!,
        })
        navigate(getRedirectUrl(data.user.role))
      } else if (data.registration_token) {
        // Usuario nuevo verificado, completar registro
        if (formData) {
          completeRegistration.mutate({
            ...formData,
            registration_token: data.registration_token,
          })
        }
      }
    },
    onError: () => {
      setError('Código incorrecto. Intenta de nuevo.')
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
  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault()
    if (documentNumber.length < 8) {
      setError('El número de documento debe tener al menos 8 caracteres')
      return
    }
    setError('')
    checkDocument.mutate()
  }

  const handleSelectAccountType = (type: AccountType) => {
    setAccountType(type)
    setStep('register_form')
  }

  const handleRegisterFormSubmit = (data: RegisterFormData) => {
    data.account_type = accountType!
    data.document_type = documentType
    data.document_number = documentNumber

    // Formatear telefono
    let formattedPhone = data.phone_number
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+51' + formattedPhone
    }
    data.phone_number = formattedPhone
    setPhoneNumber(formattedPhone)

    setFormData(data)
    // Enviar OTP
    sendOtp.mutate(formattedPhone)
  }

  const handleSubmitOtp = (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.length !== 6) {
      setError('El código debe tener 6 dígitos')
      return
    }
    verifyOtp.mutate()
  }

  const handleResendOtp = () => {
    sendOtp.mutate(phoneNumber)
    setOtpCode('')
    setError('')
  }

  const handleSubmitPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    setError('')
    documentLogin.mutate()
  }

  // Calcular progreso
  const getProgress = () => {
    if (isExistingUser) {
      const steps = ['document', 'password']
      const currentIndex = steps.indexOf(step)
      return ((currentIndex + 1) / steps.length) * 100
    }
    const steps = ['document', 'account_type', 'register_form', 'otp']
    const currentIndex = steps.indexOf(step)
    return ((currentIndex + 1) / steps.length) * 100
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex">
      {/* Left side - Form */}
      <div className="flex-1 flex flex-col">
        {/* Progress bar */}
        {step !== 'success' && (
          <div className="bg-white border-b border-neutral-100">
            <div className="h-1 bg-neutral-100">
              <div
                className="h-full bg-primary-900 transition-all duration-300"
                style={{ width: `${getProgress()}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="mb-10">
              <Link to="/">
                <Logo size="lg" />
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Step: Document */}
            {step === 'document' && (
              <div className="card">
                <div className="mb-8">
                  <h1 className="text-3xl font-light text-primary-900 tracking-tight mb-2">
                    Bienvenido
                  </h1>
                  <p className="text-neutral-600">
                    Ingresa con tu documento de identidad
                  </p>
                </div>

                <form onSubmit={handleSubmitDocument} className="space-y-6">
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Tipo
                      </label>
                      <select
                        value={documentType}
                        onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                        className="w-full h-[58px] px-4 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-900/10 focus:border-primary-900 hover:border-neutral-300 text-primary-900 bg-white transition-all duration-200"
                      >
                        <option value="dni">DNI</option>
                        <option value="ce">CE</option>
                        <option value="pasaporte">Pasaporte</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Número de documento
                      </label>
                      <Input
                        type="text"
                        value={documentNumber}
                        onChange={(e) => setDocumentNumber(e.target.value.toUpperCase())}
                        placeholder="12345678"
                        size="lg"
                        icon={
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
                          </svg>
                        }
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    loading={checkDocument.isPending}
                    fullWidth
                    size="lg"
                  >
                    Continuar
                  </Button>
                </form>

                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-amber-800 text-sm text-center">
                    <strong>Nota:</strong> Este acceso es para dueños de negocio y profesionales.
                    Si eres cliente, usa el formulario de reserva.
                  </p>
                </div>
              </div>
            )}

            {/* Step: Password (para usuarios existentes) */}
            {step === 'password' && (
              <div className="card">
                <button
                  onClick={() => {
                    setStep('document')
                    setPassword('')
                  }}
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
                >
                  ← Cambiar documento
                </button>

                <div className="mb-8">
                  <h1 className="text-2xl font-light text-primary-900 tracking-tight mb-2">
                    Bienvenido de vuelta
                  </h1>
                  {existingUserName && (
                    <p className="text-lg text-primary-700 font-medium mb-1">
                      {existingUserName}
                    </p>
                  )}
                  <p className="text-neutral-600">
                    Ingresa tu contraseña para continuar
                  </p>
                  <p className="text-sm text-neutral-500 mt-1">
                    {documentType.toUpperCase()}: {documentNumber}
                  </p>
                </div>

                <form onSubmit={handleSubmitPassword} className="space-y-6">
                  <Input
                    label="Contraseña"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    size="lg"
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    }
                  />

                  <Button
                    type="submit"
                    loading={documentLogin.isPending}
                    fullWidth
                    size="lg"
                  >
                    Ingresar
                  </Button>

                  <div className="text-center">
                    <Link
                      to="/auth/forgot-password"
                      className="text-sm text-neutral-600 hover:text-primary-900 transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                </form>
              </div>
            )}

            {/* Step: Account Type (solo para nuevos usuarios) */}
            {step === 'account_type' && (
              <div className="card">
                <button
                  onClick={() => setStep('document')}
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
                >
                  ← Cambiar documento
                </button>

                <h1 className="text-2xl font-light text-primary-900 mb-2 text-center">
                  No encontramos una cuenta
                </h1>
                <p className="text-neutral-600 text-center mb-2">
                  con el documento <strong>{documentType.toUpperCase()}: {documentNumber}</strong>
                </p>
                <p className="text-neutral-500 text-sm text-center mb-8">
                  ¿Deseas crear una cuenta? Selecciona el tipo:
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
                          Quiero registrar mi salón, barbería o spa
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
                          Soy estilista, barbero o profesional
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Step: Register Form */}
            {step === 'register_form' && (
              <div className="card">
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

                {/* Documento ya seleccionado */}
                <div className="mb-4 p-3 bg-neutral-100 rounded-lg">
                  <p className="text-sm text-neutral-600">
                    <span className="font-medium">Documento:</span> {documentType.toUpperCase()} {documentNumber}
                  </p>
                </div>

                <form onSubmit={handleSubmit(handleRegisterFormSubmit)} className="space-y-4">
                  {/* Telefono */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Número de WhatsApp
                    </label>
                    <Input
                      type="tel"
                      {...register('phone_number', {
                        required: 'Requerido',
                        minLength: { value: 9, message: 'Mínimo 9 dígitos' }
                      })}
                      placeholder="+51987654321"
                      error={errors.phone_number?.message}
                    />
                    <p className="text-xs text-neutral-500 mt-1">Te enviaremos un código de verificación</p>
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
                  <Controller
                    name="birth_date"
                    control={control}
                    rules={{ required: 'Requerido' }}
                    render={({ field }) => (
                      <DatePicker
                        label="Fecha de nacimiento"
                        value={field.value}
                        onChange={field.onChange}
                        error={errors.birth_date?.message}
                        maxYear={new Date().getFullYear() - 18}
                        minYear={1940}
                      />
                    )}
                  />

                  {/* Email */}
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

                  {/* Contrasena */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Contraseña
                      </label>
                      <Input
                        type="password"
                        {...register('password', {
                          required: 'Requerido',
                          minLength: { value: 8, message: 'Mínimo 8 caracteres' }
                        })}
                        placeholder="********"
                        error={errors.password?.message}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Confirmar
                      </label>
                      <Input
                        type="password"
                        {...register('password_confirm', {
                          required: 'Requerido',
                          validate: (value, formValues) =>
                            value === formValues.password || 'No coinciden'
                        })}
                        placeholder="********"
                        error={errors.password_confirm?.message}
                      />
                    </div>
                  </div>

                  {/* Campos para profesionales */}
                  {accountType === 'staff' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-neutral-700 mb-1">
                          Especialidad
                        </label>
                        <Input
                          {...register('specialty', { required: 'Requerido' })}
                          placeholder="Ej: Corte de cabello, Colorista"
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
                          placeholder="Tu experiencia..."
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

            {/* Step: OTP */}
            {step === 'otp' && (
              <div className="card">
                <button
                  type="button"
                  onClick={() => setStep('register_form')}
                  className="flex items-center gap-2 text-sm text-neutral-600 hover:text-primary-900 transition-colors mb-6"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  Volver
                </button>

                <div className="py-4 px-5 bg-accent-50 rounded-xl border border-accent-200 mb-6">
                  <p className="text-sm text-accent-800">
                    Enviamos un código de 6 dígitos a{' '}
                    <span className="font-semibold">{phoneNumber}</span>
                  </p>
                </div>

                <form onSubmit={handleSubmitOtp} className="space-y-6">
                  <div>
                    <label className="label">Código de verificación</label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        setError('')
                      }}
                      placeholder="000000"
                      className="input input-lg text-center text-2xl tracking-[0.5em] font-light"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    loading={verifyOtp.isPending || completeRegistration.isPending}
                    fullWidth
                    size="lg"
                  >
                    Verificar código
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={sendOtp.isPending}
                      className="text-sm text-neutral-600 hover:text-primary-900 transition-colors disabled:opacity-50"
                    >
                      ¿No recibiste el código? <span className="font-medium">Reenviar</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Step: Success (registro completado) */}
            {step === 'success' && (
              <div className="card text-center">
                <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-6">
                  <span className="text-4xl">⏳</span>
                </div>

                <h1 className="text-2xl font-light text-primary-900 mb-4">
                  Registro completado
                </h1>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                  <p className="text-amber-800 text-sm">
                    <strong>Tu cuenta está pendiente de aprobación.</strong><br />
                    Te notificaremos por WhatsApp cuando esté activa.
                  </p>
                </div>

                <Button onClick={() => navigate('/')} variant="secondary" className="w-full">
                  Volver al inicio
                </Button>
              </div>
            )}

            {/* Footer */}
            {step !== 'success' && (
              <p className="text-center text-sm text-neutral-500 mt-8">
                Al continuar, aceptas nuestros{' '}
                <a href="#" className="text-primary-900 hover:underline">Términos</a>
                {' '}y{' '}
                <a href="#" className="text-primary-900 hover:underline">Privacidad</a>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Right side - Visual */}
      <div className="hidden lg:flex flex-1 bg-primary-900 items-center justify-center p-12">
        <div className="max-w-lg text-center">
          <div className="mb-8">
            <div className="w-24 h-24 mx-auto rounded-full bg-white/10 flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <h2 className="text-3xl font-light text-white mb-4 tracking-tight">
              Gestiona tu negocio
            </h2>
            <p className="text-neutral-300 text-lg leading-relaxed">
              Accede a tu panel de administración para gestionar citas, servicios y profesionales.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 text-left">
            {[
              'Control total de tu agenda',
              'Gestiona tu equipo',
              'Reportes y estadísticas',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-accent-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <span className="text-neutral-200">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
