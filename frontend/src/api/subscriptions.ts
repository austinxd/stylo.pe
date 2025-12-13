/**
 * API de suscripciones para el dashboard de dueños.
 */
import { apiClient } from './client'

// Tipos
export interface PricingPlan {
  id: number
  name: string
  price_per_staff: string
  trial_days: number
  currency: string
}

export interface StaffSubscriptionInfo {
  id: number
  staff: number
  staff_name: string
  staff_photo: string | null
  added_at: string
  trial_ends_at: string | null
  trial_days_remaining: number | null
  is_billable: boolean
  billable_since: string | null
  is_active: boolean
}

export interface InvoiceInfo {
  id: number
  period_start: string
  period_end: string
  period: string
  staff_count: number
  price_per_staff: string
  subtotal: string
  is_prorated: boolean
  prorated_days: number | null
  total: string
  currency: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  status_display: string
  due_date: string
  paid_at: string | null
  payment_method: string | null
  payment_reference: string | null
  created_at: string
}

export interface SubscriptionSummary {
  status: 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
  status_display: string
  can_receive_bookings: boolean
  active_staff_count: number
  billable_staff_count: number
  monthly_cost: string
  next_billing_date: string | null
  last_payment_date: string | null
  last_payment_amount: string | null
  plan: PricingPlan | null
  staff: StaffSubscriptionInfo[]
  pending_invoices: InvoiceInfo[]
}

export interface SubscriptionAlert {
  type: 'payment_due' | 'suspended' | 'trial_expiring' | 'upcoming_billing'
  severity: 'info' | 'warning' | 'error'
  title: string
  message: string
  action?: string
  action_label?: string
  staff_id?: number
}

export const subscriptionsApi = {
  /**
   * Obtiene el resumen completo de la suscripción del negocio.
   */
  getSummary: async (): Promise<SubscriptionSummary> => {
    const response = await apiClient.get('/subscription/summary/')
    return response.data
  },

  /**
   * Obtiene todas las facturas del negocio.
   */
  getInvoices: async (): Promise<InvoiceInfo[]> => {
    const response = await apiClient.get('/subscription/invoices/')
    return response.data
  },

  /**
   * Obtiene el plan de precios actual.
   */
  getPricing: async (): Promise<PricingPlan> => {
    const response = await apiClient.get('/subscription/pricing/')
    return response.data
  },

  /**
   * Obtiene alertas y recordatorios de la suscripción.
   */
  getAlerts: async (): Promise<{ alerts: SubscriptionAlert[] }> => {
    const response = await apiClient.get('/subscription/alerts/')
    return response.data
  },
}

export default subscriptionsApi
