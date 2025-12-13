import { useEffect, useRef, useState, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icon in Leaflet with webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Google Maps API Key - en produccion usar variable de entorno
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

// Debug: mostrar si la API key está configurada
if (import.meta.env.DEV) {
  console.log('[LocationPicker] Google Maps API Key:', GOOGLE_MAPS_API_KEY ? 'Configurada' : 'NO configurada')
}

interface Location {
  lat: number
  lng: number
}

interface LocationPickerProps {
  value?: Location | null
  onChange: (location: Location) => void
  onAddressChange?: (address: string) => void
  height?: string
  defaultCenter?: Location
  defaultZoom?: number
  city?: string
  district?: string
}

function DraggableMarker({ position, onPositionChange }: {
  position: Location
  onPositionChange: (pos: Location) => void
}) {
  const markerRef = useRef<L.Marker>(null)

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current
      if (marker) {
        const { lat, lng } = marker.getLatLng()
        onPositionChange({ lat, lng })
      }
    },
  }

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={[position.lat, position.lng]}
      ref={markerRef}
    />
  )
}

function MapClickHandler({ onLocationSelect }: { onLocationSelect: (loc: Location) => void }) {
  useMapEvents({
    click(e) {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

function MapCenterUpdater({ center }: { center: Location }) {
  const map = useMap()

  useEffect(() => {
    map.setView([center.lat, center.lng])
  }, [center, map])

  return null
}

// Hook para cargar Google Maps API
function useGoogleMapsScript() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Si no hay API key, no cargar
    if (!GOOGLE_MAPS_API_KEY) {
      setError('No API key')
      return
    }

    // Si ya esta cargado
    if (window.google?.maps?.places) {
      setIsLoaded(true)
      return
    }

    // Verificar si el script ya existe
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]')
    if (existingScript) {
      existingScript.addEventListener('load', () => setIsLoaded(true))
      return
    }

    // Cargar el script
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => setIsLoaded(true)
    script.onerror = () => setError('Error cargando Google Maps')
    document.head.appendChild(script)
  }, [])

  return { isLoaded, error }
}

