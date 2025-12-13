interface LogoProps {
  variant?: 'full' | 'icon' | 'text' | 'isotipo'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  dark?: boolean
}

const sizes = {
  sm: { icon: 24, text: 'text-lg', height: 24 },
  md: { icon: 32, text: 'text-xl', height: 32 },
  lg: { icon: 40, text: 'text-2xl', height: 40 },
  xl: { icon: 56, text: 'text-4xl', height: 56 },
}

/**
 * Logo de Stylo
 *
 * El isotipo es una "S" estilizada dentro de un círculo suave,
 * simbolizando estilo y organización. La palabra "styló" en minúsculas
 * transmite cercanía y contemporaneidad.
 */
export function Logo({
  variant = 'full',
  size = 'md',
  className = '',
  dark = false
}: LogoProps) {
  const { icon, text, height } = sizes[size]
  const color = dark ? '#ffffff' : '#1a1a1a'

  // Isotipo - S estilizada en círculo
  const Isotipo = () => (
    <svg
      width={icon}
      height={icon}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Stylo isotipo"
    >
      {/* Círculo exterior - representa el flujo del tiempo */}
      <circle
        cx="24"
        cy="24"
        r="22"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      {/* S estilizada - curva fluida del estilismo */}
      <path
        d="M28.5 16.5C28.5 16.5 26.5 14 22.5 14C18.5 14 16 16.5 16 19.5C16 22.5 18 24 22 25C26 26 30 27.5 30 31.5C30 35.5 26.5 38 22 38C17.5 38 15 35 15 35"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )

  // Logotipo - styló con tilde distintiva
  const Logotipo = () => (
    <span
      className={`font-light tracking-tight ${text}`}
      style={{ color, letterSpacing: '-0.02em' }}
    >
      styló
      <span
        className="opacity-60"
        style={{ fontSize: '0.75em' }}
      >
        .
      </span>
    </span>
  )

  if (variant === 'icon' || variant === 'isotipo') {
    return (
      <div className={className}>
        <Isotipo />
      </div>
    )
  }

  if (variant === 'text') {
    return (
      <div className={className}>
        <Logotipo />
      </div>
    )
  }

  // Full logo - isotipo + logotipo
  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      style={{ height }}
    >
      <Isotipo />
      <Logotipo />
    </div>
  )
}

export default Logo
