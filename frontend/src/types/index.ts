// Tipos de usuario
export interface User {
  id: number
  phone_number: string
  email: string | null
  role: 'super_admin' | 'business_owner' | 'branch_manager' | 'staff' | 'client'
  is_verified: boolean
}

export interface Client {
  id: number
  phone_number: string
  document_type: 'dni' | 'pasaporte' | 'ce'
  document_number: string
  first_name: string
  last_name_paterno: string
  last_name_materno: string
  birth_date: string
  whatsapp_opt_in: boolean
  created_at: string
}

export interface StaffMember {
  id: number
  first_name: string
  last_name: string
  photo: string | null
  bio: string
  specialty: string
  branch: number
  branch_name: string
  is_active: boolean
}

// Tipos de negocio
export interface Business {
  id: number
  name: string
  slug: string
  description: string
  logo: string | null
  cover_image: string | null
  // Branding personalizado
  primary_color: string
  secondary_color: string
  email: string
  phone: string
  website: string
  instagram: string
  facebook: string
  is_verified: boolean
  branches: BranchListItem[]
  branches_count: number
  has_multiple_branches?: boolean
}

export interface Branch {
  id: number
  name: string
  slug: string
  cover_image?: string | null
  description?: string
  address: string
  address_reference?: string
  district: string
  city: string
  country?: string
  postal_code?: string
  latitude: number | null
  longitude: number | null
  full_address?: string
  phone: string
  whatsapp?: string
  email: string
  timezone: string
  is_active: boolean
  is_main?: boolean
  opening_time?: string
  closing_time?: string
  staff_count?: number
  services_count?: number
  // Rating y reseñas
  average_rating?: number | null
  total_reviews?: number
  // Galería de fotos
  photos?: BranchPhoto[]
  // Campos adicionales cuando viene con negocio
  business_name?: string
  business_slug?: string
  business_logo?: string | null
  primary_color?: string
  secondary_color?: string
}

export interface BranchListItem {
  id: number
  name: string
  slug: string
  cover_image?: string | null
  address: string
  district: string
  city: string
  latitude?: number | null
  longitude?: number | null
  is_main?: boolean
  opening_time?: string
  closing_time?: string
  phone?: string
  staff_count?: number
  services_count?: number
  // Rating y resenas
  average_rating?: number | null
  total_reviews?: number
}

// Foto de sucursal para galería
export interface BranchPhoto {
  id: number
  image: string
  caption: string
  is_cover: boolean
  order: number
}

// Tipos de servicio
export interface ServiceCategory {
  id: number
  name: string
  description: string
  icon: string
  order: number
}

export interface Service {
  id: number
  name: string
  description: string
  category: number
  category_name: string
  duration_minutes: number
  price: number
  is_featured: boolean
  gender?: 'M' | 'F' | 'U'
  gender_display?: string
}

export interface StaffProvider {
  id: number
  name: string
  photo?: string | null
  bio?: string
  price?: number
  duration?: number
}

export interface ServiceWithStaff extends Service {
  staff_providers: StaffProvider[]
}

// Tipos de cita
export interface Appointment {
  id: number
  branch: number
  branch_name: string
  business_name: string
  staff: number
  staff_name: string
  service: number
  service_name: string
  start_datetime: string
  end_datetime: string
  duration_minutes: number
  status: AppointmentStatus
  price: number
  notes: string
  can_cancel: boolean
  created_at: string
}

export type AppointmentStatus =
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show'

// Tipos de disponibilidad
export interface AvailabilitySlot {
  datetime: string
  staff_id: number
  staff_name: string
}

export interface DayAvailability {
  date: string
  available: boolean
  slots_count: number
}

// Tipos de respuesta API
export interface AuthResponse {
  success: boolean
  is_registered?: boolean
  access_token?: string
  refresh_token?: string
  registration_token?: string
  user?: User
  client?: Client
  staff?: StaffMember
  message?: string
  error?: string
  pending_approval?: boolean
}

export interface ApiError {
  success: false
  error: {
    code: number
    message: string
    details?: Record<string, string[]>
  }
}

// Tipos de formularios
export type AccountType = 'business_owner' | 'staff'
export type DocumentType = 'dni' | 'pasaporte' | 'ce'

export interface RegisterFormData {
  account_type: AccountType
  document_type: DocumentType
  document_number: string
  first_name: string
  last_name_paterno: string
  last_name_materno?: string
  birth_date: string
  phone_number: string
  email?: string
  // Contrasena (requerida para dueños y profesionales)
  password: string
  password_confirm: string
  // Solo para profesionales
  specialty?: string
  bio?: string
}

export interface RegisterCompleteData extends RegisterFormData {
  registration_token: string
}

export interface BookingFormData {
  branch_id: number
  service_id: number
  staff_id: number
  start_datetime: string
  notes: string
}
