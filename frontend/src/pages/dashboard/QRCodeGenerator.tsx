import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import apiClient from '@/api/client'
import { Button } from '@/components/ui'
import type { Business, Branch } from '@/types'

interface MyBusinessResponse {
  business: Business
  branches: Branch[]
}

export default function QRCodeGenerator() {
  const [selectedBranch, setSelectedBranch] = useState<number | 'all'>('all')
  const [qrSize, setQrSize] = useState(256)
  const qrRef = useRef<HTMLDivElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', 'my-business'],
    queryFn: async () => {
      const response = await apiClient.get<MyBusinessResponse>('/dashboard/my-business')
      return response.data
    },
  })

  const business = data?.business
  const branches = data?.branches || []

  // Generar URL de reserva
  const getBookingUrl = () => {
    if (!business) return ''
    const baseUrl = window.location.origin

    if (selectedBranch === 'all' || branches.length <= 1) {
      return `${baseUrl}/${business.slug}`
    }

    const branch = branches.find(b => b.id === selectedBranch)
    if (branch) {
      return `${baseUrl}/${business.slug}/${branch.slug}/reservar`
    }

    return `${baseUrl}/${business.slug}`
  }

  const bookingUrl = getBookingUrl()

  // Descargar QR como PNG
  const downloadQR = () => {
    if (!qrRef.current) return

    const svg = qrRef.current.querySelector('svg')
    if (!svg) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = qrSize * 2
    canvas.height = qrSize * 2

    const svgData = new XMLSerializer().serializeToString(svg)
    const img = new Image()
    img.onload = () => {
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const pngUrl = canvas.toDataURL('image/png')
      const downloadLink = document.createElement('a')
      downloadLink.href = pngUrl
      downloadLink.download = `qr-${business?.slug || 'reserva'}.png`
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  // Copiar URL al portapapeles
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl)
      alert('URL copiada al portapapeles')
    } catch {
      alert('Error al copiar URL')
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!business) {
    return (
      <div className="text-center py-12 text-gray-500">
        No tienes un negocio configurado.
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Genera tu QR de Reservas
        </h1>
        <p className="text-gray-600">
          Crea un código QR para que tus clientes puedan reservar citas fácilmente.
          Imprímelo y colócalo en tu local.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Configuracion */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Configuración
          </h2>

          {/* Selector de sucursal */}
          {branches.length > 1 && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sucursal
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">Todas las sucursales (página principal)</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Elige si el QR lleva a la página del negocio o directo a una sucursal.
              </p>
            </div>
          )}

          {/* Tamano del QR */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tamano del QR
            </label>
            <div className="flex gap-2">
              {[128, 256, 512].map((size) => (
                <button
                  key={size}
                  onClick={() => setQrSize(size)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    qrSize === size
                      ? 'bg-primary-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {size === 128 ? 'Pequeno' : size === 256 ? 'Mediano' : 'Grande'}
                </button>
              ))}
            </div>
          </div>

          {/* URL de reserva */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL de reserva
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={bookingUrl}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600"
              />
              <Button variant="secondary" onClick={copyUrl}>
                Copiar
              </Button>
            </div>
          </div>

          {/* Acciones */}
          <div className="flex gap-3">
            <Button onClick={downloadQR} className="flex-1">
              Descargar PNG
            </Button>
          </div>
        </div>

        {/* Preview del QR */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Vista previa
          </h2>

          <div
            ref={qrRef}
            className="flex items-center justify-center p-8 bg-white rounded-xl border-2 border-dashed border-gray-200"
          >
            <QRCodeSVG
              value={bookingUrl}
              size={qrSize}
              level="H"
              includeMargin
              fgColor={business.primary_color || '#1a1a2e'}
            />
          </div>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-500 mb-2">
              Escanea para probar
            </p>
            <p className="text-xs text-gray-400">
              El QR redirige a: {bookingUrl}
            </p>
          </div>
        </div>
      </div>

      {/* Tarjeta imprimible */}
      <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Tarjeta para imprimir
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Usa este diseno como referencia para crear material impreso con tu QR.
        </p>

        <div
          className="max-w-sm mx-auto p-6 rounded-2xl text-center"
          style={{
            background: `linear-gradient(135deg, ${business.primary_color || '#1a1a2e'} 0%, ${business.primary_color || '#1a1a2e'}dd 100%)`
          }}
        >
          {business.logo ? (
            <img
              src={business.logo}
              alt={business.name}
              className="w-16 h-16 rounded-xl object-cover mx-auto mb-4"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: business.secondary_color || '#c9a227' }}
            >
              <span className="text-2xl text-white font-bold">
                {business.name.charAt(0)}
              </span>
            </div>
          )}

          <h3 className="text-white text-xl font-semibold mb-2">
            {business.name}
          </h3>

          <p className="text-white/80 text-sm mb-4">
            Reserva tu cita escaneando el código
          </p>

          <div className="bg-white p-4 rounded-xl inline-block">
            <QRCodeSVG
              value={bookingUrl}
              size={160}
              level="H"
              fgColor={business.primary_color || '#1a1a2e'}
            />
          </div>

          <p
            className="mt-4 text-sm font-medium"
            style={{ color: business.secondary_color || '#c9a227' }}
          >
            {bookingUrl.replace('http://', '').replace('https://', '')}
          </p>
        </div>
      </div>
    </div>
  )
}
