import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from './Modal'

describe('Modal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Test">
        contenido
      </Modal>,
    )
    expect(screen.queryByText('contenido')).toBeNull()
  })

  it('renderiza title y contenido cuando open=true', () => {
    render(
      <Modal open onClose={() => {}} title="Confirmar acción">
        ¿Estás seguro?
      </Modal>,
    )
    expect(screen.getByText('Confirmar acción')).toBeInTheDocument()
    expect(screen.getByText('¿Estás seguro?')).toBeInTheDocument()
  })

  it('usa role dialog con aria-modal', () => {
    render(
      <Modal open onClose={() => {}} title="Test">
        x
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('vincula aria-labelledby al título', () => {
    render(
      <Modal open onClose={() => {}} title="Hola">
        x
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    const labelId = dialog.getAttribute('aria-labelledby')
    expect(labelId).toBeTruthy()
    expect(document.getElementById(labelId!)).toHaveTextContent('Hola')
  })

  it('llama onClose cuando se presiona Escape', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Test">
        x
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('llama onClose al hacer click en el botón X', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Test">
        x
      </Modal>,
    )
    // Hay 2 elementos con aria-label "Cerrar" (backdrop + X dentro del header).
    // El segundo es el X visible dentro del diálogo.
    const closeButtons = screen.getAllByLabelText('Cerrar')
    expect(closeButtons.length).toBe(2)
    await user.click(closeButtons[1]) // el X dentro del diálogo
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renderiza footer cuando se pasa', () => {
    render(
      <Modal
        open
        onClose={() => {}}
        title="Test"
        footer={<button>Aceptar</button>}
      >
        x
      </Modal>,
    )
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
  })

  it('puede ocultar el botón X', () => {
    render(
      <Modal open onClose={() => {}} title="Test" hideCloseButton>
        x
      </Modal>,
    )
    // El botón X tiene aria-label "Cerrar", el backdrop también — buscamos sólo el X visible
    const closeButtons = screen.queryAllByLabelText('Cerrar')
    // Sólo queda el backdrop (que también tiene aria-label="Cerrar")
    expect(closeButtons.length).toBe(1)
  })

  it('bloquea scroll del body mientras está abierto', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Test">
        x
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal open={false} onClose={() => {}} title="Test">
        x
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('')
  })
})
