import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonList } from './Skeleton'

describe('Skeleton', () => {
  it('renderiza con variant block por defecto', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveClass('animate-shimmer')
    expect(container.firstChild).toHaveClass('rounded-lg')
  })

  it('aplica forma correcta para variant text', () => {
    const { container } = render(<Skeleton variant="text" />)
    expect(container.firstChild).toHaveClass('h-4')
  })

  it('aplica forma correcta para variant circle', () => {
    const { container } = render(<Skeleton variant="circle" />)
    expect(container.firstChild).toHaveClass('rounded-full')
  })

  it('aplica forma correcta para variant card', () => {
    const { container } = render(<Skeleton variant="card" />)
    expect(container.firstChild).toHaveClass('h-32')
    expect(container.firstChild).toHaveClass('rounded-2xl')
  })

  it('acepta className adicional', () => {
    const { container } = render(<Skeleton className="custom-class" />)
    expect(container.firstChild).toHaveClass('custom-class')
  })

  it('es invisible para lectores de pantalla (aria-hidden)', () => {
    const { container } = render(<Skeleton />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('SkeletonList', () => {
  it('renderiza N skeletons del count especificado', () => {
    const { container } = render(<SkeletonList count={5} />)
    // Cada skeleton es el primer hijo del wrapper; el wrapper tiene 5 hijos
    expect(container.firstChild?.childNodes.length).toBe(5)
  })

  it('default es 3 skeletons', () => {
    const { container } = render(<SkeletonList />)
    expect(container.firstChild?.childNodes.length).toBe(3)
  })

  it('aplica gap personalizado', () => {
    const { container } = render(<SkeletonList gap="gap-10" />)
    expect(container.firstChild).toHaveClass('gap-10')
  })
})
