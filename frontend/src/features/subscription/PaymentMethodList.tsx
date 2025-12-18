/**
 * Lista de métodos de pago con funcionalidad para agregar/eliminar/cambiar default.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CreditCard, AlertCircle } from 'lucide-react'

import { Button } from '../../components/ui'
import { Card, CardHeader } from '../../components/ui/Card'
import { subscriptionsApi } from '../../api/subscriptions'
import { PaymentMethodCard } from './PaymentMethodCard'
import { AddPaymentMethodModal } from './AddPaymentMethodModal'

interface PaymentMethodListProps {
  culqiPublicKey: string
  className?: string
}

export function PaymentMethodList({
  culqiPublicKey,
  className,
}: PaymentMethodListProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [settingDefaultId, setSettingDefaultId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  // Query para obtener métodos de pago
  const {
    data: paymentMethods = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['paymentMethods'],
    queryFn: subscriptionsApi.getPaymentMethods,
  })

  // Mutation para agregar método de pago
  const addMutation = useMutation({
    mutationFn: (cardToken: string) =>
      subscriptionsApi.addPaymentMethod(cardToken, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] })
      queryClient.invalidateQueries({ queryKey: ['subscriptionSummary'] })
    },
  })

  // Mutation para eliminar método de pago
  const deleteMutation = useMutation({
    mutationFn: subscriptionsApi.deletePaymentMethod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] })
      setDeletingId(null)
    },
    onError: () => {
      setDeletingId(null)
    },
  })

  // Mutation para establecer como default
  const setDefaultMutation = useMutation({
    mutationFn: subscriptionsApi.setDefaultPaymentMethod,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] })
      setSettingDefaultId(null)
    },
    onError: () => {
      setSettingDefaultId(null)
    },
  })

  const handleAddPaymentMethod = async (token: string) => {
    await addMutation.mutateAsync(token)
  }

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de eliminar esta tarjeta?')) {
      setDeletingId(id)
      deleteMutation.mutate(id)
    }
  }

  const handleSetDefault = (id: number) => {
    setSettingDefaultId(id)
    setDefaultMutation.mutate(id)
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader
          title="Métodos de pago"
          subtitle="Tarjetas guardadas para pagos automáticos"
        />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-24 bg-neutral-100 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader title="Métodos de pago" />
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-neutral-600">
            Error al cargar los métodos de pago
          </p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: ['paymentMethods'] })
            }
          >
            Reintentar
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="Métodos de pago"
          subtitle="Tarjetas guardadas para pagos automáticos"
          action={
            <Button
              size="sm"
              onClick={() => setIsAddModalOpen(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Agregar
            </Button>
          }
        />

        {paymentMethods.length === 0 ? (
          <div className="text-center py-12 bg-neutral-50 rounded-xl">
            <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-lg font-medium text-primary-900 mb-2">
              No tienes tarjetas guardadas
            </h3>
            <p className="text-neutral-600 mb-6 max-w-sm mx-auto">
              Agrega una tarjeta de crédito o débito para habilitar los pagos
              automáticos de tu suscripción.
            </p>
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Agregar tarjeta
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                paymentMethod={method}
                onSetDefault={handleSetDefault}
                onDelete={handleDelete}
                isLoading={
                  deletingId === method.id || settingDefaultId === method.id
                }
              />
            ))}
          </div>
        )}

        {/* Info de seguridad */}
        {paymentMethods.length > 0 && (
          <div className="mt-6 pt-6 border-t border-neutral-100">
            <p className="text-xs text-neutral-500 text-center">
              Tus datos de pago están protegidos con encriptación de nivel
              bancario. Los cobros se realizan automáticamente al inicio de cada
              mes.
            </p>
          </div>
        )}
      </Card>

      {/* Modal para agregar tarjeta */}
      <AddPaymentMethodModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleAddPaymentMethod}
        culqiPublicKey={culqiPublicKey}
      />
    </>
  )
}

export default PaymentMethodList
