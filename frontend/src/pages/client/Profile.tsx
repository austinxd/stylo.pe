import { useForm } from 'react-hook-form'
import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import apiClient from '@/api/client'
import type { Client } from '@/types'

export default function Profile() {
  const { client, updateClient } = useAuthStore()

  const {
    register,
    handleSubmit,
    formState: { isDirty },
  } = useForm({
    defaultValues: {
      first_name: client?.first_name || '',
      last_name_paterno: client?.last_name_paterno || '',
      last_name_materno: client?.last_name_materno || '',
      whatsapp_opt_in: client?.whatsapp_opt_in ?? true,
    },
  })

  const updateProfile = useMutation({
    mutationFn: async (data: Partial<Client>) => {
      const response = await apiClient.patch('/clients/me', data)
      return response.data
    },
    onSuccess: (data) => {
      updateClient(data)
    },
  })

  const onSubmit = (data: any) => {
    updateProfile.mutate(data)
  }

  if (!client) {
    return <p>Cargando...</p>
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Mi Perfil</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Teléfono (solo lectura) */}
          <div>
            <label className="label">Número de WhatsApp</label>
            <input
              type="text"
              value={client.phone_number}
              disabled
              className="input bg-gray-50"
            />
            <p className="text-sm text-gray-500 mt-1">
              El número de teléfono no se puede cambiar
            </p>
          </div>

          {/* Documento (solo lectura) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo de documento</label>
              <input
                type="text"
                value={client.document_type.toUpperCase()}
                disabled
                className="input bg-gray-50"
              />
            </div>
            <div>
              <label className="label">Número de documento</label>
              <input
                type="text"
                value={client.document_number}
                disabled
                className="input bg-gray-50"
              />
            </div>
          </div>

          {/* Nombres (editable) */}
          <div>
            <label className="label">Nombres</label>
            <input
              {...register('first_name')}
              className="input"
            />
          </div>

          {/* Apellidos (editables) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Apellido paterno</label>
              <input
                {...register('last_name_paterno')}
                className="input"
              />
            </div>
            <div>
              <label className="label">Apellido materno</label>
              <input
                {...register('last_name_materno')}
                className="input"
              />
            </div>
          </div>

          {/* Fecha de nacimiento (solo lectura) */}
          <div>
            <label className="label">Fecha de nacimiento</label>
            <input
              type="text"
              value={client.birth_date}
              disabled
              className="input bg-gray-50"
            />
          </div>

          {/* WhatsApp opt-in */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              {...register('whatsapp_opt_in')}
              id="whatsapp_opt_in"
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="whatsapp_opt_in" className="text-sm text-gray-600">
              Recibir recordatorios por WhatsApp
            </label>
          </div>

          {/* Botón guardar */}
          <div className="pt-4 border-t border-gray-100">
            <button
              type="submit"
              disabled={!isDirty || updateProfile.isPending}
              className="btn-primary"
            >
              {updateProfile.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>

            {updateProfile.isSuccess && (
              <span className="ml-4 text-green-600 text-sm">
                ✓ Cambios guardados
              </span>
            )}
          </div>
        </form>
      </div>

      {/* Info adicional */}
      <div className="mt-8 bg-gray-50 rounded-xl p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Información</h2>
        <p className="text-sm text-gray-600">
          Tu cuenta fue creada el{' '}
          {new Date(client.created_at).toLocaleDateString('es-PE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}
