/**
 * API para reservas públicas (sin autenticación)
 */
import apiClient from './client'

// Tipos para el flujo de reserva
export interface BookingStartRequest {
  branch_id: number
  service_id: number
  staff_id: number
  start_datetime: string
  notes?: string
}

export interface BookingSummary {
  business_name: string
  branch_name: string
  branch_address: string
  service_name: string
  service_duration: number
  staff_name: string
  staff_photo: string | null
  start_datetime: string
  end_datetime: string
  price: string
}

export interface BookingStartResponse {
  session_token: string
  expires_in: number
  booking_summary: BookingSummary
}

export interface BookingSendOTPRequest {
  session_token: string
  phone_number: string
  document_type: 'dni' | 'pasaporte' | 'ce'
  document_number: string
  first_name: string
  last_name_paterno: string
  last_name_materno?: string
  email?: string
  gender?: 'M' | 'F'
  birth_date?: string // Formato: YYYY-MM-DD
  photo?: File // Foto del cliente (opcional, para remarketing interno)
}

export interface BookingSendOTPResponse {
  message: string
  expires_in: number
  debug_otp?: string // Solo en desarrollo
}

export interface BookingVerifyOTPRequest {
  session_token: string
  otp_code: string
}

export interface AppointmentConfirmation {
  id: number
  business_name: string
  branch_name: string
  branch_address: string
  staff_name: string
  staff_photo: string | null
  service_name: string
  start_datetime: string
  end_datetime: string
  duration_minutes: number
  status: string
  price: string
  created_at: string
}

export interface BookingVerifyOTPResponse {
  success: boolean
  message: string
  appointment: AppointmentConfirmation
}

export interface BookingResendOTPRequest {
  session_token: string
}

export interface LookupClientRequest {
  document_type: 'dni' | 'pasaporte' | 'ce'
  document_number: string
}

export interface LookupClientResponse {
  found: boolean
  client?: {
    first_name: string
    last_name_paterno: string
    last_name_materno: string
    phone_number: string
    email: string
    gender?: 'M' | 'F'
    birth_date?: string | null
  }
}

export interface LookupReniecRequest {
  dni: string
}

export interface LookupReniecResponse {
  found: boolean
  first_name?: string
  last_name_paterno?: string
  last_name_materno?: string
  birth_date?: string | null
  gender?: 'M' | 'F'
  error?: string
}

/**
 * API de reservas públicas
 */
export const bookingApi = {
  /**
   * Paso 1: Iniciar reserva
   * Selecciona servicio, profesional y horario
   */
  start: async (data: BookingStartRequest): Promise<BookingStartResponse> => {
    const response = await apiClient.post<BookingStartResponse>(
      '/appointments/booking/start/',
      data
    )
    return response.data
  },

  /**
   * Paso 2: Enviar datos del cliente y solicitar OTP
   * Si hay foto, usa FormData (multipart/form-data)
   */
  sendOTP: async (data: BookingSendOTPRequest): Promise<BookingSendOTPResponse> => {
    // Si hay foto, enviar como FormData
    if (data.photo) {
      const formData = new FormData()
      formData.append('session_token', data.session_token)
      formData.append('phone_number', data.phone_number)
      formData.append('document_type', data.document_type)
      formData.append('document_number', data.document_number)
      formData.append('first_name', data.first_name)
      formData.append('last_name_paterno', data.last_name_paterno)
      if (data.last_name_materno) formData.append('last_name_materno', data.last_name_materno)
      if (data.email) formData.append('email', data.email)
      if (data.gender) formData.append('gender', data.gender)
      if (data.birth_date) formData.append('birth_date', data.birth_date)
      formData.append('photo', data.photo)

      const response = await apiClient.post<BookingSendOTPResponse>(
        '/appointments/booking/send-otp/',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      return response.data
    }

    // Sin foto, enviar JSON normal
    const response = await apiClient.post<BookingSendOTPResponse>(
      '/appointments/booking/send-otp/',
      data
    )
    return response.data
  },

  /**
   * Paso 3: Verificar OTP y confirmar reserva
   */
  verifyOTP: async (data: BookingVerifyOTPRequest): Promise<BookingVerifyOTPResponse> => {
    const response = await apiClient.post<BookingVerifyOTPResponse>(
      '/appointments/booking/verify-otp/',
      data
    )
    return response.data
  },

  /**
   * Reenviar OTP
   */
  resendOTP: async (data: BookingResendOTPRequest): Promise<BookingSendOTPResponse> => {
    const response = await apiClient.post<BookingSendOTPResponse>(
      '/appointments/booking/resend-otp/',
      data
    )
    return response.data
  },

  /**
   * Buscar cliente por documento
   * Si existe, retorna sus datos para autocompletar el formulario
   */
  lookupClient: async (data: LookupClientRequest): Promise<LookupClientResponse> => {
    const response = await apiClient.post<LookupClientResponse>(
      '/appointments/booking/lookup-client/',
      data
    )
    return response.data
  },

  /**
   * Buscar datos de persona en RENIEC por DNI
   * Llamada directa a API pública (evita rate limit del proxy)
   */
  lookupReniec: async (data: LookupReniecRequest): Promise<LookupReniecResponse> => {
    try {
      const response = await fetch(`https://api.casaaustin.pe/api/v1/reniec/lookup/public/?dni=${data.dni}`)
      const result = await response.json()

      if (result && result.data) {
        const personData = result.data
        return {
          found: true,
          first_name: personData.preNombres || '',
          last_name_paterno: personData.apePaterno || '',
          last_name_materno: personData.apeMaterno || '',
          birth_date: personData.feNacimiento || null,
          gender: personData.sexo?.toLowerCase() === 'm' ? 'M' : personData.sexo?.toLowerCase() === 'f' ? 'F' : undefined,
        }
      }
      return { found: false }
    } catch (error) {
      console.error('Error looking up RENIEC:', error)
      return { found: false, error: 'Error de conexión' }
    }
  },
}

export default bookingApi
