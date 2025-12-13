import apiClient from './client'
import type {
  Business,
  Branch,
  Service,
  ServiceWithStaff,
  ServiceCategory,
  AvailabilitySlot,
  DayAvailability,
} from '@/types'

export const servicesApi = {
  /**
   * Obtiene la lista de negocios.
   */
  getBusinesses: async (): Promise<Business[]> => {
    const response = await apiClient.get('/businesses/')
    return response.data
  },

  /**
   * Obtiene un negocio por slug.
   */
  getBusiness: async (slug: string): Promise<Business> => {
    const response = await apiClient.get(`/businesses/${slug}/`)
    return response.data
  },

  /**
   * Obtiene las sucursales de un negocio.
   */
  getBranches: async (businessSlug: string): Promise<Branch[]> => {
    const response = await apiClient.get(`/businesses/${businessSlug}/branches/`)
    return response.data
  },

  /**
   * Obtiene el detalle de una sucursal.
   */
  getBranch: async (businessSlug: string, branchId: number): Promise<Branch> => {
    const response = await apiClient.get(`/businesses/${businessSlug}/branches/${branchId}/`)
    return response.data
  },

  /**
   * Obtiene los servicios de una sucursal.
   */
  getServices: async (branchId: number): Promise<Service[]> => {
    const response = await apiClient.get(`/branches/${branchId}/services/`)
    // Manejar respuesta paginada de DRF
    return response.data.results || response.data
  },

  /**
   * Obtiene el detalle de un servicio con sus profesionales.
   */
  getService: async (branchId: number, serviceId: number): Promise<ServiceWithStaff> => {
    const response = await apiClient.get(`/branches/${branchId}/services/${serviceId}/`)
    return response.data
  },

  /**
   * Obtiene las categorías de servicios.
   */
  getCategories: async (branchId: number): Promise<ServiceCategory[]> => {
    const response = await apiClient.get(`/branches/${branchId}/services/categories/`)
    return response.data
  },

  /**
   * Obtiene la disponibilidad para una fecha específica.
   */
  getAvailability: async (
    branchId: number,
    serviceId: number,
    date: string,
    staffId?: number
  ): Promise<{ slots: AvailabilitySlot[]; available_count: number }> => {
    const params = new URLSearchParams({
      service_id: serviceId.toString(),
      date,
    })
    if (staffId) {
      params.append('staff_id', staffId.toString())
    }
    const response = await apiClient.get(`/branches/${branchId}/availability?${params}`)
    return response.data
  },

  /**
   * Obtiene la disponibilidad del mes.
   */
  getMonthAvailability: async (
    branchId: number,
    serviceId: number,
    month: string,
    staffId?: number
  ): Promise<{ days: DayAvailability[] }> => {
    const params = new URLSearchParams({
      service_id: serviceId.toString(),
      month,
    })
    if (staffId) {
      params.append('staff_id', staffId.toString())
    }
    const response = await apiClient.get(`/branches/${branchId}/availability/month?${params}`)
    return response.data
  },
}

export default servicesApi
