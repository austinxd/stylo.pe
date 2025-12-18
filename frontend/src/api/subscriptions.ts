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
  deactivated_at: string | null
  is_active: boolean
}

export interface PaymentMethod {
  id: number
  method_type: 'card' | 'courtesy'
  method_type_display: string
  card_type: 'credit' | 'debit' | ''
  card_type_display: string
  brand: 'visa' | 'mastercard' | 'amex' | 'diners' | 'courtesy' | 'other'
  brand_display: string
  last_four: string
  holder_name: string
  expiration_month: number | null
  expiration_year: number | null
  display_expiration: string
  is_virtual: boolean
  is_default: boolean
  is_active: boolean
  card_display: string
  created_at: string
}

export interface InvoiceLineItem {
  id: number
  staff: number | null
  staff_name: string
  description: string
  period_start: string
  period_end: string
  days_in_period: number
  days_active: number
  monthly_rate: string
  daily_rate: string
  subtotal: string
}

export interface Payment {
  id: number
  amount: string
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  status_display: string
  payment_method_display: string | null
  error_message: string | null
  processed_at: string | null
  created_at: string
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
  status: 'pending' | 'paid' | 'failed' | 'overdue' | 'cancelled'
  status_display: string
  due_date: string
  paid_at: string | null
  payment_method_used: number | null
  payment_method_display: string | null
  payment_attempts: number
  max_payment_attempts: number
  created_at: string
}

export interface InvoiceDetail extends InvoiceInfo {
  notes: string | null
  line_items: InvoiceLineItem[]
  payments: Payment[]
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
  // Campos de cortesía
  has_courtesy_access: boolean
  is_courtesy_active: boolean
  courtesy_until: string | null
  courtesy_reason: string
  // Relaciones
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

  // ==================== MÉTODOS DE PAGO ====================

  /**
   * Obtiene los métodos de pago del negocio.
   */
  getPaymentMethods: async (): Promise<PaymentMethod[]> => {
    const response = await apiClient.get('/subscription/payment_methods/')
    return response.data
  },

  /**
   * Agrega un nuevo método de pago usando token de Culqi.
   */
  addPaymentMethod: async (cardToken: string, setAsDefault: boolean = true): Promise<PaymentMethod> => {
    const response = await apiClient.post('/subscription/payment_methods/', {
      card_token: cardToken,
      set_as_default: setAsDefault
    })
    return response.data
  },

  /**
   * Elimina un método de pago.
   */
  deletePaymentMethod: async (methodId: number): Promise<void> => {
    await apiClient.delete(`/subscription/payment-methods/${methodId}/`)
  },

  /**
   * Establece un método de pago como el default.
   */
  setDefaultPaymentMethod: async (methodId: number): Promise<PaymentMethod> => {
    const response = await apiClient.post(`/subscription/payment-methods/${methodId}/set-default/`)
    return response.data
  },

  // ==================== FACTURAS ====================

  /**
   * Obtiene el detalle de una factura con line items.
   */
  getInvoiceDetail: async (invoiceId: number): Promise<InvoiceDetail> => {
    const response = await apiClient.get(`/subscription/invoices/${invoiceId}/`)
    return response.data
  },

  /**
   * Procesa el pago de una factura.
   */
  payInvoice: async (invoiceId: number, paymentMethodId?: number): Promise<{
    success: boolean
    message?: string
    error?: string
    invoice?: InvoiceDetail
    payment_status?: string
  }> => {
    const response = await apiClient.post(`/subscription/invoices/${invoiceId}/pay/`, {
      payment_method_id: paymentMethodId
    })
    return response.data
  },

  // ==================== ACTIVACIÓN/DESACTIVACIÓN DE PROFESIONALES ====================
  // Modelo MES VENCIDO (postpago): No cobra inmediatamente, solo marca como activo/billable.
  // La factura se genera el 1ero del mes siguiente por los días exactos de uso.

  /**
   * Activa un profesional (sin cobro inmediato).
   * Requiere tener un método de pago configurado (tarjeta o cortesía).
   * La factura se generará el 1ero del mes siguiente.
   */
  activateStaff: async (staffSubId: number): Promise<{
    success: boolean
    message?: string
    error?: string
    staff_subscription?: {
      id: number
      staff_name: string
      is_active: boolean
      is_billable: boolean
      billable_since: string
    }
  }> => {
    const response = await apiClient.post(`/subscription/staff/${staffSubId}/activate/`)
    return response.data
  },

  /**
   * Activa todos los profesionales con trial vencido (sin cobro inmediato).
   * La factura se generará el 1ero del mes siguiente.
   */
  activateAllStaff: async (): Promise<{
    success: boolean
    message?: string
    error?: string
    activated_count?: number
  }> => {
    const response = await apiClient.post('/subscription/activate-all/')
    return response.data
  },

  /**
   * Desactiva un profesional.
   * Marca deactivated_at=hoy, el profesional no podrá recibir citas.
   * Solo se facturarán los días que estuvo activo.
   */
  deactivateStaff: async (staffSubId: number): Promise<{
    success: boolean
    message?: string
    error?: string
    staff_subscription?: {
      id: number
      staff_name: string
      is_active: boolean
      is_billable: boolean
      deactivated_at: string
    }
  }> => {
    const response = await apiClient.post(`/subscription/staff/${staffSubId}/deactivate/`)
    return response.data
  },
}

export default subscriptionsApi
