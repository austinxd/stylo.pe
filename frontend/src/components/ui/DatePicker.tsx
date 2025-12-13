import { forwardRef, useState, useEffect } from 'react'
import { clsx } from 'clsx'

interface DatePickerProps {
  label?: string
  error?: string
  helperText?: string
  value?: string
  onChange?: (value: string) => void
  minYear?: number
  maxYear?: number
  className?: string
  name?: string
}

const MONTHS = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
]

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      label,
      error,
      helperText,
      value,
      onChange,
      minYear = 1920,
      maxYear = new Date().getFullYear(),
      className,
      name,
    },
    ref
  ) => {
    const [day, setDay] = useState('')
    const [month, setMonth] = useState('')
    const [year, setYear] = useState('')

    // Parse initial value
    useEffect(() => {
      if (value) {
        const parts = value.split('-')
        if (parts.length === 3) {
          setYear(parts[0])
          setMonth(parts[1])
          setDay(parts[2])
        }
      }
    }, [value])

    // Generate years array (descending for birth date)
    const years = Array.from(
      { length: maxYear - minYear + 1 },
      (_, i) => maxYear - i
    )

    // Calculate days based on selected month and year
    const daysInMonth = month && year
      ? getDaysInMonth(parseInt(month), parseInt(year))
      : 31

    const days = Array.from({ length: daysInMonth }, (_, i) =>
      String(i + 1).padStart(2, '0')
    )

    // Update parent when all fields are filled
    useEffect(() => {
      if (day && month && year) {
        const dateStr = `${year}-${month}-${day}`
        onChange?.(dateStr)
      }
    }, [day, month, year, onChange])

    // Adjust day if it exceeds days in month
    useEffect(() => {
      if (day && parseInt(day) > daysInMonth) {
        setDay(String(daysInMonth).padStart(2, '0'))
      }
    }, [daysInMonth, day])

    const selectClasses = clsx(
      'h-[46px] px-3 border rounded-xl bg-white text-primary-900',
      'focus:outline-none focus:ring-2 focus:ring-primary-900/10 focus:border-primary-900',
      'hover:border-neutral-300 transition-all duration-200',
      'appearance-none cursor-pointer',
      error ? 'border-red-500' : 'border-neutral-200'
    )

    return (
      <div className={clsx('w-full', className)}>
        {label && (
          <label className="block text-sm font-medium text-neutral-700 mb-2">
            {label}
          </label>
        )}

        {/* Hidden input for form integration */}
        <input
          ref={ref}
          type="hidden"
          name={name}
          value={day && month && year ? `${year}-${month}-${day}` : ''}
        />

        <div className="grid grid-cols-3 gap-2">
          {/* Day */}
          <div className="relative">
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className={clsx(selectClasses, 'w-full')}
              aria-label="Día"
            >
              <option value="">Día</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Month */}
          <div className="relative">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={clsx(selectClasses, 'w-full')}
              aria-label="Mes"
            >
              <option value="">Mes</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Year */}
          <div className="relative">
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={clsx(selectClasses, 'w-full')}
              aria-label="Año"
            >
              <option value="">Año</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {helperText && !error && <p className="text-xs text-neutral-500 mt-1">{helperText}</p>}
      </div>
    )
  }
)

DatePicker.displayName = 'DatePicker'

export default DatePicker
