import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import authApi from '@/api/auth'
import { Logo, Button, Input } from '@/components/ui'
import type { DocumentType } from '@/types'

type Step = 'document' | 'otp' | 'new_password' | 'success'

export default function ForgotPassword() {
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('document')
  const [documentType, setDocumentType] = useState<DocumentType>('dni')
  const [documentNumber, setDocumentNumber] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [error, setError] = useState('')

  // Mutation: Solicitar reset (enviar OTP)
  const requestReset = useMutation({
    mutationFn: () => authApi.requestPasswordReset(documentType, documentNumber),
    onSuccess: (data) => {
      if (data.success) {
        setMaskedPhone(data.masked_phone || '')
        setStep('otp')
        setError('')
      } else {
        setError(data.error || 'Error al solicitar el reset')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'No se encontro una cuenta con ese documento'
      setError(message)
    },
  })

  // Mutation: Confirmar reset con OTP y nueva contrasena
  const confirmReset = useMutation({
    mutationFn: () =>
      authApi.confirmPasswordReset(
        documentType,
        documentNumber,
        otpCode,
        newPassword,
        newPasswordConfirm
      ),
    onSuccess: (data) => {
      if (data.success) {
        setStep('success')
        setError('')
      } else {
        setError(data.error || 'Error al cambiar la contrasena')
      }
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Error al verificar el codigo'
      setError(message)
    },
  })

  const handleSubmitDocument = (e: React.FormEvent) => {
    e.preventDefault()
    if (documentNumber.length < 8) {
      setError('El numero de documento debe tener al menos 8 caracteres')
      return
    }
    setError('')
    requestReset.mutate()
  }

  const handleSubmitOtp = (e: React.FormEvent) => {
    e.preventDefault()
    if (otpCode.length !== 6) {
      setError('El codigo debe tener 6 digitos')
      return
    }
    setError('')
    setStep('new_password')
  }

  const handleSubmitNewPassword = (e: React.FormEvent) => {
    e.preventDefault()
    if (newPassword.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setError('Las contrasenas no coinciden')
      return
    }
    setError('')
    confirmReset.mutate()
  }

  const handleResendOtp = () => {
    setOtpCode('')
    setError('')
    requestReset.mutate()
  }

  // Calcular progreso
  const getProgress = () => {
    const steps = ['document', 'otp', 'new_password']
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
                <Link
                  to="/auth/login"
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
                >
                  ← Volver al login
                </Link>

                <div className="mb-8">
                  <h1 className="text-3xl font-light text-primary-900 tracking-tight mb-2">
                    Recuperar contrasena
                  </h1>
                  <p className="text-neutral-600">
                    Ingresa tu documento de identidad para recuperar tu cuenta
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
                        Numero de documento
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
                    loading={requestReset.isPending}
                    fullWidth
                    size="lg"
                  >
                    Enviar codigo
                  </Button>
                </form>

                <div className="mt-6 p-4 bg-neutral-100 border border-neutral-200 rounded-xl">
                  <p className="text-neutral-600 text-sm text-center">
                    Te enviaremos un codigo de verificacion al WhatsApp registrado con tu cuenta.
                  </p>
                </div>
              </div>
            )}

            {/* Step: OTP */}
            {step === 'otp' && (
              <div className="card">
                <button
                  type="button"
                  onClick={() => setStep('document')}
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
                >
                  ← Cambiar documento
                </button>

                <div className="mb-8">
                  <h1 className="text-2xl font-light text-primary-900 tracking-tight mb-2">
                    Verificar codigo
                  </h1>
                  <p className="text-neutral-600">
                    Ingresa el codigo de 6 digitos enviado a tu WhatsApp
                  </p>
                </div>

                <div className="py-4 px-5 bg-accent-50 rounded-xl border border-accent-200 mb-6">
                  <p className="text-sm text-accent-800">
                    Codigo enviado a{' '}
                    <span className="font-semibold">{maskedPhone || 'tu WhatsApp'}</span>
                  </p>
                </div>

                <form onSubmit={handleSubmitOtp} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Codigo de verificacion
                    </label>
                    <input
                      type="text"
                      value={otpCode}
                      onChange={(e) => {
                        setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        setError('')
                      }}
                      placeholder="000000"
                      className="w-full h-[58px] px-4 border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-900/10 focus:border-primary-900 hover:border-neutral-300 text-center text-2xl tracking-[0.5em] font-light"
                      maxLength={6}
                      autoFocus
                    />
                  </div>

                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    disabled={otpCode.length !== 6}
                  >
                    Verificar codigo
                  </Button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={requestReset.isPending}
                      className="text-sm text-neutral-600 hover:text-primary-900 transition-colors disabled:opacity-50"
                    >
                      No recibiste el codigo? <span className="font-medium">Reenviar</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Step: New Password */}
            {step === 'new_password' && (
              <div className="card">
                <button
                  type="button"
                  onClick={() => setStep('otp')}
                  className="flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-900 mb-6"
                >
                  ← Volver
                </button>

                <div className="mb-8">
                  <h1 className="text-2xl font-light text-primary-900 tracking-tight mb-2">
                    Nueva contrasena
                  </h1>
                  <p className="text-neutral-600">
                    Ingresa tu nueva contrasena
                  </p>
                </div>

                <form onSubmit={handleSubmitNewPassword} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Nueva contrasena
                    </label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimo 8 caracteres"
                      size="lg"
                      icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Confirmar contrasena
                    </label>
                    <Input
                      type="password"
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      placeholder="Repite tu contrasena"
                      size="lg"
                      icon={
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                      }
                    />
                  </div>

                  <Button
                    type="submit"
                    loading={confirmReset.isPending}
                    fullWidth
                    size="lg"
                  >
                    Cambiar contrasena
                  </Button>
                </form>
              </div>
            )}

            {/* Step: Success */}
            {step === 'success' && (
              <div className="card text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>

                <h1 className="text-2xl font-light text-primary-900 mb-4">
                  Contrasena actualizada
                </h1>

                <p className="text-neutral-600 mb-8">
                  Tu contrasena ha sido cambiada exitosamente. Ya puedes iniciar sesion con tu nueva contrasena.
                </p>

                <Button onClick={() => navigate('/auth/login')} fullWidth size="lg">
                  Ir al login
                </Button>
              </div>
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
            </div>
            <h2 className="text-3xl font-light text-white mb-4 tracking-tight">
              Recupera tu acceso
            </h2>
            <p className="text-neutral-300 text-lg leading-relaxed">
              Te enviaremos un codigo de verificacion a tu WhatsApp registrado para que puedas crear una nueva contrasena.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
