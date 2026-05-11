import { forwardRef, InputHTMLAttributes, ReactNode, useId } from 'react'
import { clsx } from 'clsx'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  helperText?: string
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  size?: 'md' | 'lg'
  /** Marca el campo como obligatorio visualmente (asterisco) */
  required?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      iconPosition = 'left',
      size = 'md',
      className,
      id,
      required,
      ...props
    },
    ref
  ) => {
    const reactId = useId()
    const inputId = id || props.name || `input-${reactId}`
    const errorId = error ? `${inputId}-error` : undefined
    const helperId = helperText && !error ? `${inputId}-helper` : undefined
    const describedBy = errorId || helperId

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="label">
            {label}
            {required && (
              <span aria-hidden="true" className="text-error-500 ml-0.5">
                *
              </span>
            )}
          </label>
        )}

        <div className="relative">
          {icon && iconPosition === 'left' && (
            <div
              className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              aria-hidden="true"
            >
              {icon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={describedBy}
            className={clsx(
              error ? 'input-error' : 'input',
              size === 'lg' && 'input-lg',
              icon && iconPosition === 'left' && 'pl-12',
              icon && iconPosition === 'right' && 'pr-12',
              className
            )}
            {...props}
          />

          {icon && iconPosition === 'right' && (
            <div
              className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
              aria-hidden="true"
            >
              {icon}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} role="alert" className="error-text">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="helper-text">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export default Input
