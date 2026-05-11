import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('muestra el título', () => {
    render(<EmptyState title="No hay citas" />)
    expect(screen.getByText('No hay citas')).toBeInTheDocument()
  })

  it('muestra la descripción cuando se pasa', () => {
    render(
      <EmptyState title="Vacío" description="Reserva tu primera cita" />,
    )
    expect(screen.getByText('Reserva tu primera cita')).toBeInTheDocument()
  })

  it('no renderiza descripción si no se pasa', () => {
    const { container } = render(<EmptyState title="Vacío" />)
    expect(container.querySelector('p')).toBeNull()
  })

  it('renderiza el icono cuando se pasa', () => {
    const { container } = render(<EmptyState icon={Sparkles} title="Test" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('renderiza el action cuando se pasa', () => {
    render(
      <EmptyState
        title="Test"
        action={<button>Reservar</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeInTheDocument()
  })

  it('usa role status para asistencia', () => {
    render(<EmptyState title="Vacío" />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('aplica tone error correctamente', () => {
    const { container } = render(
      <EmptyState title="Error" tone="error" icon={Sparkles} />,
    )
    // El círculo del icono debe tener fondo error-50
    const iconWrapper = container.querySelector('.bg-error-50')
    expect(iconWrapper).toBeInTheDocument()
  })

  it('aplica tone subtle correctamente', () => {
    const { container } = render(
      <EmptyState title="Vacío" tone="subtle" icon={Sparkles} />,
    )
    const iconWrapper = container.querySelector('.bg-neutral-50')
    expect(iconWrapper).toBeInTheDocument()
  })
})
