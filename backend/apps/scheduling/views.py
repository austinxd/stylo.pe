"""
Views para disponibilidad (endpoint público).
"""
from datetime import datetime, timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db.models import Q

from apps.core.models import Branch
from apps.services.models import Service
from apps.accounts.models import StaffMember
from apps.subscriptions.models import StaffSubscription
from .services import AvailabilityService
from .serializers import DayAvailabilitySerializer


class AvailabilityView(APIView):
    """
    GET /businesses/{slug}/branches/{id}/availability
    Obtiene la disponibilidad para un servicio.
    """
    permission_classes = [AllowAny]

    def get(self, request, branch_id):
        branch = get_object_or_404(Branch, pk=branch_id, is_active=True)

        # Parámetros
        service_id = request.query_params.get('service_id')
        staff_id = request.query_params.get('staff_id')
        date_str = request.query_params.get('date')

        if not service_id:
            return Response(
                {'error': 'service_id es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Obtener servicio
        service = get_object_or_404(Service, pk=service_id, branch=branch, is_active=True)

        # Obtener profesional (opcional)
        staff = None
        if staff_id:
            staff = get_object_or_404(
                StaffMember, pk=staff_id, branches=branch, is_active=True
            )
            # Verificar que tenga membresía válida (billable o en trial vigente)
            now = timezone.now()
            has_valid_subscription = StaffSubscription.objects.filter(
                staff=staff, business=branch.business, is_active=True
            ).filter(
                Q(is_billable=True) | Q(trial_ends_at__gt=now)
            ).exists()
            if not has_valid_subscription:
                return Response(
                    {'error': 'Profesional no disponible para reservas'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Fecha (por defecto hoy)
        if date_str:
            try:
                date = datetime.strptime(date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Formato de fecha inválido. Use YYYY-MM-DD'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            date = timezone.now().date()

        # No permitir fechas pasadas
        if date < timezone.now().date():
            return Response(
                {'error': 'No se puede consultar disponibilidad de fechas pasadas'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Calcular disponibilidad
        availability_service = AvailabilityService(branch)
        slots = availability_service.get_available_slots(service, staff, date)

        return Response({
            'date': date,
            'service': {
                'id': service.id,
                'name': service.name,
                'duration': service.duration_minutes,
                'price': float(service.price)
            },
            'staff': {
                'id': staff.id,
                'name': staff.full_name
            } if staff else None,
            'slots': [
                {
                    'datetime': slot['datetime'].isoformat(),
                    'staff_id': slot['staff_id'],
                    'staff_name': slot['staff_name']
                }
                for slot in slots
            ],
            'available_count': len(slots)
        })


class MonthAvailabilityView(APIView):
    """
    GET /businesses/{slug}/branches/{id}/availability/month
    Obtiene resumen de disponibilidad del mes.
    """
    permission_classes = [AllowAny]

    def get(self, request, branch_id):
        branch = get_object_or_404(Branch, pk=branch_id, is_active=True)

        # Parámetros
        service_id = request.query_params.get('service_id')
        staff_id = request.query_params.get('staff_id')
        month = request.query_params.get('month')  # Formato: YYYY-MM

        if not service_id:
            return Response(
                {'error': 'service_id es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        service = get_object_or_404(Service, pk=service_id, branch=branch, is_active=True)

        staff = None
        if staff_id:
            staff = get_object_or_404(
                StaffMember, pk=staff_id, branches=branch, is_active=True
            )
            # Verificar que tenga membresía válida (billable o en trial vigente)
            now = timezone.now()
            has_valid_subscription = StaffSubscription.objects.filter(
                staff=staff, business=branch.business, is_active=True
            ).filter(
                Q(is_billable=True) | Q(trial_ends_at__gt=now)
            ).exists()
            if not has_valid_subscription:
                return Response(
                    {'error': 'Profesional no disponible para reservas'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # Determinar rango de fechas
        today = timezone.now().date()
        if month:
            try:
                year, month_num = map(int, month.split('-'))
                start_date = max(datetime(year, month_num, 1).date(), today)
                # Último día del mes
                if month_num == 12:
                    end_date = datetime(year + 1, 1, 1).date() - timedelta(days=1)
                else:
                    end_date = datetime(year, month_num + 1, 1).date() - timedelta(days=1)
            except ValueError:
                return Response(
                    {'error': 'Formato de mes inválido. Use YYYY-MM'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            start_date = today
            end_date = today + timedelta(days=30)

        days = (end_date - start_date).days + 1

        # Calcular disponibilidad
        availability_service = AvailabilityService(branch)
        days_availability = availability_service.get_days_availability(
            service, staff, start_date, days
        )

        return Response({
            'start_date': start_date,
            'end_date': end_date,
            'service_id': service.id,
            'staff_id': staff.id if staff else None,
            'days': [
                {
                    'date': day['date'].isoformat(),
                    'available': day['is_available'],
                    'slots_count': day['available_slots_count']
                }
                for day in days_availability
            ]
        })
