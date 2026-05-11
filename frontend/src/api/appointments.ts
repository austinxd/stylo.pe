import apiClient from './client'
import type { Appointment, BookingFormData } from '@/types'

export interface WaitlistEntry {
  id: number
  branch_name: string
  service_name: string
  staff_name: string | null
  phone_number: string
  first_name: string
  preferred_date: string
  preferred_time_start: string | null
  preferred_time_end: string | null
  status: 'waiting' | 'notified' | 'claimed' | 'expired' | 'cancelled'
  created_at: string
  notified_at: string | null
}

export interface WaitlistJoinPayload {
  branch_id: number
  service_id: number
  staff_id?: number | null
  preferred_date: string // YYYY-MM-DD
  preferred_time_start?: string | null // HH:MM
  preferred_time_end?: string | null
  phone_number: string
  first_name: string
  notes?: string
}

export const waitlistApi = {
  join: async (payload: WaitlistJoinPayload): Promise<WaitlistEntry> => {
    const response = await apiClient.post(
      '/appointments/waitlist/join/',
      payload,
    )
    return response.data
  },

  getStatus: async (phone: string): Promise<WaitlistEntry[]> => {
    const response = await apiClient.get('/appointments/waitlist/status/', {
      params: { phone },
    })
    return response.data
  },

  cancel: async (entryId: number, phoneNumber: string): Promise<void> => {
    await apiClient.post('/appointments/waitlist/cancel/', {
      entry_id: entryId,
      phone_number: phoneNumber,
    })
  },
}

export const appointmentsApi = {
  /**
   * Obtiene las citas del cliente autenticado.
   */
  getMyAppointments: async (): Promise<Appointment[]> => {
    const response = await apiClient.get('/appointments/')
    return response.data
  },

  /**
   * Obtiene las próximas citas.
   */
  getUpcoming: async (): Promise<Appointment[]> => {
    const response = await apiClient.get('/appointments/upcoming/')
    return response.data
  },

  /**
   * Obtiene el historial de citas.
   */
  getHistory: async (): Promise<Appointment[]> => {
    const response = await apiClient.get('/appointments/history/')
    return response.data
  },

  /**
   * Obtiene el detalle de una cita.
   */
  getAppointment: async (id: number): Promise<Appointment> => {
    const response = await apiClient.get(`/appointments/${id}/`)
    return response.data
  },

  /**
   * Crea una nueva cita.
   */
  createAppointment: async (data: BookingFormData): Promise<Appointment> => {
    const response = await apiClient.post('/appointments/', data)
    return response.data
  },

  /**
   * Cancela una cita.
   */
  cancelAppointment: async (id: number, reason?: string): Promise<Appointment> => {
    const response = await apiClient.post(`/appointments/${id}/cancel/`, {
      reason,
    })
    return response.data
  },

  /**
   * Reagenda una cita del dashboard a una nueva fecha/hora.
   *
   * Garantiza atómicamente que no haya conflicto. Si el nuevo horario
   * está tomado, retorna 409 Conflict.
   */
  rescheduleAppointment: async (
    id: number,
    startDatetime: string,
  ): Promise<Appointment> => {
    const response = await apiClient.post(
      `/appointments/dashboard/${id}/reschedule/`,
      { start_datetime: startDatetime },
    )
    return response.data
  },
}

export default appointmentsApi
