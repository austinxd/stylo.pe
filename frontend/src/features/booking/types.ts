/**
 * Tipos del flujo de reserva pública.
 *
 * El estado se persiste en sessionStorage para que el cliente no pierda
 * progreso si recarga la página, vuelve atrás o sufre un timeout de red.
 */
export type BookingStep = 'service' | 'staff' | 'datetime' | 'client' | 'otp' | 'success'

export type DocumentType = 'dni' | 'pasaporte' | 'ce'

export type Gender = 'M' | 'F'

export interface BookingClientData {
  phone_number: string
  document_type: DocumentType
  document_number: string
  first_name: string
  last_name_paterno: string
  last_name_materno: string
  email: string
  gender: Gender
  birth_date: string
}

/**
 * Forma "persistible" del estado de booking.
 *
 * NO se guardan en sessionStorage:
 * - sessionToken / OTP (sensibles, se requieren del backend)
 * - photo (es un File, no serializable)
 * - confirmedAppointment (resultado terminal)
 */
export interface PersistedBookingState {
  step: BookingStep
  selectedServiceId: number | null
  selectedStaffId: number | null
  selectedDateISO: string | null
  clientData: BookingClientData
  // Soft-existing: si ya verificamos que el documento existe
  isExistingClient: boolean
  clientLookupDone: boolean
  // Sucursal/negocio para validar que el storage corresponda
  businessSlug: string
  branchSlug: string
}

export const INITIAL_CLIENT_DATA: BookingClientData = {
  phone_number: '+51',
  document_type: 'dni',
  document_number: '',
  first_name: '',
  last_name_paterno: '',
  last_name_materno: '',
  email: '',
  gender: 'M',
  birth_date: '',
}

export const STEP_ORDER: BookingStep[] = [
  'service',
  'staff',
  'datetime',
  'client',
  'otp',
  'success',
]

export const STEP_LABELS: Record<BookingStep, string> = {
  service: 'Servicio',
  staff: 'Profesional',
  datetime: 'Fecha y hora',
  client: 'Tus datos',
  otp: 'Verificación',
  success: 'Confirmado',
}
