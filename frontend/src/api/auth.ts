import apiClient from './client'
import type { AuthResponse, RegisterFormData } from '@/types'

export interface CheckPhoneResponse {
  success: boolean
  exists: boolean
  is_active?: boolean
  role?: string
}

export interface CheckDocumentResponse {
  success: boolean
  exists: boolean
  role?: 'staff' | 'business_owner'
  is_active?: boolean
  name?: string
}

export interface DocumentLoginResponse {
  success: boolean
  access_token?: string
  refresh_token?: string
  user?: {
    id: number
    phone_number: string
    email: string | null
    role: 'super_admin' | 'business_owner' | 'branch_manager' | 'staff' | 'client'
    is_verified: boolean
  }
  staff?: {
    id: number
    first_name: string
    last_name: string
    specialty: string
    branch_name?: string
  }
  error?: string
  pending_approval?: boolean
}

export const authApi = {
  /**
   * Verifica si existe cuenta por documento (para dueños y profesionales).
   */
  checkDocument: async (documentType: string, documentNumber: string): Promise<CheckDocumentResponse> => {
    const response = await apiClient.post('/auth/document/check', {
      document_type: documentType,
      document_number: documentNumber,
    })
    return response.data
  },

  /**
   * Login con documento + contraseña (para dueños y profesionales).
   */
  documentLogin: async (documentType: string, documentNumber: string, password: string): Promise<DocumentLoginResponse> => {
    const response = await apiClient.post('/auth/document/login', {
      document_type: documentType,
      document_number: documentNumber,
      password: password,
    })
    return response.data
  },

  /**
   * Verifica si un telefono esta registrado (sin enviar OTP).
   */
  checkPhone: async (phoneNumber: string): Promise<CheckPhoneResponse> => {
    const response = await apiClient.post('/auth/whatsapp/check', {
      phone_number: phoneNumber,
    })
    return response.data
  },

  /**
   * Inicia el proceso de autenticación enviando OTP.
   */
  startWhatsApp: async (phoneNumber: string): Promise<{ success: boolean; expires_in: number; message?: string; error?: string }> => {
    const response = await apiClient.post('/auth/whatsapp/start', {
      phone_number: phoneNumber,
    })
    return response.data
  },

  /**
   * Verifica el código OTP.
   */
  verifyOTP: async (phoneNumber: string, otpCode: string): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/whatsapp/verify', {
      phone_number: phoneNumber,
      otp_code: otpCode,
    })
    return response.data
  },

  /**
   * Completa el registro con datos personales.
   */
  completeRegistration: async (data: RegisterFormData): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/whatsapp/complete', data)
    return response.data
  },

  /**
   * Login con contraseña (dueños y profesionales).
   */
  passwordLogin: async (phoneNumber: string, password: string): Promise<AuthResponse> => {
    const response = await apiClient.post('/auth/password/login', {
      phone_number: phoneNumber,
      password: password,
    })
    return response.data
  },

  /**
   * Cierra sesión.
   */
  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/auth/logout', { refresh_token: refreshToken })
  },

  /**
   * Refresca el token de acceso.
   */
  refreshToken: async (refreshToken: string): Promise<{ access: string; refresh: string }> => {
    const response = await apiClient.post('/auth/token/refresh', {
      refresh: refreshToken,
    })
    return response.data
  },

  /**
   * Solicita reset de contraseña por documento.
   * Envía OTP al WhatsApp registrado del usuario.
   */
  requestPasswordReset: async (documentType: string, documentNumber: string): Promise<{
    success: boolean
    message: string
    masked_phone?: string
    expires_in?: number
    error?: string
  }> => {
    const response = await apiClient.post('/auth/password/reset-request', {
      document_type: documentType,
      document_number: documentNumber,
    })
    return response.data
  },

  /**
   * Confirma reset de contraseña con OTP y nueva contraseña.
   */
  confirmPasswordReset: async (
    documentType: string,
    documentNumber: string,
    otpCode: string,
    newPassword: string,
    newPasswordConfirm: string
  ): Promise<{
    success: boolean
    message: string
    error?: string
  }> => {
    const response = await apiClient.post('/auth/password/reset-confirm', {
      document_type: documentType,
      document_number: documentNumber,
      otp_code: otpCode,
      new_password: newPassword,
      new_password_confirm: newPasswordConfirm,
    })
    return response.data
  },
}

export default authApi
