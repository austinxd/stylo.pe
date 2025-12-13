import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Star, CheckCircle, AlertCircle, Loader2, Calendar, User, MapPin, Scissors } from 'lucide-react'
import api from '@/api/client'

interface ReviewTokenInfo {
  token: string
  appointment_id: number
  appointment_date: string
  service_name: string
  staff_name: string | null
  branch_name: string
  business_name: string
  client_name: string
  expires_at: string
}

type PageState = 'loading' | 'ready' | 'submitting' | 'success' | 'error'

export default function ReviewPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<PageState>('loading')
  const [tokenInfo, setTokenInfo] = useState<ReviewTokenInfo | null>(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setError('Token no proporcionado')
      setState('error')
      return
    }

    fetchTokenInfo()
  }, [token])

  const fetchTokenInfo = async () => {
    try {
      const response = await api.get(`/reviews/token/${token}/`)
      setTokenInfo(response.data)
      setState('ready')
    } catch (err: any) {
      const errorData = err.response?.data
      if (errorData?.code === 'already_used') {
        setError('Ya dejaste una resena para esta cita.')
      } else if (errorData?.code === 'expired') {
        setError('El enlace ha expirado. Los enlaces son validos por 7 dias despues de tu cita.')
      } else {
        setError(errorData?.error || 'Enlace invalido o expirado.')
      }
      setState('error')
    }
  }

  const handleSubmit = async () => {
    if (rating === 0) {
      setError('Por favor selecciona una calificacion')
      return
    }

    setState('submitting')
    setError('')

    try {
      await api.post(`/reviews/token/${token}/`, {
        rating,
        comment: comment.trim(),
      })
      setState('success')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar la resena. Intenta de nuevo.')
      setState('ready')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-primary-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No se puede cargar</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    )
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Gracias por tu resena!</h1>
          <p className="text-gray-600 mb-6">
            Tu opinion es muy importante para nosotros y ayuda a otros clientes a conocer mejor nuestros servicios.
          </p>
          <div className="flex justify-center gap-1 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`h-8 w-8 ${
                  star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Ir al inicio
          </button>
        </div>
      </div>
    )
  }

  // Review form
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Como fue tu experiencia?
          </h1>
          <p className="text-gray-600">
            Tu opinion nos ayuda a mejorar
          </p>
        </div>

        {/* Appointment Info Card */}
        {tokenInfo && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">{tokenInfo.business_name}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-gray-600">
                <Scissors className="h-4 w-4 text-gray-400" />
                <span>{tokenInfo.service_name}</span>
              </div>

              {tokenInfo.staff_name && (
                <div className="flex items-center gap-3 text-gray-600">
                  <User className="h-4 w-4 text-gray-400" />
                  <span>Atendido por {tokenInfo.staff_name}</span>
                </div>
              )}

              <div className="flex items-center gap-3 text-gray-600">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span>{tokenInfo.branch_name}</span>
              </div>

              <div className="flex items-center gap-3 text-gray-600">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span>{formatDate(tokenInfo.appointment_date)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Rating Form */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {/* Star Rating */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
              Calificacion
            </label>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoverRating || rating)
                        ? 'text-yellow-400 fill-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {rating > 0 && (
              <p className="text-center text-sm text-gray-500 mt-2">
                {rating === 1 && 'Muy malo'}
                {rating === 2 && 'Malo'}
                {rating === 3 && 'Regular'}
                {rating === 4 && 'Bueno'}
                {rating === 5 && 'Excelente'}
              </p>
            )}
          </div>

          {/* Comment */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Comentario (opcional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Cuentanos mas sobre tu experiencia..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
              maxLength={500}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">
              {comment.length}/500
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={state === 'submitting' || rating === 0}
            className="w-full py-3 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {state === 'submitting' ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Enviando...
              </>
            ) : (
              'Enviar resena'
            )}
          </button>
        </div>

        {/* Privacy Note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Tu resena sera publica y ayudara a otros clientes.
          {tokenInfo?.client_name && (
            <span className="block mt-1">
              Se mostrara como: {tokenInfo.client_name.split(' ')[0]}
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
