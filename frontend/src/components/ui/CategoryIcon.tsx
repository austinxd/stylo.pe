import {
  Scissors,
  Sparkles,
  Palette,
  Hand,
  Heart,
  Flower2,
  Star,
  Gem,
  LucideIcon
} from 'lucide-react'

// Mapeo de nombres de iconos del backend a componentes de Lucide
const ICON_MAP: Record<string, LucideIcon> = {
  // Categorías principales
  scissors: Scissors,      // Peluquería
  barber: Scissors,        // Barbería (usamos scissors)
  nail: Hand,              // Uñas
  spa: Flower2,            // Spa & Masajes
  face: Palette,           // Estética
  sparkles: Sparkles,      // Maquillaje

  // Aliases adicionales
  peluqueria: Scissors,
  barberia: Scissors,
  unas: Hand,
  estetica: Palette,
  maquillaje: Sparkles,
  beauty: Heart,
  massage: Flower2,
  gem: Gem,
  star: Star,
}

interface CategoryIconProps {
  icon: string
  className?: string
  size?: number
}

export default function CategoryIcon({ icon, className = '', size = 20 }: CategoryIconProps) {
  // Buscar el icono en el mapa (case insensitive)
  const iconKey = icon?.toLowerCase() || ''
  const IconComponent = ICON_MAP[iconKey]

  if (IconComponent) {
    return <IconComponent className={className} size={size} />
  }

  // Fallback: mostrar el texto si no se encuentra el icono
  return <span className={className}>{icon}</span>
}
