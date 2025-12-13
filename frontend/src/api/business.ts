import apiClient from './client'
import type { Business, Branch } from '@/types'

export interface Review {
  id: number
  rating: number
  comment: string
  client_name: string | null
  service_name: string | null
  staff_name: string | null
  created_at: string
}

export interface BranchReviewsResponse {
  average_rating: number | null
  total_reviews: number
  rating_distribution: Record<number, number>
  reviews: Review[]
}

export const businessApi = {
  /**
   * Obtiene la lista de negocios activos.
   */
  getBusinesses: async (): Promise<Business[]> => {
    const response = await apiClient.get('/businesses/')
    return response.data
  },

  /**
   * Obtiene un negocio por slug con sus sucursales activas.
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
   * Obtiene el detalle de una sucursal por slug.
   */
  getBranch: async (businessSlug: string, branchSlug: string): Promise<Branch> => {
    const response = await apiClient.get(`/businesses/${businessSlug}/branches/${branchSlug}/`)
    return response.data
  },

  /**
   * Obtiene las reseñas de una sucursal.
   */
  getBranchReviews: async (branchId: number): Promise<BranchReviewsResponse> => {
    const response = await apiClient.get(`/branches/${branchId}/reviews/`)
    return response.data
  },
}

export default businessApi
