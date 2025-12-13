import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import appointmentsApi from '@/api/appointments'
import type { BookingFormData } from '@/types'

/**
 * Hook para manejar las citas del cliente.
 */
export function useAppointments() {
  const queryClient = useQueryClient()

  // Query para próximas citas
  const upcomingQuery = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: appointmentsApi.getUpcoming,
  })

  // Query para historial
  const historyQuery = useQuery({
    queryKey: ['appointments', 'history'],
    queryFn: appointmentsApi.getHistory,
  })

  // Mutation para crear cita
  const createMutation = useMutation({
    mutationFn: (data: BookingFormData) => appointmentsApi.createAppointment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  // Mutation para cancelar cita
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      appointmentsApi.cancelAppointment(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  return {
    // Queries
    upcoming: upcomingQuery.data,
    history: historyQuery.data,
    isLoadingUpcoming: upcomingQuery.isLoading,
    isLoadingHistory: historyQuery.isLoading,

    // Mutations
    createAppointment: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.error,

    cancelAppointment: (id: number, reason?: string) =>
      cancelMutation.mutate({ id, reason }),
    isCancelling: cancelMutation.isPending,

    // Refetch
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  }
}

export default useAppointments
