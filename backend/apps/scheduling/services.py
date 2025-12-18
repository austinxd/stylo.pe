"""
Servicio de cálculo de disponibilidad.
"""
from datetime import datetime, timedelta, time
from typing import List, Optional
from django.utils import timezone
from django.db.models import Q

from apps.core.models import Branch
from apps.accounts.models import StaffMember
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from .models import BranchSchedule, WorkSchedule, BlockedTime, SpecialDate


class AvailabilityService:
    """
    Servicio para calcular la disponibilidad de profesionales y servicios.
    """

    def __init__(self, branch: Branch):
        self.branch = branch
        self._branch_schedules = None
        self._special_dates = None

    @property
    def branch_schedules(self):
        """Cache de horarios de sucursal."""
        if self._branch_schedules is None:
            self._branch_schedules = {
                s.day_of_week: s
                for s in BranchSchedule.objects.filter(branch=self.branch)
            }
        return self._branch_schedules

    def is_branch_open(self, date: datetime.date) -> tuple[bool, Optional[time], Optional[time]]:
        """
        Verifica si la sucursal está abierta en una fecha.

        Returns:
            tuple: (is_open, opening_time, closing_time)
        """
        # Verificar fecha especial
        try:
            special = SpecialDate.objects.get(branch=self.branch, date=date)
            if special.date_type == 'closed':
                return False, None, None
            if special.date_type == 'special_hours':
                return True, special.opening_time, special.closing_time
        except SpecialDate.DoesNotExist:
            pass

        # Horario regular
        day_of_week = date.weekday()
        schedule = self.branch_schedules.get(day_of_week)

        if schedule and schedule.is_open:
            return True, schedule.opening_time, schedule.closing_time

        return False, None, None

    def get_staff_availability(
        self,
        staff: StaffMember,
        date: datetime.date
    ) -> tuple[bool, Optional[time], Optional[time]]:
        """
        Obtiene la disponibilidad de un profesional para una fecha.

        Returns:
            tuple: (is_available, start_time, end_time)
        """
        # Verificar si la sucursal está abierta
        branch_open, branch_start, branch_end = self.is_branch_open(date)
        if not branch_open:
            return False, None, None

        # Obtener horario de trabajo del día para esta sucursal específica
        day_of_week = date.weekday()
        try:
            work_schedule = WorkSchedule.objects.get(
                staff=staff,
                branch=self.branch,
                day_of_week=day_of_week,
                is_working=True
            )
        except WorkSchedule.DoesNotExist:
            return False, None, None

        # Calcular horario efectivo (intersección con horario de sucursal)
        start_time = max(work_schedule.start_time, branch_start)
        end_time = min(work_schedule.end_time, branch_end)

        if start_time >= end_time:
            return False, None, None

        return True, start_time, end_time

    def get_available_slots(
        self,
        service: Service,
        staff: Optional[StaffMember],
        date: datetime.date,
        slot_duration: int = 30
    ) -> List[dict]:
        """
        Calcula los slots disponibles para un servicio en una fecha.

        Args:
            service: Servicio a reservar
            staff: Profesional específico (opcional)
            date: Fecha de la reserva
            slot_duration: Duración de cada slot en minutos

        Returns:
            List de slots disponibles
        """
        slots = []

        # Obtener duración del servicio
        service_duration = service.total_duration

        # Determinar qué profesionales considerar
        now = timezone.now()
        if staff:
            # Verificar que el staff tiene membresía válida:
            # is_active=True AND (is_billable=True OR trial_ends_at > now)
            has_valid_subscription = StaffSubscription.objects.filter(
                staff=staff,
                business=self.branch.business,
                is_active=True
            ).filter(
                Q(is_billable=True) | Q(trial_ends_at__gt=now)
            ).exists()
            staff_list = [staff] if has_valid_subscription else []
        else:
            # Obtener IDs de profesionales con membresía válida
            valid_staff_ids = StaffSubscription.objects.filter(
                business=self.branch.business,
                is_active=True
            ).filter(
                Q(is_billable=True) | Q(trial_ends_at__gt=now)
            ).values_list('staff_id', flat=True)

            # Obtener todos los profesionales que ofrecen el servicio Y tienen membresía válida
            staff_services = StaffService.objects.filter(
                service=service,
                is_active=True,
                staff__is_active=True,
                staff_id__in=valid_staff_ids
            ).select_related('staff')
            staff_list = [ss.staff for ss in staff_services]

        if not staff_list:
            return slots

        # Verificar disponibilidad de cada profesional
        for s in staff_list:
            is_available, start_time, end_time = self.get_staff_availability(s, date)
            if not is_available:
                continue

            # Verificar bloqueos del día
            blocked_times = BlockedTime.objects.filter(
                staff=s,
                start_datetime__date__lte=date,
                end_datetime__date__gte=date
            )

            # Generar slots
            current_datetime = timezone.make_aware(
                datetime.combine(date, start_time)
            )
            end_datetime = timezone.make_aware(
                datetime.combine(date, end_time)
            )

            while current_datetime + timedelta(minutes=service_duration) <= end_datetime:
                slot_end = current_datetime + timedelta(minutes=service_duration)

                # Verificar si el slot está bloqueado
                is_blocked = any(
                    bt.start_datetime <= current_datetime < bt.end_datetime or
                    bt.start_datetime < slot_end <= bt.end_datetime
                    for bt in blocked_times
                )

                if not is_blocked:
                    # Verificar si ya hay cita en ese horario
                    from apps.appointments.models import Appointment
                    has_appointment = Appointment.objects.filter(
                        staff=s,
                        start_datetime__lt=slot_end,
                        end_datetime__gt=current_datetime,
                        status__in=['pending', 'confirmed']
                    ).exists()

                    if not has_appointment:
                        slots.append({
                            'datetime': current_datetime,
                            'available': True,
                            'staff_id': s.id,
                            'staff_name': s.full_name
                        })

                current_datetime += timedelta(minutes=slot_duration)

        # Ordenar por hora
        slots.sort(key=lambda x: x['datetime'])

        return slots

    def get_days_availability(
        self,
        service: Service,
        staff: Optional[StaffMember],
        start_date: datetime.date,
        days: int = 30
    ) -> List[dict]:
        """
        Calcula la disponibilidad de múltiples días.

        Returns:
            List de días con su disponibilidad
        """
        result = []

        for i in range(days):
            date = start_date + timedelta(days=i)
            slots = self.get_available_slots(service, staff, date)

            result.append({
                'date': date,
                'is_available': len(slots) > 0,
                'available_slots_count': len(slots)
            })

        return result
