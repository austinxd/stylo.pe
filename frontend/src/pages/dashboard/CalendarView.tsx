import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '@/api/client'
import {
  format,
  parseISO,
  addDays,
  subDays,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  isToday
} from 'date-fns'
import { es } from 'date-fns/locale'

interface Branch {
  id: number
  name: string
  opening_time: string
  closing_time: string
}

interface Staff {
  id: number
  first_name: string
  last_name: string
  photo: string | null
  calendar_color: string
}

interface Appointment {
  id: number
  start_datetime: string
  end_datetime: string
  status: string
  client_name: string
  client_photo: string | null
  service_name: string
  staff_name: string
  staff: number
}

type ViewMode = 'day' | 'month'

export default function CalendarView() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)

  // Obtener sucursales
  const { data: branches = [], isLoading: branchesLoading, error: branchesError } = useQuery<Branch[]>({
    queryKey: ['dashboard', 'branches'],
    queryFn: async () => {
      const response = await apiClient.get('/dashboard/branches/')
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.results || []
    },
  })

  // Seleccionar automáticamente la primera sucursal
  useEffect(() => {
    if (branches.length > 0 && selectedBranch === null) {
      setSelectedBranch(branches[0].id)
    }
  }, [branches, selectedBranch])

  // Obtener staff de la sucursal seleccionada
  const { data: staffMembers = [] } = useQuery<Staff[]>({
    queryKey: ['dashboard', 'branch-staff', selectedBranch],
    queryFn: async () => {
      if (!selectedBranch) return []
      const response = await apiClient.get(`/dashboard/branches/${selectedBranch}/staff/`)
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.results || []
    },
    enabled: !!selectedBranch,
  })

  // Seleccionar automáticamente el primer profesional en móvil
  useEffect(() => {
    if (staffMembers.length > 0 && selectedStaffId === null) {
      setSelectedStaffId(staffMembers[0].id)
    }
  }, [staffMembers, selectedStaffId])

  // Obtener citas del día (para vista diaria)
  const { data: dayAppointments = [], isLoading: dayAppointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ['dashboard', 'calendar', selectedBranch, format(selectedDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!selectedBranch) return []
      const response = await apiClient.get(
        `/dashboard/branches/${selectedBranch}/calendar/`,
        { params: { date: format(selectedDate, 'yyyy-MM-dd') } }
      )
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.results || []
    },
    enabled: !!selectedBranch && viewMode === 'day',
  })

  // Obtener citas del mes (para vista mensual)
  const monthStart = startOfMonth(selectedDate)
  const monthEnd = endOfMonth(selectedDate)

  const { data: monthAppointments = [], isLoading: monthAppointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ['dashboard', 'calendar-month', selectedBranch, format(monthStart, 'yyyy-MM')],
    queryFn: async () => {
      if (!selectedBranch) return []
      const response = await apiClient.get(
        `/dashboard/branches/${selectedBranch}/calendar/`,
        {
          params: {
            start_date: format(monthStart, 'yyyy-MM-dd'),
            end_date: format(monthEnd, 'yyyy-MM-dd')
          }
        }
      )
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.results || []
    },
    enabled: !!selectedBranch && viewMode === 'month',
  })

  const _appointments = viewMode === 'day' ? dayAppointments : monthAppointments
  void _appointments // used in render
  const isLoading = branchesLoading || (viewMode === 'day' ? dayAppointmentsLoading : monthAppointmentsLoading)

  // Obtener horarios de la sucursal seleccionada
  const selectedBranchData = branches.find(b => b.id === selectedBranch)
  const openingHour = selectedBranchData?.opening_time
    ? parseInt(selectedBranchData.opening_time.split(':')[0])
    : 8
  const closingHour = selectedBranchData?.closing_time
    ? parseInt(selectedBranchData.closing_time.split(':')[0]) + 1
    : 20

  // Generar horas del día (intervalos de 30 minutos)
  const timeSlots = useMemo(() => {
    const slots: string[] = []
    for (let h = openingHour; h < closingHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`)
      slots.push(`${h.toString().padStart(2, '0')}:30`)
    }
    return slots
  }, [openingHour, closingHour])

  // Agrupar citas por staff (para vista diaria)
  const appointmentsByStaff = useMemo(() => {
    const grouped: Record<number, Appointment[]> = {}
    staffMembers.forEach(staff => {
      grouped[staff.id] = []
    })
    dayAppointments.forEach(apt => {
      if (grouped[apt.staff]) {
        grouped[apt.staff].push(apt)
      }
    })
    return grouped
  }, [dayAppointments, staffMembers])

  // Agrupar citas por día (para vista mensual)
  const appointmentsByDay = useMemo(() => {
    const grouped: Record<string, Appointment[]> = {}
    monthAppointments.forEach(apt => {
      const dateKey = format(parseISO(apt.start_datetime), 'yyyy-MM-dd')
      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }
      grouped[dateKey].push(apt)
    })
    return grouped
  }, [monthAppointments])

  // Generar días del mes para el calendario
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(selectedDate), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 })
    const days: Date[] = []
    let current = start
    while (current <= end) {
      days.push(current)
      current = addDays(current, 1)
    }
    return days
  }, [selectedDate])

  // Calcular posición y altura de una cita
  const getAppointmentStyle = (apt: Appointment) => {
    const startTime = parseISO(apt.start_datetime)
    const endTime = parseISO(apt.end_datetime)

    const startMinutes = startTime.getHours() * 60 + startTime.getMinutes()
    const endMinutes = endTime.getHours() * 60 + endTime.getMinutes()
    const dayStartMinutes = openingHour * 60

    // Cada slot de 30 min = 40px de altura
    const slotHeight = 40
    const top = ((startMinutes - dayStartMinutes) / 30) * slotHeight
    const height = ((endMinutes - startMinutes) / 30) * slotHeight

    return {
      top: `${top}px`,
      height: `${Math.max(height, slotHeight)}px`, // Mínimo 1 slot
    }
  }

  // Navegación de fechas
  const goToPreviousDay = () => setSelectedDate(subDays(selectedDate, 1))
  const goToNextDay = () => setSelectedDate(addDays(selectedDate, 1))
  const goToPreviousMonth = () => setSelectedDate(subMonths(selectedDate, 1))
  const goToNextMonth = () => setSelectedDate(addMonths(selectedDate, 1))
  const goToToday = () => setSelectedDate(new Date())

  // Click en un día del calendario mensual
  const handleDayClick = (day: Date) => {
    setSelectedDate(day)
    setViewMode('day')
  }

  if (branchesError) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error al cargar las sucursales</p>
        <p className="text-gray-500 text-sm">
          Verifica que tengas permisos para acceder al dashboard.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header con controles */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex items-center gap-4">
          {/* Selector de sucursal */}
          <select
            value={selectedBranch || ''}
            onChange={(e) => setSelectedBranch(Number(e.target.value) || null)}
            className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Selecciona sucursal</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>

          {/* Selector de vista */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'day'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Dia
            </button>
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Mes
            </button>
          </div>
        </div>

        {/* Navegación de fecha */}
        <div className="flex items-center gap-2">
          <button
            onClick={viewMode === 'day' ? goToPreviousDay : goToPreviousMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            onClick={goToToday}
            className="px-3 py-1 text-sm bg-primary-100 text-primary-700 rounded-lg hover:bg-primary-200 transition-colors"
          >
            Hoy
          </button>

          {viewMode === 'day' ? (
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(new Date(e.target.value))}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          ) : (
            <span className="px-4 py-2 font-medium text-gray-900 capitalize">
              {format(selectedDate, 'MMMM yyyy', { locale: es })}
            </span>
          )}

          <button
            onClick={viewMode === 'day' ? goToNextDay : goToNextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Info de fecha/citas */}
        <div className="text-right">
          {viewMode === 'day' ? (
            <>
              <p className="text-lg font-semibold text-gray-900">
                {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
              </p>
              <p className="text-sm text-gray-500">
                {dayAppointments.length} cita{dayAppointments.length !== 1 ? 's' : ''} programada{dayAppointments.length !== 1 ? 's' : ''}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {format(selectedDate, "MMMM yyyy", { locale: es })}
              </p>
              <p className="text-sm text-gray-500">
                {monthAppointments.length} cita{monthAppointments.length !== 1 ? 's' : ''} en el mes
              </p>
            </>
          )}
        </div>
      </div>

      {/* Contenido del calendario */}
      {selectedBranch ? (
        isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : viewMode === 'month' ? (
          /* === VISTA MENSUAL === */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col">
            {/* Header días de la semana */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
              {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map((day) => (
                <div key={day} className="p-3 text-center">
                  <span className="text-xs font-medium text-gray-500 uppercase">{day}</span>
                </div>
              ))}
            </div>

            {/* Grid de días */}
            <div className="grid grid-cols-7 flex-1">
              {calendarDays.map((day, idx) => {
                const dateKey = format(day, 'yyyy-MM-dd')
                const dayAppts = appointmentsByDay[dateKey] || []
                const isCurrentMonth = isSameMonth(day, selectedDate)
                const isSelected = isSameDay(day, selectedDate)
                const isTodayDate = isToday(day)

                return (
                  <div
                    key={idx}
                    onClick={() => handleDayClick(day)}
                    className={`min-h-[100px] border-b border-r border-gray-100 p-2 cursor-pointer transition-colors hover:bg-gray-50 ${
                      !isCurrentMonth ? 'bg-gray-50/50' : ''
                    } ${isSelected ? 'bg-primary-50' : ''}`}
                  >
                    {/* Número del día */}
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                          isTodayDate
                            ? 'bg-primary-600 text-white'
                            : isCurrentMonth
                            ? 'text-gray-900'
                            : 'text-gray-400'
                        }`}
                      >
                        {format(day, 'd')}
                      </span>
                      {dayAppts.length > 0 && (
                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded-full font-medium">
                          {dayAppts.length}
                        </span>
                      )}
                    </div>

                    {/* Preview de citas (máximo 3) */}
                    <div className="space-y-1">
                      {dayAppts.slice(0, 3).map((apt) => {
                        const staffMember = staffMembers.find(s => s.id === apt.staff)
                        const color = staffMember?.calendar_color || '#3B82F6'
                        return (
                          <div
                            key={apt.id}
                            className="text-[10px] px-1.5 py-0.5 rounded truncate"
                            style={{
                              backgroundColor: `${color}20`,
                              borderLeft: `2px solid ${color}`,
                            }}
                            title={`${format(parseISO(apt.start_datetime), 'HH:mm')} - ${apt.client_name}`}
                          >
                            <span className="font-medium">{format(parseISO(apt.start_datetime), 'HH:mm')}</span>
                            {' '}{apt.client_name.split(' ')[0]}
                          </div>
                        )
                      })}
                      {dayAppts.length > 3 && (
                        <div className="text-[10px] text-gray-500 pl-1.5">
                          +{dayAppts.length - 3} mas...
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : staffMembers.length === 0 ? (
          /* Sin profesionales */
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Sin profesionales</h3>
            <p className="text-gray-500">
              Agrega profesionales a esta sucursal para ver el calendario
            </p>
          </div>
        ) : (
          /* === VISTA DIARIA === */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex-1 flex flex-col">
            {/* === MÓVIL: Tabs por profesional === */}
            <div className="lg:hidden">
              {/* Tabs de profesionales */}
              <div className="flex overflow-x-auto border-b border-gray-200 bg-gray-50 p-2 gap-2 scrollbar-hide">
                {staffMembers.map((staff) => (
                  <button
                    key={staff.id}
                    onClick={() => setSelectedStaffId(staff.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-all flex-shrink-0 ${
                      selectedStaffId === staff.id
                        ? 'bg-white shadow-sm border border-gray-200'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    {staff.photo ? (
                      <img
                        src={staff.photo}
                        alt={staff.first_name}
                        className="w-7 h-7 rounded-full object-cover"
                        style={{ border: `2px solid ${staff.calendar_color || '#3B82F6'}` }}
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium"
                        style={{ backgroundColor: staff.calendar_color || '#3B82F6' }}
                      >
                        {staff.first_name.charAt(0)}
                      </div>
                    )}
                    <span className={`text-sm font-medium ${selectedStaffId === staff.id ? 'text-gray-900' : 'text-gray-600'}`}>
                      {staff.first_name?.split(' ')[0]}
                    </span>
                  </button>
                ))}
              </div>

              {/* Lista de citas del profesional seleccionado */}
              <div className="p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {selectedStaffId && appointmentsByStaff[selectedStaffId]?.length > 0 ? (
                  <div className="space-y-3">
                    {appointmentsByStaff[selectedStaffId]
                      .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())
                      .map((apt) => {
                        const staffMember = staffMembers.find(s => s.id === apt.staff)
                        const staffColor = staffMember?.calendar_color || '#3B82F6'
                        return (
                          <div
                            key={apt.id}
                            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                            style={{ borderLeftWidth: '4px', borderLeftColor: staffColor }}
                          >
                            <div className="flex items-start gap-3">
                              {/* Foto del cliente */}
                              {apt.client_photo ? (
                                <img
                                  src={apt.client_photo}
                                  alt={apt.client_name}
                                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-lg text-gray-500 font-medium">
                                    {apt.client_name?.charAt(0)?.toUpperCase() || '?'}
                                  </span>
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="font-semibold text-gray-900 truncate">{apt.client_name}</p>
                                  <span className="text-sm font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                                    {format(parseISO(apt.start_datetime), 'HH:mm')}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 truncate">{apt.service_name}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                  {format(parseISO(apt.start_datetime), 'HH:mm')} - {format(parseISO(apt.end_datetime), 'HH:mm')}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-4">📅</div>
                    <p className="text-gray-500">Sin citas para hoy</p>
                  </div>
                )}
              </div>
            </div>

            {/* === DESKTOP: Vista de columnas === */}
            <div className="hidden lg:flex lg:flex-col lg:flex-1">
              {/* Header con nombres de profesionales */}
              <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                {/* Columna de horas */}
                <div className="w-14 flex-shrink-0 p-2 border-r border-gray-200">
                  <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Hora</span>
                </div>

                {/* Columnas de profesionales */}
                {staffMembers.map((staff) => (
                  <div
                    key={staff.id}
                    className="flex-1 min-w-[150px] p-3 border-r border-gray-200 last:border-r-0"
                  >
                    <div className="flex items-center gap-2">
                      {/* Avatar o indicador de color */}
                      {staff.photo ? (
                        <img
                          src={staff.photo}
                          alt={staff.first_name}
                          className="w-8 h-8 rounded-full object-cover"
                          style={{ border: `2px solid ${staff.calendar_color || '#3B82F6'}` }}
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                          style={{ backgroundColor: staff.calendar_color || '#3B82F6' }}
                        >
                          {staff.first_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: staff.calendar_color || '#3B82F6' }}
                        />
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {staff.first_name?.split(' ')[0]} {staff.last_name?.charAt(0)}.
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Grid de horarios */}
              <div className="flex-1 overflow-auto">
                <div className="flex relative">
                  {/* Columna de horas - estilo Planity */}
                  <div className="w-14 flex-shrink-0 border-r border-gray-200">
                    {timeSlots.map((time, idx) => {
                      const isFullHour = idx % 2 === 0
                      return (
                        <div
                          key={time}
                          className="h-10 relative"
                        >
                          {isFullHour && (
                            <span className="absolute -top-2 right-2 text-[11px] text-gray-400 font-medium bg-white px-1">
                              {time}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Columnas de profesionales con citas */}
                  {staffMembers.map((staff) => (
                    <div
                      key={staff.id}
                      className="flex-1 min-w-[150px] border-r border-gray-100 last:border-r-0 relative"
                    >
                      {/* Grid de fondo - líneas horizontales */}
                      {timeSlots.map((time, idx) => {
                        const isFullHour = idx % 2 === 0
                        return (
                          <div
                            key={time}
                            className={`h-10 ${
                              isFullHour
                                ? 'border-t border-gray-200'
                                : 'border-t border-dashed border-gray-100'
                            }`}
                          />
                        )
                      })}

                      {/* Citas posicionadas absolutamente */}
                      <div className="absolute inset-0 px-1">
                        {appointmentsByStaff[staff.id]?.map((apt) => {
                          const style = getAppointmentStyle(apt)
                          const staffColor = staff.calendar_color || '#3B82F6'
                          // Generar colores claros basados en el color del profesional
                          const bgColor = `${staffColor}15` // 15 = ~8% opacity
                          const borderColor = staffColor

                          return (
                            <div
                              key={apt.id}
                              className="absolute left-1 right-1 rounded border-l-[3px] px-2 py-1 overflow-hidden cursor-pointer hover:shadow-md transition-shadow bg-white"
                              style={{
                                ...style,
                                borderLeftColor: borderColor,
                                backgroundColor: bgColor,
                              }}
                              title={`${apt.client_name} - ${apt.service_name}`}
                            >
                              <div className="flex items-start gap-1.5">
                                {/* Foto del cliente */}
                                {apt.client_photo ? (
                                  <img
                                    src={apt.client_photo}
                                    alt={apt.client_name}
                                    className="w-5 h-5 rounded-full object-cover flex-shrink-0 mt-0.5"
                                  />
                                ) : (
                                  <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-[8px] text-gray-600 font-medium">
                                      {apt.client_name?.charAt(0)?.toUpperCase() || '?'}
                                    </span>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-semibold text-gray-800 truncate">
                                    {format(parseISO(apt.start_datetime), 'HH:mm')} - {apt.client_name}
                                  </p>
                                  <p className="text-[10px] text-gray-500 truncate">{apt.service_name}</p>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📅</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Selecciona una sucursal</h3>
          <p className="text-gray-500">
            Elige una sucursal para ver el calendario de citas
          </p>
        </div>
      )}

      {/* Leyenda de profesionales */}
      {staffMembers.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          {staffMembers.map((staff) => (
            <div key={staff.id} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: staff.calendar_color || '#3B82F6' }}
              />
              <span className="text-gray-600">
                {staff.first_name?.split(' ')[0]} {staff.last_name?.charAt(0)}.
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
