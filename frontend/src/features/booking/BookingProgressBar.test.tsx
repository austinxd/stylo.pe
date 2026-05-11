import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookingProgressBar } from './BookingProgressBar'

describe('BookingProgressBar', () => {
  it('renderiza los labels de pasos visibles', () => {
    render(<BookingProgressBar currentStep="service" />)
    expect(screen.getByText('Servicio')).toBeInTheDocument()
    expect(screen.getByText('Profesional')).toBeInTheDocument()
    expect(screen.getByText('Fecha y hora')).toBeInTheDocument()
  })

  it('no muestra el step "Confirmado" (success) en la barra', () => {
    render(<BookingProgressBar currentStep="service" />)
    expect(screen.queryByText('Confirmado')).toBeNull()
  })

  it('marca el step actual con aria-current="step"', () => {
    const { container } = render(<BookingProgressBar currentStep="datetime" />)
    const current = container.querySelector('[aria-current="step"]')
    expect(current).not.toBeNull()
    expect(current).toHaveTextContent('Fecha y hora')
  })

  it('permite click en steps previos cuando onStepClick está definido', async () => {
    const user = userEvent.setup()
    const onStepClick = vi.fn()
    render(
      <BookingProgressBar currentStep="datetime" onStepClick={onStepClick} />,
    )

    const backButton = screen.getByLabelText('Volver a Servicio')
    await user.click(backButton)
    expect(onStepClick).toHaveBeenCalledWith('service')
  })

  it('no muestra botón clickeable en step futuro', () => {
    render(
      <BookingProgressBar currentStep="service" onStepClick={() => {}} />,
    )
    // No debe haber botón "Volver a Profesional" (es futuro)
    expect(screen.queryByLabelText('Volver a Profesional')).toBeNull()
  })

  describe('versión compacta', () => {
    it('muestra "Paso X de Y" con label del actual', () => {
      render(<BookingProgressBar currentStep="datetime" compact />)
      expect(screen.getByText(/Paso 3 de 5/)).toBeInTheDocument()
      expect(screen.getByText('Fecha y hora')).toBeInTheDocument()
    })

    it('cuenta correctamente para el step service (1 de 5)', () => {
      render(<BookingProgressBar currentStep="service" compact />)
      expect(screen.getByText(/Paso 1 de 5/)).toBeInTheDocument()
    })

    it('cuenta correctamente para el step otp (5 de 5)', () => {
      render(<BookingProgressBar currentStep="otp" compact />)
      expect(screen.getByText(/Paso 5 de 5/)).toBeInTheDocument()
    })
  })
})
