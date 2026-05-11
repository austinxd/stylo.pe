import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('renderiza con role status para a11y', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('incluye texto para lectores de pantalla', () => {
    render(<Spinner />)
    expect(screen.getByText('Cargando…')).toHaveClass('sr-only')
  })

  it('acepta label custom', () => {
    render(<Spinner label="Procesando pago…" />)
    expect(screen.getByText('Procesando pago…')).toBeInTheDocument()
  })

  it('aplica clases de tamaño correctas', () => {
    const { container } = render(<Spinner size="xs" />)
    expect(container.querySelector('.h-3')).toBeInTheDocument()
  })

  it('aplica className al wrapper', () => {
    const { container } = render(<Spinner className="text-white" />)
    expect(container.firstChild).toHaveClass('text-white')
  })

  it('por defecto tamaño md', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('.h-6')).toBeInTheDocument()
  })
})
