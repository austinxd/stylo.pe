import { useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { getMediaUrl } from '@/api/client'

export interface LightboxPhoto {
  image: string
  caption?: string
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[]
  currentIndex: number
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

/**
 * Lightbox accesible para visualizar fotos en grande.
 *
 * - Cierra con click en backdrop, X, o tecla ESC
 * - Navega con flechas ← → del teclado o botones laterales
 * - Bloquea scroll del body mientras está abierto
 * - role="dialog" con aria-modal, aria-labelledby
 */
export function PhotoLightbox({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: PhotoLightboxProps) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [onClose, onNext, onPrev])

  if (!photos.length) return null
  const photo = photos[currentIndex]
  if (!photo) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Visor de fotos"
      className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar visor de fotos"
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors z-10 rounded-full hover:bg-white/10"
      >
        <X className="w-7 h-7" aria-hidden="true" />
      </button>

      <div
        aria-live="polite"
        className="absolute top-4 left-4 text-white/80 text-sm font-medium tabular-nums"
      >
        {currentIndex + 1} / {photos.length}
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPrev()
            }}
            aria-label="Foto anterior"
            className="absolute left-4 p-3 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
          >
            <ChevronLeft className="w-6 h-6" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onNext()
            }}
            aria-label="Siguiente foto"
            className="absolute right-4 p-3 text-white/80 hover:text-white bg-black/30 hover:bg-black/50 rounded-full transition-all"
          >
            <ChevronRight className="w-6 h-6" aria-hidden="true" />
          </button>
        </>
      )}

      <div className="max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={getMediaUrl(photo.image) || ''}
          alt={photo.caption || `Foto ${currentIndex + 1} de ${photos.length}`}
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
          loading="lazy"
        />
        {photo.caption && (
          <p className="text-white/80 text-center mt-3 text-sm">{photo.caption}</p>
        )}
      </div>
    </div>
  )
}

export default PhotoLightbox
