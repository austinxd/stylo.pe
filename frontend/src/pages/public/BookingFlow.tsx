import { useState, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import businessApi, { type Review } from '@/api/business'
import servicesApi from '@/api/services'
import bookingApi, { BookingSummary, AppointmentConfirmation } from '@/api/booking'
import { Logo, Button, Input } from '@/components/ui'
import type { Service, StaffProvider, AvailabilitySlot, BranchPhoto } from '@/types'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  addMonths,
  subMonths,
  getDay,
} from 'date-fns'
import { es } from 'date-fns/locale'

// Iconos
const Icons = {
  Back: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Location: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  ),
  User: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  ),
  PhoneIcon: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  ),
  ChevronRight: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  ),
  Document: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
    </svg>
  ),
  CheckCircle: () => (
    <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
    </svg>
  ),
}

type Step = 'service' | 'staff' | 'datetime' | 'client' | 'otp' | 'success'

// Lightbox component for viewing photos
const PhotoLightbox = ({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: {
  photos: { image: string; caption?: string }[]
  currentIndex: number
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}) => {
  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNext, onPrev])

  const photo = photos[currentIndex]

  return (
    <div
      className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors z-10"
      >
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-4 text-white/80 text-sm font-medium">
        {currentIndex + 1} / {photos.length}
      </div>

      {/* Navigation arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onPrev() }}
            className="absolute left-4 p-3 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onNext() }}
            className="absolute right-4 p-3 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </>
      )}

      {/* Image */}
      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={photo.image}
          alt={photo.caption || 'Foto'}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
        />
        {photo.caption && (
          <p className="text-white/80 text-center mt-3 text-sm">{photo.caption}</p>
        )}
      </div>
    </div>
  )
}

// Import React for useEffect in lightbox
import * as React from 'react'

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Helper para formatear nombre de profesional como "FirstName L."
const formatStaffName = (fullName: string): string => {
  const parts = fullName.trim().split(' ')
  if (parts.length === 1) return parts[0]
  const firstName = parts[0]
  const lastNameInitial = parts[1]?.charAt(0).toUpperCase() || ''
  return lastNameInitial ? `${firstName} ${lastNameInitial}.` : firstName
}

// Labels de género para las secciones
const GENDER_LABELS: Record<string, { title: string; icon: JSX.Element }> = {
  'F': {
    title: 'Mujer',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5a6 6 0 100 7.5M12 12v6m-3 3h6" />
      </svg>
    )
  },
  'M': {
    title: 'Hombre',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    )
  },
  'U': {
    title: 'Unisex',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
      </svg>
    )
  }
}