export default function LocationPicker({
  value,
  onChange,
  onAddressChange,
  height = '300px',
  defaultCenter = { lat: -12.0464, lng: -77.0428 }, // Lima, Peru
  defaultZoom = 13,
  city = 'Lima',
  district = '',
}: LocationPickerProps) {
  const [position, setPosition] = useState<Location>(value || defaultCenter)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [showCoordinatesInput, setShowCoordinatesInput] = useState(false)
  const [coordinatesInput, setCoordinatesInput] = useState('')
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [showPredictions, setShowPredictions] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null)
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { isLoaded: googleLoaded, error: googleError } = useGoogleMapsScript()

  // Inicializar servicios de Google Places
  useEffect(() => {
    if (googleLoaded && window.google?.maps?.places) {
      autocompleteServiceRef.current = new google.maps.places.AutocompleteService()
      // PlacesService necesita un elemento DOM
      const dummyDiv = document.createElement('div')
      placesServiceRef.current = new google.maps.places.PlacesService(dummyDiv)
    }
  }, [googleLoaded])

  useEffect(() => {
    if (value && (value.lat !== position.lat || value.lng !== position.lng)) {
      setPosition(value)
    }
  }, [value])

  const handlePositionChange = useCallback((newPos: Location) => {
    const roundedPos = {
      lat: Math.round(newPos.lat * 1000000) / 1000000,
      lng: Math.round(newPos.lng * 1000000) / 1000000
    }
    setPosition(roundedPos)
    onChange(roundedPos)

    if (onAddressChange) {
      reverseGeocode(roundedPos)
    }
  }, [onChange, onAddressChange])

  const reverseGeocode = async (loc: Location) => {
    // Intentar con Google primero si esta disponible
    if (googleLoaded && window.google?.maps?.Geocoder) {
      const geocoder = new google.maps.Geocoder()
      try {
        const result = await geocoder.geocode({ location: { lat: loc.lat, lng: loc.lng } })
        if (result.results[0] && onAddressChange) {
          onAddressChange(result.results[0].formatted_address)
          return
        }
      } catch (e) {
        console.error('Google reverse geocode error:', e)
      }
    }

    // Fallback a Nominatim
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.lat}&lon=${loc.lng}&addressdetails=1`
      )
      const data = await response.json()
      if (data.display_name && onAddressChange) {
        onAddressChange(data.display_name)
      }
    } catch (error) {
      console.error('Error reverse geocoding:', error)
    }
  }

  // Buscar predicciones con Google Places
  const searchPredictions = useCallback((query: string) => {
    if (!query.trim() || !autocompleteServiceRef.current) {
      setPredictions([])
      return
    }

    // Agregar contexto de ubicacion
    let searchQuery = query
    if (!query.toLowerCase().includes('peru') && !query.toLowerCase().includes('lima')) {
      searchQuery = `${query}, ${district ? district + ', ' : ''}${city}, Peru`
    }

    autocompleteServiceRef.current.getPlacePredictions(
      {
        input: searchQuery,
        componentRestrictions: { country: 'pe' },
        // Nota: 'address' no puede mezclarse con otros tipos
        // Usamos 'geocode' para obtener direcciones precisas
        types: ['geocode'],
      },
      (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results) {
          setPredictions(results)
          setShowPredictions(true)
        } else {
          setPredictions([])
        }
      }
    )
  }, [city, district])

  // Manejar cambio en el input de busqueda
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value
    setSearchQuery(query)
    setSearchError('')

    // Debounce la busqueda
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (googleLoaded && query.length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        searchPredictions(query)
      }, 300)
    } else {
      setPredictions([])
      setShowPredictions(false)
    }
  }

  // Seleccionar una prediccion
  const selectPrediction = (prediction: google.maps.places.AutocompletePrediction) => {
    if (!placesServiceRef.current) return

    setShowPredictions(false)
    setIsSearching(true)

    placesServiceRef.current.getDetails(
      {
        placeId: prediction.place_id,
        fields: ['geometry', 'formatted_address', 'name'],
      },
      (place, status) => {
        setIsSearching(false)
        if (status === google.maps.places.PlacesServiceStatus.OK && place?.geometry?.location) {
          const newPos = {
            lat: Math.round(place.geometry.location.lat() * 1000000) / 1000000,
            lng: Math.round(place.geometry.location.lng() * 1000000) / 1000000
          }
          setPosition(newPos)
          onChange(newPos)
          setSearchQuery(prediction.description)
          if (onAddressChange && place.formatted_address) {
            onAddressChange(place.formatted_address)
          }
        } else {
          setSearchError('No se pudo obtener la ubicacion')
        }
      }
    )
  }

  // Busqueda con Nominatim (fallback)
  const searchLocation = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    setSearchError('')
    setShowPredictions(false)

    try {
      let searchWithContext = searchQuery.trim()
      const lowerQuery = searchWithContext.toLowerCase()
      if (!lowerQuery.includes('lima') && !lowerQuery.includes('peru')) {
        const contextParts = []
        if (district) contextParts.push(district)
        if (city) contextParts.push(city)
        contextParts.push('Peru')
        searchWithContext = `${searchWithContext}, ${contextParts.join(', ')}`
      }

      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchWithContext)}&limit=5&countrycodes=pe`
      )
      const data = await response.json()

      if (data.length > 0) {
        const { lat, lon, display_name } = data[0]
        const newPos = {
          lat: Math.round(parseFloat(lat) * 1000000) / 1000000,
          lng: Math.round(parseFloat(lon) * 1000000) / 1000000
        }
        setPosition(newPos)
        onChange(newPos)
        if (onAddressChange) {
          onAddressChange(display_name)
        }
      } else {
        setSearchError('No se encontro la direccion')
      }
    } catch (error) {
      setSearchError('Error al buscar direccion')
      console.error('Error searching location:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const parseCoordinates = (input: string): Location | null => {
    const cleaned = input.trim()
    const commaFormat = cleaned.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/)
    if (commaFormat) {
      const lat = parseFloat(commaFormat[1])
      const lng = parseFloat(commaFormat[2])
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng }
      }
    }

    const googleMapsMatch = cleaned.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/) ||
                           cleaned.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    if (googleMapsMatch) {
      const lat = parseFloat(googleMapsMatch[1])
      const lng = parseFloat(googleMapsMatch[2])
      if (isValidCoordinate(lat, lng)) {
        return { lat, lng }
      }
    }

    return null
  }

  const isValidCoordinate = (lat: number, lng: number): boolean => {
    return !isNaN(lat) && !isNaN(lng) &&
           lat >= -90 && lat <= 90 &&
           lng >= -180 && lng <= 180
  }

  const applyCoordinates = () => {
    const coords = parseCoordinates(coordinatesInput)
    if (coords) {
      const roundedPos = {
        lat: Math.round(coords.lat * 1000000) / 1000000,
        lng: Math.round(coords.lng * 1000000) / 1000000
      }
      setPosition(roundedPos)
      onChange(roundedPos)
      setShowCoordinatesInput(false)
      setCoordinatesInput('')
      setSearchError('')
      if (onAddressChange) {
        reverseGeocode(roundedPos)
      }
    } else {
      setSearchError('Formato de coordenadas invalido')
    }
  }

  const openInGoogleMaps = () => {
    const query = searchQuery.trim() || (district ? `${district}, ${city}, Peru` : `${city}, Peru`)
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    window.open(url, '_blank')
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setShowPredictions(false)
      searchLocation()
    } else if (e.key === 'Escape') {
      setShowPredictions(false)
    }
  }

  const getCurrentLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPos = {
            lat: Math.round(pos.coords.latitude * 1000000) / 1000000,
            lng: Math.round(pos.coords.longitude * 1000000) / 1000000,
          }
          handlePositionChange(newPos)
        },
        (error) => {
          console.error('Error getting location:', error)
          setSearchError('No se pudo obtener tu ubicacion')
        }
      )
    } else {
      setSearchError('Geolocalizacion no disponible')
    }
  }

  const hasGooglePlaces = googleLoaded && !googleError

  return (
    <div className="space-y-3">
      {/* Search bar con autocomplete */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => predictions.length > 0 && setShowPredictions(true)}
            onBlur={() => setTimeout(() => setShowPredictions(false), 200)}
            placeholder={hasGooglePlaces ? "Buscar direccion (Google Places)..." : "Buscar direccion..."}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />

          {/* Dropdown de predicciones */}
          {showPredictions && predictions.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {predictions.map((prediction) => (
                <button
                  key={prediction.place_id}
                  type="button"
                  onClick={() => selectPrediction(prediction)}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <span className="font-medium">{prediction.structured_formatting.main_text}</span>
                  <span className="text-gray-500 text-xs block">
                    {prediction.structured_formatting.secondary_text}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={searchLocation}
          disabled={isSearching}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {isSearching ? '...' : 'Buscar'}
        </button>
        <button
          type="button"
          onClick={getCurrentLocation}
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          title="Usar mi ubicacion actual"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Indicador de Google Places */}
      {hasGooglePlaces && (
        <p className="text-xs text-green-600 flex items-center gap-1">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          Google Places activo - escribe para ver sugerencias
        </p>
      )}

      {/* Botones adicionales */}
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={openInGoogleMaps}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          Buscar en Google Maps
        </button>
        <button
          type="button"
          onClick={() => setShowCoordinatesInput(!showCoordinatesInput)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M2 12h20M12 2v20"/>
          </svg>
          Pegar coordenadas
        </button>
      </div>

      {/* Input de coordenadas */}
      {showCoordinatesInput && (
        <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-2">
          <p className="text-xs text-gray-600">
            Pega las coordenadas o URL de Google Maps:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={coordinatesInput}
              onChange={(e) => setCoordinatesInput(e.target.value)}
              placeholder="-12.0464, -77.0428 o URL de Google Maps"
              className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              type="button"
              onClick={applyCoordinates}
              className="px-3 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Aplicar
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Tip: En Google Maps, haz clic derecho en la ubicacion y copia las coordenadas.
          </p>
        </div>
      )}

      {searchError && (
        <p className="text-red-500 text-sm">{searchError}</p>
      )}

      {/* Map */}
      <div style={{ height }} className="rounded-lg overflow-hidden border border-gray-200">
        <MapContainer
          center={[position.lat, position.lng]}
          zoom={defaultZoom}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <DraggableMarker position={position} onPositionChange={handlePositionChange} />
          <MapClickHandler onLocationSelect={handlePositionChange} />
          <MapCenterUpdater center={position} />
        </MapContainer>
      </div>

      {/* Coordinates display */}
      <div className="text-xs text-gray-500 flex gap-4">
        <span>Lat: {position.lat.toFixed(6)}</span>
        <span>Lng: {position.lng.toFixed(6)}</span>
      </div>

      <p className="text-xs text-gray-400">
        Haz clic en el mapa o arrastra el marcador para ajustar la ubicacion
      </p>
    </div>
  )
}
