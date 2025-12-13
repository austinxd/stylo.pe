import apiClient from './client'
import type { Appointment, BookingFormData } from '@/types'

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
}

export default appointmentsApi