export default function BookingFlow() {
  const { businessSlug, branchSlug } = useParams<{ businessSlug: string; branchSlug: string }>()

  // Estado del flujo
  const [step, setStep] = useState<Step>('service')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffProvider | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [notes] = useState('')
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // Estado de sesión de reserva
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [bookingSummary, setBookingSummary] = useState<BookingSummary | null>(null)

  // Datos del cliente
  const [clientData, setClientData] = useState({
    phone_number: '+51',
    document_type: 'dni' as 'dni' | 'pasaporte' | 'ce',
    document_number: '',
    first_name: '',
    last_name_paterno: '',
    last_name_materno: '',
    email: '',
    gender: 'M' as 'M' | 'F',
    birth_date: '',
  })

  // Foto del cliente (oculta - solo para uso interno del negocio)
  const [clientPhoto, setClientPhoto] = useState<File | null>(null)

  // Estado de búsqueda de cliente
  const [clientLookupDone, setClientLookupDone] = useState(false)
  const [isExistingClient, setIsExistingClient] = useState(false)

  // OTP
  const [otpCode, setOtpCode] = useState('')
  const [debugOtp, setDebugOtp] = useState<string | null>(null)

  // Confirmación exitosa
  const [confirmedAppointment, setConfirmedAppointment] = useState<AppointmentConfirmation | null>(null)

  // Errores
  const [error, setError] = useState<string | null>(null)

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  // Mobile carousel state
  const [mobileCarouselIndex, setMobileCarouselIndex] = useState(0)
  const carouselRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef(0)
  const touchEndX = useRef(0)

  // Mobile booking modal state
  const [mobileBookingOpen, setMobileBookingOpen] = useState(false)

  // Mobile tab state (Planity style: Servicios, Opiniones, Info)
  type MobileTab = 'servicios' | 'opiniones' | 'info'
  const [mobileTab, setMobileTab] = useState<MobileTab>('servicios')

  // Desktop accordion state for service categories (Planity style)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (categoryKey: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryKey)) {
        newSet.delete(categoryKey)
      } else {
        newSet.add(categoryKey)
      }
      return newSet
    })
  }

  // Obtener datos de la sucursal
  const { data: branch, isLoading: loadingBranch } = useQuery({
    queryKey: ['branch', businessSlug, branchSlug],
    queryFn: () => businessApi.getBranch(businessSlug!, branchSlug!),
    enabled: !!businessSlug && !!branchSlug,
  })

  // Obtener reseñas de la sucursal
  const { data: reviewsData } = useQuery({
    queryKey: ['reviews', branch?.id],
    queryFn: () => businessApi.getBranchReviews(branch!.id),
    enabled: !!branch?.id,
  })

  // Obtener servicios
  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['services', branch?.id],
    queryFn: () => servicesApi.getServices(branch!.id),
    enabled: !!branch?.id,
  })

  // Obtener detalle del servicio con profesionales
  const { data: serviceDetail, isLoading: loadingServiceDetail } = useQuery({
    queryKey: ['service', branch?.id, selectedService?.id],
    queryFn: () => servicesApi.getService(branch!.id, selectedService!.id),
    enabled: !!branch?.id && !!selectedService?.id,
  })

  // Obtener disponibilidad del día
  const { data: availability, isLoading: loadingSlots } = useQuery({
    queryKey: ['availability', branch?.id, selectedService?.id, selectedDate, selectedStaff?.id],
    queryFn: () =>
      servicesApi.getAvailability(
        branch!.id,
        selectedService!.id,
        format(selectedDate!, 'yyyy-MM-dd'),
        selectedStaff?.id
      ),
    enabled: !!branch?.id && !!selectedService?.id && !!selectedDate,
  })

  // Mutation: Iniciar reserva
  const startBooking = useMutation({
    mutationFn: bookingApi.start,
    onSuccess: (data) => {
      setSessionToken(data.session_token)
      setBookingSummary(data.booking_summary)
      setStep('client')
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al iniciar la reserva')
    },
  })

  // Mutation: Enviar OTP
  const sendOtp = useMutation({
    mutationFn: bookingApi.sendOTP,
    onSuccess: (data) => {
      setStep('otp')
      setError(null)
      if (data.debug_otp) {
        setDebugOtp(data.debug_otp)
      }
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al enviar el código')
    },
  })

  // Mutation: Verificar OTP
  const verifyOtp = useMutation({
    mutationFn: bookingApi.verifyOTP,
    onSuccess: (data) => {
      setConfirmedAppointment(data.appointment)
      setStep('success')
      setError(null)
    },
    onError: (err: Error) => {
      setError(err.message || 'Código incorrecto')
    },
  })

  // Mutation: Reenviar OTP
  const resendOtp = useMutation({
    mutationFn: bookingApi.resendOTP,
    onSuccess: (data) => {
      setError(null)
      if (data.debug_otp) {
        setDebugOtp(data.debug_otp)
      }
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al reenviar el código')
    },
  })

  // Mutation: Buscar cliente por documento
  const lookupClient = useMutation({
    mutationFn: bookingApi.lookupClient,
    onSuccess: (data) => {
      setClientLookupDone(true)
      setError(null)
      if (data.found && data.client) {
        // Cliente existe - autocompletar datos
        setIsExistingClient(true)
        setClientData((prev) => ({
          ...prev,
          first_name: data.client!.first_name,
          last_name_paterno: data.client!.last_name_paterno,
          last_name_materno: data.client!.last_name_materno,
          phone_number: data.client!.phone_number || '+51',
          email: data.client!.email,
          gender: data.client!.gender || 'M',
          birth_date: data.client!.birth_date || '',
        }))
      } else {
        // Cliente nuevo - intentar buscar en RENIEC si es DNI
        setIsExistingClient(false)
        if (clientData.document_type === 'dni' && clientData.document_number.length === 8) {
          lookupReniec.mutate({ dni: clientData.document_number })
        }
      }
    },
    onError: (err: Error) => {
      setError(err.message || 'Error al buscar cliente')
    },
  })

  // Mutation: Buscar datos en RENIEC por DNI (para clientes nuevos)
  const lookupReniec = useMutation({
    mutationFn: bookingApi.lookupReniec,
    onSuccess: (data) => {
      if (data.found) {
        // Auto-completar datos del formulario desde RENIEC
        setClientData((prev) => ({
          ...prev,
          first_name: data.first_name || prev.first_name,
          last_name_paterno: data.last_name_paterno || prev.last_name_paterno,
          last_name_materno: data.last_name_materno || prev.last_name_materno,
          gender: data.gender || prev.gender,
          birth_date: data.birth_date || prev.birth_date,
        }))
      }
    },
  })

  // Generar días del calendario
  const calendarDays = useMemo(() => {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)
    const days = eachDayOfInterval({ start, end })

    const firstDayOfWeek = getDay(start)
    const prefixDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1

    const previousMonth = subMonths(currentMonth, 1)
    const endOfPreviousMonth = endOfMonth(previousMonth)

    const prefix = Array.from({ length: prefixDays }, (_, i) => {
      const day = new Date(endOfPreviousMonth)
      day.setDate(endOfPreviousMonth.getDate() - prefixDays + i + 1)
      return day
    })

    return [...prefix, ...days]
  }, [currentMonth])

  // Handlers
  const handleSelectService = (service: Service) => {
    setSelectedService(service)
    setSelectedStaff(null)
    setSelectedDate(null)
    setStep('staff')
  }

  const handleSelectStaff = (staff: StaffProvider | null) => {
    setSelectedStaff(staff)
    setStep('datetime')
  }

  const handleSelectDate = (date: Date) => {
    if (isBefore(date, new Date()) && !isToday(date)) return
    setSelectedDate(date)
  }

  const handleSelectSlot = (slot: AvailabilitySlot) => {
    // Iniciar reserva en el backend
    startBooking.mutate({
      branch_id: branch!.id,
      service_id: selectedService!.id,
      staff_id: slot.staff_id,
      start_datetime: slot.datetime,
      notes,
    })
  }

  const handleSubmitClientData = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validaciones básicas
    if (!clientData.phone_number || clientData.phone_number.length < 10) {
      setError('Ingresa un número de teléfono válido')
      return
    }
    if (!clientData.document_number || clientData.document_number.length < 6) {
      setError('Ingresa un número de documento válido')
      return
    }
    if (!clientData.first_name || !clientData.last_name_paterno) {
      setError('Ingresa tu nombre completo')
      return
    }

    sendOtp.mutate({
      session_token: sessionToken!,
      ...clientData,
      photo: clientPhoto || undefined,
    })
  }

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (otpCode.length !== 6) {
      setError('El código debe tener 6 dígitos')
      return
    }

    verifyOtp.mutate({
      session_token: sessionToken!,
      otp_code: otpCode,
    })
  }

  const handleResendOtp = () => {
    setError(null)
    resendOtp.mutate({ session_token: sessionToken! })
  }

  if (loadingBranch) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-primary-900 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!branch) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-light text-primary-900 mb-4">Sucursal no encontrada</h1>
          <Link to="/">
            <Button>Volver al inicio</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Vista de éxito
  if (step === 'success' && confirmedAppointment) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-2xl border border-neutral-100 p-8">
            <div className="text-accent-500 flex justify-center mb-6">
              <Icons.CheckCircle />
            </div>
            <h1 className="text-2xl font-light text-primary-900 mb-2">
              ¡Reserva confirmada!
            </h1>
            <p className="text-neutral-500 mb-8">
              Te enviamos los detalles por WhatsApp
            </p>

            <div className="text-left space-y-4 mb-8">
              <div className="flex justify-between">
                <span className="text-neutral-600">Negocio</span>
                <span className="font-medium text-primary-900">{confirmedAppointment.business_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Sucursal</span>
                <span className="font-medium text-primary-900">{confirmedAppointment.branch_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Servicio</span>
                <span className="font-medium text-primary-900">{confirmedAppointment.service_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-600">Profesional</span>
                <div className="flex items-center gap-2">
                  {confirmedAppointment.staff_photo ? (
                    <img
                      src={confirmedAppointment.staff_photo}
                      alt={confirmedAppointment.staff_name}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700">
                      <span className="text-xs font-medium">{confirmedAppointment.staff_name.charAt(0)}</span>
                    </div>
                  )}
                  <span className="font-medium text-primary-900">{confirmedAppointment.staff_name}</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Fecha</span>
                <span className="font-medium text-primary-900 capitalize">
                  {format(parseISO(confirmedAppointment.start_datetime), "EEEE d 'de' MMMM", { locale: es })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">Hora</span>
                <span className="font-medium text-primary-900">
                  {format(parseISO(confirmedAppointment.start_datetime), 'HH:mm')}
                </span>
              </div>
              <hr className="border-neutral-100" />
              <div className="flex justify-between text-lg">
                <span className="font-semibold text-primary-900">Total</span>
                <span className="font-semibold text-accent-600">S/ {confirmedAppointment.price}</span>
              </div>
            </div>

            <Link to={`/${businessSlug}`}>
              <Button fullWidth>Volver al negocio</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Brand styles basados en los colores del negocio
  const brandStyles = {
    '--brand-primary': branch.primary_color || '#1a1a2e',
    '--brand-secondary': branch.secondary_color || '#6366f1',
  } as React.CSSProperties

  return (
    <div className="min-h-screen bg-gray-50" style={brandStyles}>
      {/* Header móvil - Solo botón volver + logo (estilo Planity móvil) */}
      <div className="md:hidden bg-white/95 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="flex items-center justify-between h-12 px-4">
          <Link to={`/${businessSlug}`} className="p-1 -ml-1 text-gray-700">
            <Icons.Back />
          </Link>
          <Logo size="sm" variant="isotipo" />
        </div>
      </div>

      {/* Header desktop - Nombre del negocio + dirección */}
      <div className="hidden md:block bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1176px] mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Izquierda: Nombre del negocio + dirección + rating */}
            <Link to={`/${businessSlug}`} className="flex flex-col min-w-0 hover:opacity-80 transition-opacity">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {branch.business_name}
                </span>
                {branch.average_rating && (
                  <span className="flex items-center gap-1 text-xs">
                    <Icons.Star />
                    <span className="font-medium text-gray-700">{branch.average_rating}</span>
                    {branch.total_reviews && (
                      <span className="text-gray-400">({branch.total_reviews})</span>
                    )}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500 truncate">
                {[branch.address, branch.district].filter(Boolean).join(', ')}
              </span>
            </Link>

            {/* Derecha: Logo Stylo */}
            <Logo size="sm" variant="isotipo" />
          </div>
        </div>
      </div>

      {/* Galería de fotos estilo Planity - Layout profesional */}
      {(() => {
        // Construir array de fotos: primero las del API, luego cover_image si existe
        const photos: BranchPhoto[] = branch.photos || []
        const allImages: { image: string; caption?: string; is_cover: boolean }[] = [
          ...photos.map(p => ({ image: p.image, caption: p.caption, is_cover: p.is_cover })),
        ]

        // Si no hay fotos pero hay cover_image, usarlo como única imagen
        if (allImages.length === 0 && branch.cover_image) {
          allImages.push({ image: branch.cover_image, caption: branch.name, is_cover: true })
        }

        // Ordenar: portada primero
        allImages.sort((a, b) => (b.is_cover ? 1 : 0) - (a.is_cover ? 1 : 0))

        if (allImages.length === 0) return null

        const openLightboxAt = (index: number) => {
          setLightboxIndex(index)
          setLightboxOpen(true)
        }

        {/* Mobile Carousel - Planity style */}
        const handleTouchStart = (e: React.TouchEvent) => {
          touchStartX.current = e.touches[0].clientX
        }

        const handleTouchMove = (e: React.TouchEvent) => {
          touchEndX.current = e.touches[0].clientX
        }

        const handleTouchEnd = () => {
          const diff = touchStartX.current - touchEndX.current
          const threshold = 50 // minimum swipe distance

          if (Math.abs(diff) > threshold) {
            if (diff > 0 && mobileCarouselIndex < allImages.length - 1) {
              // Swipe left - next image
              setMobileCarouselIndex(prev => prev + 1)
            } else if (diff < 0 && mobileCarouselIndex > 0) {
              // Swipe right - previous image
              setMobileCarouselIndex(prev => prev - 1)
            }
          }
        }

        const goToSlide = (index: number) => {
          setMobileCarouselIndex(index)
        }

        return (
          <>
            {/* Mobile Layout - visible only on mobile */}
            <div className="md:hidden">
              {/* Mobile: Info del negocio (arriba de todo) */}
              <div className="px-4 py-4 bg-white border-b border-gray-100">
                <h1 className="text-lg font-bold text-gray-900">{branch.business_name}</h1>
                <p className="text-sm text-gray-600 mt-1">
                  {[branch.address, branch.district].filter(Boolean).join(', ')}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  {branch.average_rating && (
                    <div className="flex items-center gap-1">
                      <Icons.Star />
                      <span className="font-semibold text-gray-900">{branch.average_rating}</span>
                      {branch.total_reviews && (
                        <span className="text-gray-500 text-sm">({branch.total_reviews})</span>
                      )}
                    </div>
                  )}
                  {(branch.opening_time || branch.closing_time) && (
                    <span className="text-sm text-gray-500">
                      {branch.opening_time?.slice(0, 5)} - {branch.closing_time?.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile: 3 Tabs de navegación estilo Planity */}
              <div className="bg-white border-b border-gray-200 sticky top-14 z-30">
                <div className="flex">
                  <button
                    onClick={() => setMobileTab('servicios')}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                      mobileTab === 'servicios'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Servicios
                  </button>
                  <button
                    onClick={() => setMobileTab('opiniones')}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                      mobileTab === 'opiniones'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Opiniones {reviewsData?.total_reviews ? `(${reviewsData.total_reviews})` : ''}
                  </button>
                  <button
                    onClick={() => setMobileTab('info')}
                    className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                      mobileTab === 'info'
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Info
                  </button>
                </div>
              </div>

              {/* Mobile: Contenido de tabs */}
              <div>
                {/* Tab: Servicios */}
                {mobileTab === 'servicios' && (
                  <div>
                    {/* Mobile Carousel - SOLO en tab Servicios */}
                    <div
                      ref={carouselRef}
                      className="relative h-[230px] overflow-hidden"
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                    >
                      <div
                        className="flex transition-transform duration-300 ease-out h-full"
                        style={{ transform: `translateX(-${mobileCarouselIndex * 100}%)` }}
                      >
                        {allImages.map((img, idx) => (
                          <button
                            key={idx}
                            onClick={() => openLightboxAt(idx)}
                            className="w-full h-full flex-shrink-0"
                          >
                            <img
                              src={img.image}
                              alt={img.caption || `${branch.name} - Foto ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>

                      {/* Counter indicator */}
                      <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                        {mobileCarouselIndex + 1} / {allImages.length}
                      </div>

                      {/* Dots indicator */}
                      {allImages.length > 1 && allImages.length <= 6 && (
                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                          {allImages.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => goToSlide(idx)}
                              className={`w-1.5 h-1.5 rounded-full transition-all ${
                                idx === mobileCarouselIndex
                                  ? 'bg-white w-3'
                                  : 'bg-white/50'
                              }`}
                            />
                          ))}
                        </div>
                      )}

                      {/* Navigation arrows for mobile */}
                      {allImages.length > 1 && (
                        <>
                          {mobileCarouselIndex > 0 && (
                            <button
                              onClick={() => setMobileCarouselIndex(prev => prev - 1)}
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-md"
                            >
                              <Icons.ChevronLeft />
                            </button>
                          )}
                          {mobileCarouselIndex < allImages.length - 1 && (
                            <button
                              onClick={() => setMobileCarouselIndex(prev => prev + 1)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-md"
                            >
                              <Icons.ChevronRight />
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    {/* Lista de servicios */}
                    <div className="p-4">
                    {loadingServices ? (
                      <div className="flex justify-center py-8">
                        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
                      </div>
                    ) : services && services.length > 0 ? (
                      <div className="space-y-3">
                        {/* Agrupar servicios por categoría */}
                        {Object.entries(
                          services.reduce((acc: Record<string, typeof services>, service) => {
                            const cat = service.category_name || 'Otros'
                            if (!acc[cat]) acc[cat] = []
                            acc[cat].push(service)
                            return acc
                          }, {})
                        ).map(([category, categoryServices]) => (
                          <div key={category}>
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                              {category}
                            </h3>
                            <div className="space-y-2">
                              {categoryServices.map((service) => (
                                <button
                                  key={service.id}
                                  onClick={() => {
                                    setSelectedService(service)
                                    setSelectedStaff(null)
                                    setSelectedDate(null)
                                    setStep('staff')
                                    setMobileBookingOpen(true)
                                  }}
                                  className={`w-full p-4 bg-white rounded-xl border text-left transition-all ${
                                    selectedService?.id === service.id
                                      ? 'border-gray-900 ring-1 ring-gray-900'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h4 className="font-medium text-gray-900">{service.name}</h4>
                                      {service.description && (
                                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                                          {service.description}
                                        </p>
                                      )}
                                      <div className="flex items-center gap-2 mt-2 text-sm text-gray-500">
                                        <span>{service.duration_minutes} min</span>
                                      </div>
                                    </div>
                                    <div className="text-right ml-4">
                                      <span className="font-semibold text-gray-900">
                                        S/ {service.price}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">No hay servicios disponibles</p>
                    )}
                    </div>
                  </div>
                )}

                {/* Tab: Opiniones */}
                {mobileTab === 'opiniones' && (
                  <div className="p-4">
                    {reviewsData?.reviews && reviewsData.reviews.length > 0 ? (
                      <div className="space-y-4">
                        {/* Resumen de calificaciones */}
                        <div className="bg-gray-50 rounded-xl p-4">
                          <div className="flex items-center gap-3">
                            <div className="text-3xl font-bold text-gray-900">
                              {reviewsData.average_rating}
                            </div>
                            <div>
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <svg
                                    key={star}
                                    className={`w-5 h-5 ${
                                      star <= Math.round(reviewsData.average_rating || 0)
                                        ? 'text-yellow-400 fill-current'
                                        : 'text-gray-300'
                                    }`}
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                  >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                              <p className="text-sm text-gray-500 mt-0.5">
                                {reviewsData.total_reviews} opiniones
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Lista de reseñas */}
                        <div className="space-y-4">
                          {reviewsData.reviews.map((review) => (
                            <div key={review.id} className="bg-white border border-gray-100 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="flex items-center gap-0.5">
                                  {[1, 2, 3, 4, 5].map((star) => (
                                    <svg
                                      key={star}
                                      className={`w-4 h-4 ${
                                        star <= review.rating
                                          ? 'text-yellow-400 fill-current'
                                          : 'text-gray-300'
                                      }`}
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                  ))}
                                </div>
                                {review.created_at && (
                                  <span className="text-xs text-gray-400">
                                    {new Date(review.created_at).toLocaleDateString('es-PE', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                )}
                              </div>
                              {review.comment && (
                                <p className="text-sm text-gray-600">{review.comment}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                          </svg>
                        </div>
                        <p className="text-gray-500">Aun no hay opiniones</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: Info */}
                {mobileTab === 'info' && (
                  <div className="p-4 space-y-6">
                    {/* Horarios de atencion */}
                    {(branch.opening_time || branch.closing_time) && (
                      <div className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">Horarios de atencion</h3>
                        </div>
                        <div className="space-y-2 ml-13">
                          {['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map((day, idx) => (
                            <div key={day} className="flex justify-between text-sm">
                              <span className="text-gray-600">{day}</span>
                              <span className="text-gray-900 font-medium">
                                {idx < 6
                                  ? `${branch.opening_time?.slice(0, 5)} - ${branch.closing_time?.slice(0, 5)}`
                                  : 'Cerrado'
                                }
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equipo de trabajo */}
                    {(branch as any).staff && (branch as any).staff.length > 0 && (
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">Nuestro equipo</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {(branch as any).staff.map((staff: { id: number; first_name: string; last_name: string; photo?: string; display_name?: string }) => (
                            <div key={staff.id} className="text-center">
                              <div className="w-16 h-16 mx-auto mb-2 rounded-full overflow-hidden bg-gray-100">
                                {staff.photo ? (
                                  <img
                                    src={staff.photo}
                                    alt={staff.first_name}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl font-medium">
                                    {staff.first_name?.charAt(0)}{staff.last_name?.charAt(0)}
                                  </div>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-900 truncate">{staff.display_name || staff.first_name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ubicacion con mapa */}
                    <div>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Ubicacion</h3>
                          <p className="text-sm text-gray-600">
                            {[branch.address, branch.district, branch.city].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                      {/* Mini mapa placeholder */}
                      <div className="w-full h-40 bg-gray-100 rounded-xl overflow-hidden">
                        {branch.latitude && branch.longitude ? (
                          <iframe
                            width="100%"
                            height="100%"
                            frameBorder="0"
                            style={{ border: 0 }}
                            src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}&q=${branch.latitude},${branch.longitude}&zoom=15`}
                            allowFullScreen
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <div className="text-center">
                              <svg className="w-8 h-8 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                              </svg>
                              <span className="text-sm">Mapa no disponible</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Boton para abrir en Google Maps */}
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([branch.address, branch.district, branch.city].filter(Boolean).join(', '))}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Abrir en Google Maps
                      </a>
                    </div>

                    {/* Contacto */}
                    {(branch.phone || branch.email) && (
                      <div>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">Contacto</h3>
                        </div>
                        <div className="space-y-3">
                          {branch.phone && (
                            <a
                              href={`tel:${branch.phone}`}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                              <span className="text-gray-700 font-medium">{branch.phone}</span>
                            </a>
                          )}
                          {branch.email && (
                            <a
                              href={`mailto:${branch.email}`}
                              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              <span className="text-gray-700 font-medium">{branch.email}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Descripcion / Acerca de */}
                    {branch.description && (
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <h3 className="text-base font-semibold text-gray-900">Acerca de</h3>
                        </div>
                        <p className="text-gray-600 text-sm leading-relaxed">{branch.description}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Desktop Gallery - hidden on mobile */}
            <div className="hidden md:block">
              {/* Una sola imagen: banner horizontal elegante */}
              {allImages.length === 1 && (
                <div className="max-w-[1176px] mx-auto px-4 md:px-6 mt-11">
                  <button
                    onClick={() => openLightboxAt(0)}
                    className="w-full rounded-[12px] overflow-hidden h-[372px] relative group"
                  >
                    <img
                      src={allImages[0].image}
                      alt={allImages[0].caption || branch.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                        </svg>
                        Ver foto
                      </span>
                    </div>
                  </button>
                </div>
              )}

              {/* 2-3 fotos: Layout Planity (imagen grande 66.67% + pequeña 33.33%) */}
              {allImages.length >= 2 && allImages.length <= 3 && (
                <div className="max-w-[1176px] mx-auto px-4 md:px-6 mt-11">
                  <div className="flex gap-2 h-[372px]">
                    {/* Imagen principal - 66.67% del ancho */}
                    <button
                      onClick={() => openLightboxAt(0)}
                      className="w-[66.67%] rounded-[12px] overflow-hidden relative group"
                    >
                      <img
                        src={allImages[0].image}
                        alt={allImages[0].caption || branch.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>
                    {/* Columna de miniaturas - 33.33% del ancho */}
                    <div className="w-[33.33%] flex flex-col gap-2">
                      {allImages.slice(1).map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => openLightboxAt(idx + 1)}
                          className="flex-1 rounded-[12px] overflow-hidden relative group"
                        >
                          <img
                            src={img.image}
                            alt={img.caption || `${branch.name} - Foto ${idx + 2}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* 4+ fotos: Layout Planity clásico (principal grande + grid 2x2) */}
              {allImages.length >= 4 && (
                <div className="max-w-[1176px] mx-auto px-4 md:px-6 mt-11">
                  <div className="flex gap-2 h-[372px]">
                    {/* Imagen principal grande - 50% del ancho */}
                    <button
                      onClick={() => openLightboxAt(0)}
                      className="w-1/2 rounded-[12px] overflow-hidden relative group"
                    >
                      <img
                        src={allImages[0].image}
                        alt={allImages[0].caption || branch.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                    </button>

                    {/* Grid de 4 imágenes - 50% del ancho */}
                    <div className="w-1/2 grid grid-cols-2 gap-2">
                      {allImages.slice(1, 5).map((img, idx) => {
                        const isLast = idx === 3 && allImages.length > 5
                        const remainingCount = allImages.length - 5

                        return (
                          <button
                            key={idx}
                            onClick={() => openLightboxAt(idx + 1)}
                            className="rounded-[12px] overflow-hidden relative group"
                          >
                            <img
                              src={img.image}
                              alt={img.caption || `${branch.name} - Foto ${idx + 2}`}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            {isLast ? (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center group-hover:bg-black/70 transition-colors">
                                <div className="text-center text-white">
                                  <span className="text-2xl md:text-3xl font-bold">+{remainingCount}</span>
                                  <p className="text-xs md:text-sm mt-0.5 opacity-90">Ver más</p>
                                </div>
                              </div>
                            ) : (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}

      {/* Lightbox para ver fotos */}
      {lightboxOpen && branch && (() => {
        const photos: BranchPhoto[] = branch.photos || []
        const allImages: { image: string; caption?: string }[] = [
          ...photos.map(p => ({ image: p.image, caption: p.caption })),
        ]
        if (allImages.length === 0 && branch.cover_image) {
          allImages.push({ image: branch.cover_image, caption: branch.name })
        }

        return (
          <PhotoLightbox
            photos={allImages}
            currentIndex={lightboxIndex}
            onClose={() => setLightboxOpen(false)}
            onNext={() => setLightboxIndex((prev) => (prev + 1) % allImages.length)}
            onPrev={() => setLightboxIndex((prev) => (prev - 1 + allImages.length) % allImages.length)}
          />
        )
      })()}

      {/* Layout principal - Márgenes Planity - SOLO DESKTOP */}
      <div className="hidden md:block max-w-[1176px] mx-auto px-4 md:px-6 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Columna izquierda: Servicios */}
          <div className="lg:col-span-2">
            {/* Título de reserva - estilo Planity */}
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900">
                Reservar en {branch.business_name}
              </h2>
              <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Gratis y confirmación inmediata
              </p>
            </div>

            {loadingServices ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Agrupar servicios por género y luego por categoría - Acordeones estilo Planity */}
                {(() => {
                  // Primero agrupar por género
                  const servicesByGender = services?.reduce((acc, service) => {
                    const gender = service.gender || 'U'
                    if (!acc[gender]) acc[gender] = []
                    acc[gender].push(service)
                    return acc
                  }, {} as Record<string, Service[]>) || {}

                  // Orden de géneros: Mujer primero, luego Hombre, luego Unisex
                  const genderOrder = ['F', 'M', 'U']
                  const sortedGenders = genderOrder.filter(g => servicesByGender[g]?.length > 0)

                  return sortedGenders.map((gender) => {
                    const genderServices = servicesByGender[gender]
                    const genderInfo = GENDER_LABELS[gender] || { title: 'Otros', icon: null }

                    // Agrupar por categoría dentro de cada género
                    const categorizedServices = genderServices.reduce((acc, service) => {
                      const category = service.category_name || 'Otros servicios'
                      if (!acc[category]) acc[category] = []
                      acc[category].push(service)
                      return acc
                    }, {} as Record<string, Service[]>)

                    return (
                      <div key={gender} className="space-y-2">
                        {/* Header de género - estilo Planity con fondo */}
                        <div className="bg-gray-100 rounded-lg px-4 py-3 mb-3">
                          <div className="flex items-center gap-2 text-gray-900">
                            {genderInfo.icon}
                            <h2 className="text-base font-bold">
                              {genderInfo.title}
                            </h2>
                            <span className="text-sm text-gray-500 ml-1">
                              ({genderServices.length})
                            </span>
                          </div>
                        </div>

                        {/* Categorías como Acordeones - estilo Planity */}
                        {Object.entries(categorizedServices).map(([categoryName, categoryServices]) => {
                          const categoryKey = `${gender}-${categoryName}`
                          const isExpanded = expandedCategories.has(categoryKey)
                          const hasSelectedService = categoryServices.some(s => s.id === selectedService?.id)

                          return (
                            <div key={categoryName} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                              {/* Header de categoría - Clickeable para expandir/colapsar */}
                              <button
                                onClick={() => toggleCategory(categoryKey)}
                                className={`w-full px-4 py-4 flex items-center justify-between text-left transition-colors ${
                                  isExpanded ? 'bg-gray-50' : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <h3 className="text-base font-semibold text-gray-900">
                                    {categoryName}
                                  </h3>
                                  <span className="text-sm text-gray-400">
                                    {categoryServices.length} {categoryServices.length === 1 ? 'servicio' : 'servicios'}
                                  </span>
                                  {hasSelectedService && !isExpanded && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                      </svg>
                                      Seleccionado
                                    </span>
                                  )}
                                </div>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
                                  isExpanded ? 'bg-gray-200 rotate-180' : 'bg-gray-100'
                                }`}>
                                  <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </button>

                              {/* Lista de servicios - Expandible */}
                              <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
                                isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                              }`}>
                                <div className="border-t border-gray-100">
                                  {categoryServices.map((service, serviceIdx) => {
                                    const isSelected = selectedService?.id === service.id
                                    const isLastItem = serviceIdx === categoryServices.length - 1

                                    return (
                                      <button
                                        key={service.id}
                                        onClick={() => handleSelectService(service)}
                                        className={`w-full text-left px-4 py-4 flex items-center justify-between gap-4 transition-all ${
                                          isSelected
                                            ? 'bg-indigo-50'
                                            : 'hover:bg-gray-50'
                                        } ${!isLastItem ? 'border-b border-gray-100' : ''}`}
                                        style={isSelected ? { backgroundColor: `color-mix(in srgb, var(--brand-secondary) 10%, white)` } : {}}
                                      >
                                        {/* Info del servicio */}
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <h4 className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-800'}`}>
                                              {service.name}
                                            </h4>
                                            {service.is_featured && (
                                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium bg-amber-50 px-1.5 py-0.5 rounded">
                                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                                Popular
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm text-gray-500">
                                              {service.duration_minutes} min
                                            </span>
                                            {service.description && (
                                              <>
                                                <span className="text-gray-300">•</span>
                                                <p className="text-sm text-gray-400 line-clamp-1">
                                                  {service.description}
                                                </p>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        {/* Precio y checkbox */}
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                          <span className={`text-base font-semibold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                            S/ {service.price}
                                          </span>
                                          <div
                                            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                              isSelected
                                                ? 'border-transparent text-white'
                                                : 'border-gray-300 bg-white'
                                            }`}
                                            style={isSelected ? { backgroundColor: 'var(--brand-secondary)' } : {}}
                                          >
                                            {isSelected && (
                                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                              </svg>
                                            )}
                                          </div>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          {/* Columna derecha: Flujo de reserva (panel lateral) - Estilo Planity - OCULTO en móvil */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-20">
              {/* Panel de reserva */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-lg">
                {/* Header del panel con gradiente */}
                <div
                  className="px-6 py-5 text-white relative overflow-hidden"
                  style={{ background: `linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%)` }}
                >
                  <div className="relative z-10">
                    <h3 className="font-bold text-lg">Tu reserva</h3>
                    {selectedService && (
                      <p className="text-sm text-white/80 mt-1 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        {branch.name}
                      </p>
                    )}
                  </div>
                  {/* Decoración de fondo */}
                  <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full" />
                  <div className="absolute -right-2 -bottom-8 w-16 h-16 bg-white/5 rounded-full" />
                </div>

                {/* Contenido del panel */}
                <div className="p-6">
                  {!selectedService ? (
                    <div className="text-center py-10">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="text-gray-400 text-sm font-medium">
                        Selecciona un servicio
                      </p>
                      <p className="text-gray-400 text-xs mt-1">
                        para comenzar tu reserva
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {/* Servicio seleccionado - estilo card */}
                      <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-900 text-sm leading-tight">{selectedService.name}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-100">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {selectedService.duration_minutes} min
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">S/ {selectedService.price}</p>
                          </div>
                        </div>
                      </div>

                      {/* Progress Steps - estilo Planity minimalista */}
                      <div className="flex items-center justify-between py-3 px-2">
                        {[
                          { key: 'staff', label: 'Profesional', icon: <Icons.User /> },
                          { key: 'datetime', label: 'Fecha', icon: <Icons.Clock /> },
                          { key: 'client', label: 'Datos', icon: <Icons.Document /> },
                        ].map((s, idx) => {
                          const steps: Step[] = ['staff', 'datetime', 'client', 'otp']
                          const currentIdx = steps.indexOf(step)
                          const stepIdx = steps.indexOf(s.key as Step)
                          const isActive = step === s.key
                          const isCompleted = stepIdx < currentIdx

                          return (
                            <div key={s.key} className="flex items-center">
                              <button
                                onClick={() => {
                                  if (isCompleted) {
                                    setStep(s.key as Step)
                                    if (stepIdx < 2) {
                                      setClientLookupDone(false)
                                      setIsExistingClient(false)
                                    }
                                  }
                                }}
                                disabled={!isCompleted && !isActive}
                                className={`flex flex-col items-center gap-1.5 ${
                                  isCompleted ? 'cursor-pointer' : ''
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                                    isActive
                                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                      : isCompleted
                                      ? 'bg-green-500 text-white shadow-md shadow-green-100'
                                      : 'bg-gray-100 text-gray-400'
                                  }`}
                                  style={isActive ? { backgroundColor: 'var(--brand-secondary)' } : {}}
                                >
                                  {isCompleted ? <Icons.Check /> : s.icon}
                                </div>
                                <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                  {s.label}
                                </span>
                              </button>
                              {idx < 2 && (
                                <div className={`w-6 h-0.5 mx-0.5 rounded-full transition-colors ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Error */}
                      {error && (
                        <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                          <p className="text-sm text-red-700">{error}</p>
                        </div>
                      )}

                      {/* Contenido dinámico según el step */}
                      {renderBookingStep()}
                    </div>
                  )}
                </div>
              </div>

              {/* Sección de Reseñas en columna derecha - Estilo Planity */}
              {reviewsData && reviewsData.total_reviews > 0 && (
                <div className="mt-6 bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  {/* Header de reseñas */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-gray-900">Opiniones</h3>
                      <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-full">
                        <Icons.Star />
                        <span className="font-bold text-gray-900 text-sm">{reviewsData.average_rating?.toFixed(1)}</span>
                        <span className="text-gray-500 text-xs">({reviewsData.total_reviews})</span>
                      </div>
                    </div>
                  </div>

                  {/* Lista de reseñas - máximo 3 visibles */}
                  <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                    {reviewsData.reviews?.slice(0, 5).map((review: Review) => (
                      <div key={review.id} className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-medium text-gray-600">
                              {review.client_name?.charAt(0).toUpperCase() || 'C'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            {/* Nombre y rating */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-gray-900 text-sm truncate">
                                {review.client_name || 'Cliente'}
                              </span>
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <svg
                                    key={star}
                                    className={`w-3.5 h-3.5 ${star <= review.rating ? 'text-amber-400' : 'text-gray-200'}`}
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                  >
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                ))}
                              </div>
                            </div>
                            {/* Fecha */}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {review.created_at ? format(parseISO(review.created_at), "d MMM yyyy", { locale: es }) : ''}
                            </p>
                            {/* Comentario */}
                            {review.comment && (
                              <p className="text-sm text-gray-600 mt-2 line-clamp-3">
                                {review.comment}
                              </p>
                            )}
                            {/* Servicio */}
                            {review.service_name && (
                              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                                </svg>
                                {review.service_name}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Ver todas las opiniones */}
                  {reviewsData.total_reviews > 5 && (
                    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                      <button className="w-full text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors flex items-center justify-center gap-1">
                        Ver las {reviewsData.total_reviews} opiniones
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sección de información - Ubicación y contacto (después de servicios como Planity) - SOLO DESKTOP */}
      <div className="hidden md:block bg-gray-50 border-t border-gray-200 mt-12">
        <div className="max-w-[1176px] mx-auto px-4 md:px-6 py-12">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Información del establecimiento</h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Columna izquierda: Dirección y contacto */}
            <div className="space-y-5">
              {branch.address && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 flex-shrink-0">
                    <Icons.Location />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Dirección</p>
                    <p className="text-gray-600 mt-0.5">{branch.address}</p>
                    {branch.district && (
                      <p className="text-gray-500 text-sm">{branch.district}, {branch.city}</p>
                    )}
                  </div>
                </div>
              )}
              {branch.phone && (
                <a
                  href={`tel:${branch.phone}`}
                  className="flex items-start gap-4 group"
                >
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-green-600 flex-shrink-0 group-hover:bg-green-50 transition-colors">
                    <Icons.PhoneIcon />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Teléfono</p>
                    <p className="text-gray-600 mt-0.5 group-hover:text-green-600 transition-colors">{branch.phone}</p>
                  </div>
                </a>
              )}
              {(branch.opening_time || branch.closing_time) && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-600 flex-shrink-0">
                    <Icons.Clock />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Horario</p>
                    <p className="text-gray-600 mt-0.5">
                      {branch.opening_time?.slice(0, 5)} - {branch.closing_time?.slice(0, 5)}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Columna derecha: Mapa */}
            {branch.latitude && branch.longitude && (
              <div className="h-48 md:h-64 rounded-xl overflow-hidden shadow-sm border border-gray-200">
                <a
                  href={(branch as any).google_maps_url || `https://www.google.com/maps?q=${branch.latitude},${branch.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full h-full relative group"
                >
                  <img
                    src={`https://maps.googleapis.com/maps/api/staticmap?center=${branch.latitude},${branch.longitude}&zoom=15&size=600x400&markers=color:red%7C${branch.latitude},${branch.longitude}&key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''}`}
                    alt="Ubicación"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white px-4 py-2 rounded-lg text-sm font-medium text-gray-900 shadow-lg">
                      Ver en Google Maps
                    </span>
                  </div>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============ MÓVIL: Modal/Drawer de Reserva ============ */}
      {mobileBookingOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={() => setMobileBookingOpen(false)}
          />

          {/* Drawer desde abajo */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[90vh] overflow-hidden animate-slide-up">
            {/* Handle del drawer */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header del drawer */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100">
              <h3 className="font-bold text-lg text-gray-900">Tu reserva</h3>
              <button
                onClick={() => setMobileBookingOpen(false)}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido del drawer */}
            <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-4">
              {!selectedService ? (
                /* Sin servicio seleccionado */
                <div className="text-center py-10">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center mx-auto mb-5 shadow-inner">
                    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm font-medium">Selecciona un servicio</p>
                  <p className="text-gray-400 text-xs mt-1">para comenzar tu reserva</p>
                  <button
                    onClick={() => setMobileBookingOpen(false)}
                    className="mt-6 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium text-sm"
                  >
                    Ver servicios
                  </button>
                </div>
              ) : (
                /* Con servicio seleccionado */
                <div className="space-y-4">
                  {/* Servicio seleccionado */}
                  <div className="p-4 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-tight">{selectedService.name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-100">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {selectedService.duration_minutes} min
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">S/ {selectedService.price}</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Steps */}
                  <div className="flex items-center justify-between py-3 px-2">
                    {[
                      { key: 'staff', label: 'Profesional', icon: <Icons.User /> },
                      { key: 'datetime', label: 'Fecha', icon: <Icons.Clock /> },
                      { key: 'client', label: 'Datos', icon: <Icons.Document /> },
                    ].map((s, idx) => {
                      const steps: Step[] = ['staff', 'datetime', 'client', 'otp']
                      const currentIdx = steps.indexOf(step)
                      const stepIdx = steps.indexOf(s.key as Step)
                      const isActive = step === s.key
                      const isCompleted = stepIdx < currentIdx

                      return (
                        <div key={s.key} className="flex items-center">
                          <button
                            onClick={() => {
                              if (isCompleted) {
                                setStep(s.key as Step)
                                if (stepIdx < 2) {
                                  setClientLookupDone(false)
                                  setIsExistingClient(false)
                                }
                              }
                            }}
                            disabled={!isCompleted && !isActive}
                            className={`flex flex-col items-center gap-1.5 ${
                              isCompleted ? 'cursor-pointer' : ''
                            }`}
                          >
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 ${
                                isActive
                                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                                  : isCompleted
                                  ? 'bg-green-500 text-white shadow-md shadow-green-100'
                                  : 'bg-gray-100 text-gray-400'
                              }`}
                              style={isActive ? { backgroundColor: 'var(--brand-secondary)' } : {}}
                            >
                              {isCompleted ? <Icons.Check /> : s.icon}
                            </div>
                            <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                              {s.label}
                            </span>
                          </button>
                          {idx < 2 && (
                            <div className={`w-6 h-0.5 mx-0.5 rounded-full transition-colors ${isCompleted ? 'bg-green-400' : 'bg-gray-200'}`} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Contenido dinámico según el step */}
                  {renderBookingStep()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )

  // Función para renderizar el paso actual del booking
  function renderBookingStep() {
    // Step: Profesional
    if (step === 'staff') {
      // Mostrar loading mientras carga serviceDetail
      if (loadingServiceDetail) {
        return (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700 mb-3">Elige un profesional</p>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          </div>
        )
      }

      return (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Elige un profesional</p>

          <button
            onClick={() => handleSelectStaff(null)}
            className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-all text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                <Icons.User />
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">Sin preferencia</p>
                <p className="text-xs text-gray-500">Primer disponible</p>
              </div>
            </div>
          </button>

          {serviceDetail?.staff_providers?.map((staff) => (
            <button
              key={staff.id}
              onClick={() => handleSelectStaff(staff)}
              className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-all text-left"
            >
              <div className="flex items-center gap-3">
                {staff.photo ? (
                  <img src={staff.photo} alt={formatStaffName(staff.name)} className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                    <span className="text-sm font-medium">{staff.name.charAt(0)}</span>
                  </div>
                )}
                <div>
                  <p className="font-medium text-gray-900 text-sm">{formatStaffName(staff.name)}</p>
                  {staff.bio && <p className="text-xs text-gray-500 line-clamp-1">{staff.bio}</p>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )
    }

    // Step: Fecha y Hora
    if (step === 'datetime') {
      return (
        <div className="space-y-4">
          {/* Info del profesional seleccionado con foto */}
          {selectedStaff ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              {selectedStaff.photo ? (
                <img src={selectedStaff.photo} alt={formatStaffName(selectedStaff.name)} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
                  <span className="text-sm font-medium">{selectedStaff.name.charAt(0)}</span>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-500">Con</p>
                <p className="font-medium text-gray-900 text-sm">{formatStaffName(selectedStaff.name)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-700">Sin preferencia de profesional</p>
          )}

          {/* Mini calendario */}
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
                disabled={isSameMonth(currentMonth, new Date())}
              >
                <Icons.ChevronLeft />
              </button>
              <span className="font-medium text-gray-900 capitalize text-sm">
                {format(currentMonth, 'MMMM yyyy', { locale: es })}
              </span>
              <button
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <Icons.ChevronRight />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                  {day.charAt(0)}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, currentMonth)
                const isPast = isBefore(day, new Date()) && !isToday(day)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const dayIsToday = isToday(day)

                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectDate(day)}
                    disabled={!isCurrentMonth || isPast}
                    className={`aspect-square flex items-center justify-center rounded text-xs transition-all ${
                      !isCurrentMonth
                        ? 'text-gray-300'
                        : isPast
                        ? 'text-gray-300 cursor-not-allowed'
                        : isSelected
                        ? 'bg-indigo-600 text-white font-semibold'
                        : dayIsToday
                        ? 'bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200'
                        : 'hover:bg-gray-200 text-gray-900'
                    }`}
                    style={isSelected ? { backgroundColor: 'var(--brand-secondary)' } : {}}
                  >
                    {format(day, 'd')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Horarios */}
          {selectedDate && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 capitalize">
                {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
              </p>
              {loadingSlots ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : availability?.slots && availability.slots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                  {availability.slots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectSlot(slot)}
                      disabled={startBooking.isPending}
                      className="p-2 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-center transition-all disabled:opacity-50 text-sm"
                    >
                      {format(parseISO(slot.datetime), 'HH:mm')}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No hay horarios disponibles
                </p>
              )}

              {startBooking.isPending && (
                <div className="flex items-center justify-center gap-2 text-gray-500 mt-3">
                  <div className="w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Reservando...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )
    }

    // Step: Datos del Cliente
    if (step === 'client' && bookingSummary) {
      return (
        <div className="space-y-4">
          {/* Resumen compacto con foto del profesional */}
          <div className="p-3 bg-green-50 rounded-lg border border-green-100">
            <div className="flex items-center gap-3">
              {bookingSummary.staff_photo ? (
                <img
                  src={bookingSummary.staff_photo}
                  alt={bookingSummary.staff_name}
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-green-200 flex items-center justify-center text-green-700 flex-shrink-0">
                  <span className="text-sm font-medium">{bookingSummary.staff_name.charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-green-800 truncate">
                  {formatStaffName(bookingSummary.staff_name)}
                </p>
                <p className="text-xs text-green-600">
                  {format(parseISO(bookingSummary.start_datetime), "d MMM 'a las' HH:mm", { locale: es })}
                </p>
              </div>
            </div>
          </div>

          {/* Fase 1: Buscar cliente */}
          {!clientLookupDone ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Identifícate</p>
              <div>
                <label className="text-xs text-gray-500">Tipo de documento</label>
                <select
                  value={clientData.document_type}
                  onChange={(e) => setClientData({ ...clientData, document_type: e.target.value as 'dni' | 'pasaporte' | 'ce' })}
                  className="input text-sm mt-1"
                >
                  <option value="dni">DNI</option>
                  <option value="pasaporte">Pasaporte</option>
                  <option value="ce">Carné de Extranjería</option>
                </select>
              </div>
              <Input
                label="Número de documento"
                type="text"
                value={clientData.document_number}
                onChange={(e) => setClientData({ ...clientData, document_number: e.target.value })}
                placeholder={clientData.document_type === 'dni' ? '12345678' : 'ABC123456'}
              />
              <Button
                fullWidth
                loading={lookupClient.isPending}
                onClick={() => {
                  if (!clientData.document_number || clientData.document_number.length < 6) {
                    setError('Documento inválido')
                    return
                  }
                  setError(null)
                  lookupClient.mutate({
                    document_type: clientData.document_type,
                    document_number: clientData.document_number,
                  })
                }}
              >
                Continuar
              </Button>
            </div>
          ) : lookupReniec.isPending ? (
            /* Loading: Buscando datos en RENIEC */
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <p className="text-sm text-gray-500">Buscando tus datos...</p>
            </div>
          ) : (
            /* Fase 2: Formulario completo */
            <form onSubmit={handleSubmitClientData} className="space-y-3">
              {isExistingClient && (
                <div className="p-2 bg-indigo-50 rounded-lg text-center">
                  <p className="text-xs text-indigo-700 font-medium">¡Bienvenido de vuelta!</p>
                </div>
              )}

              <div className="p-2 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Documento</p>
                <p className="text-sm font-medium text-gray-900">
                  {clientData.document_type.toUpperCase()}: {clientData.document_number}
                </p>
              </div>

              <Input
                label="WhatsApp"
                type="tel"
                value={clientData.phone_number}
                onChange={(e) => setClientData({ ...clientData, phone_number: e.target.value })}
                placeholder="+51987654321"
              />
              <Input
                label="Nombres"
                type="text"
                value={clientData.first_name}
                onChange={(e) => setClientData({ ...clientData, first_name: e.target.value })}
                placeholder="Juan Carlos"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Apellido paterno"
                  type="text"
                  value={clientData.last_name_paterno}
                  onChange={(e) => setClientData({ ...clientData, last_name_paterno: e.target.value })}
                  placeholder="Pérez"
                />
                <Input
                  label="Apellido materno"
                  type="text"
                  value={clientData.last_name_materno}
                  onChange={(e) => setClientData({ ...clientData, last_name_materno: e.target.value })}
                  placeholder="López"
                />
              </div>
              <Input
                label="Email (opcional)"
                type="email"
                value={clientData.email}
                onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
                placeholder="juan@email.com"
              />
              <Input
                label="Fecha de nacimiento (opcional)"
                type="date"
                value={clientData.birth_date}
                onChange={(e) => setClientData({ ...clientData, birth_date: e.target.value })}
              />

              {/* Campo de foto oculto - solo visible como opción discreta */}
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) setClientPhoto(file)
                    }}
                    className="hidden"
                  />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  {clientPhoto ? (
                    <span className="text-green-600">Foto agregada</span>
                  ) : (
                    <span>Agregar foto (opcional)</span>
                  )}
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClientLookupDone(false)
                    setIsExistingClient(false)
                    setClientPhoto(null)
                    setClientData((prev) => ({
                      ...prev,
                      first_name: '',
                      last_name_paterno: '',
                      last_name_materno: '',
                      phone_number: '+51',
                      email: '',
                      birth_date: '',
                    }))
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Volver
                </button>
                <Button type="submit" fullWidth loading={sendOtp.isPending}>
                  Verificar
                </Button>
              </div>
            </form>
          )}
        </div>
      )
    }

    // Step: Verificar OTP
    if (step === 'otp') {
      return (
        <div className="space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mx-auto">
            <Icons.Phone />
          </div>

          <div>
            <p className="text-sm font-medium text-gray-900">Verifica tu WhatsApp</p>
            <p className="text-xs text-gray-500 mt-1">
              Código enviado a {clientData.phone_number}
            </p>
          </div>

          {debugOtp && (
            <div className="p-2 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-700">
                DEV: <strong>{debugOtp}</strong>
              </p>
            </div>
          )}

          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="input text-center text-xl tracking-[0.3em] font-mono"
              maxLength={6}
              autoFocus
            />
            <Button type="submit" fullWidth loading={verifyOtp.isPending}>
              Confirmar
            </Button>
          </form>

          <button
            onClick={handleResendOtp}
            disabled={resendOtp.isPending}
            className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
          >
            {resendOtp.isPending ? 'Enviando...' : 'Reenviar código'}
          </button>
        </div>
      )
    }

    return null
  }
}
