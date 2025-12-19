"""
Views para el dashboard de negocios.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Sum, Count
from datetime import timedelta

from apps.core.models import Business, Branch, BranchPhoto
from apps.core.serializers import BusinessPublicDetailSerializer, BranchSerializer
from apps.accounts.models import StaffMember, Client
from apps.services.models import Service, ServiceCategory, StaffService
from apps.appointments.models import Appointment
from apps.scheduling.models import WorkSchedule, BlockedTime
from apps.subscriptions.models import StaffSubscription
from common.permissions import IsBusinessOwner, IsBranchManager
from .serializers import (
    DashboardBranchSerializer,
    DashboardStaffSerializer,
    DashboardAppointmentSerializer,
    DashboardServiceSerializer,
    DashboardSummarySerializer,
    StaffCreateUpdateSerializer,
    ServiceCreateUpdateSerializer,
    WorkScheduleUpdateSerializer,
    BlockedTimeCreateSerializer,
    BranchPhotoSerializer,
    BranchPhotoCreateSerializer
)


class MyBusinessView(APIView):
    """
    GET /dashboard/my-business
    Obtiene el negocio del usuario autenticado con sus sucursales.
    Usado para generacion de QR y configuracion.

    PATCH /dashboard/my-business
    Actualiza los datos del negocio del usuario autenticado.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]

    def _get_user_business(self, user):
        """Obtiene el negocio asociado al usuario."""
        if user.role == 'business_owner':
            return user.owned_businesses.first()
        elif user.role in ['branch_manager', 'staff']:
            if hasattr(user, 'managed_branches') and user.managed_branches.exists():
                return user.managed_branches.first().business
            elif hasattr(user, 'staff_profile') and user.staff_profile.branch:
                return user.staff_profile.branch.business
        return None

    def get(self, request):
        user = request.user
        business = self._get_user_business(user)

        if not business:
            return Response(
                {'error': 'No tienes un negocio configurado'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Obtener sucursales activas
        branches = business.branches.filter(is_active=True)

        return Response({
            'business': BusinessPublicDetailSerializer(business).data,
            'branches': BranchSerializer(branches, many=True).data
        })

    def patch(self, request):
        """Actualiza los datos del negocio."""
        user = request.user

        # Solo business_owner puede editar
        if user.role != 'business_owner':
            return Response(
                {'error': 'Solo el propietario puede editar el negocio'},
                status=status.HTTP_403_FORBIDDEN
            )

        business = self._get_user_business(user)

        if not business:
            return Response(
                {'error': 'No tienes un negocio configurado'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Campos permitidos para actualizar
        allowed_fields = [
            'name', 'description', 'email', 'phone', 'website',
            'instagram', 'facebook', 'primary_color', 'secondary_color',
            'cover_position'
        ]

        data = request.data
        updated = False

        for field in allowed_fields:
            if field in data:
                setattr(business, field, data[field])
                updated = True

        # Manejar archivos (logo y cover_image)
        if 'logo' in request.FILES:
            business.logo = request.FILES['logo']
            updated = True

        if 'cover_image' in request.FILES:
            business.cover_image = request.FILES['cover_image']
            updated = True

        if updated:
            business.save()

        # Manejar categorías (ManyToMany)
        if 'category_ids' in data:
            from apps.core.models import BusinessCategory
            category_ids = data['category_ids']
            if isinstance(category_ids, list):
                categories = BusinessCategory.objects.filter(id__in=category_ids, is_active=True)
                business.categories.set(categories)

        # Obtener sucursales activas
        branches = business.branches.filter(is_active=True)

        return Response({
            'success': True,
            'message': 'Negocio actualizado correctamente',
            'business': BusinessPublicDetailSerializer(business).data,
            'branches': BranchSerializer(branches, many=True).data
        })


class DashboardSummaryView(APIView):
    """
    GET /dashboard/summary
    Resumen general del dashboard.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]

    def get(self, request):
        from datetime import datetime, time
        user = request.user
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)  # Domingo

        # Convertir fechas a datetime para evitar problemas con CONVERT_TZ de MySQL
        today_start = timezone.make_aware(datetime.combine(today, time.min))
        today_end = timezone.make_aware(datetime.combine(today, time.max))
        week_start_dt = timezone.make_aware(datetime.combine(week_start, time.min))
        week_end_dt = timezone.make_aware(datetime.combine(week_end, time.max))

        # Obtener sucursales del usuario
        if user.role == 'super_admin':
            branches = Branch.objects.all()
        elif user.role == 'business_owner':
            branches = Branch.objects.filter(business__in=user.owned_businesses.all())
        else:
            branches = user.managed_branches.all()

        branch_ids = branches.values_list('id', flat=True)

        # Citas de hoy (todas las que no están canceladas)
        appointments_today = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=today_start,
            start_datetime__lte=today_end,
            status__in=['pending', 'confirmed', 'in_progress', 'completed']
        ).count()

        # Citas de la semana (lunes a domingo, incluyendo futuras)
        appointments_week = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=week_start_dt,
            start_datetime__lte=week_end_dt,
            status__in=['pending', 'confirmed', 'in_progress', 'completed']
        ).count()

        # Ingresos de hoy (citas completadas)
        revenue_today = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=today_start,
            start_datetime__lte=today_end,
            status='completed'
        ).aggregate(total=Sum('price'))['total'] or 0

        # Ingresos de la semana (citas completadas + confirmadas como ingresos esperados)
        revenue_week = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=week_start_dt,
            start_datetime__lte=week_end_dt,
            status__in=['completed', 'confirmed', 'in_progress']
        ).aggregate(total=Sum('price'))['total'] or 0

        # Clientes nuevos esta semana
        clients_new = Client.objects.filter(
            created_at__gte=week_start_dt
        ).count()

        # Próximas citas (incluye hoy y futuras)
        upcoming = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=timezone.now(),
            status__in=['pending', 'confirmed']
        ).select_related(
            'client', 'staff', 'service'
        ).order_by('start_datetime')[:10]

        return Response({
            'appointments_today': appointments_today,
            'appointments_week': appointments_week,
            'revenue_today': float(revenue_today),
            'revenue_week': float(revenue_week),
            'clients_new_week': clients_new,
            'upcoming_appointments': DashboardAppointmentSerializer(upcoming, many=True).data
        })


class DashboardStatsView(APIView):
    """
    GET /dashboard/stats/?month=2025-12
    Estadísticas mensuales con métricas de eficiencia.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]

    def get(self, request):
        from datetime import datetime, time
        from calendar import monthrange
        from django.db.models import Avg, F
        from django.db.models.functions import TruncDate

        user = request.user

        # Obtener mes del parámetro o usar mes actual
        month_param = request.query_params.get('month')
        if month_param:
            try:
                year, month = map(int, month_param.split('-'))
            except ValueError:
                year = timezone.now().year
                month = timezone.now().month
        else:
            year = timezone.now().year
            month = timezone.now().month

        # Calcular rango del mes
        first_day = timezone.make_aware(datetime(year, month, 1, 0, 0, 0))
        last_day_num = monthrange(year, month)[1]
        last_day = timezone.make_aware(datetime(year, month, last_day_num, 23, 59, 59))

        # Mes anterior para comparación
        if month == 1:
            prev_year, prev_month = year - 1, 12
        else:
            prev_year, prev_month = year, month - 1
        prev_first_day = timezone.make_aware(datetime(prev_year, prev_month, 1, 0, 0, 0))
        prev_last_day_num = monthrange(prev_year, prev_month)[1]
        prev_last_day = timezone.make_aware(datetime(prev_year, prev_month, prev_last_day_num, 23, 59, 59))

        # Obtener sucursales del usuario
        if user.role == 'super_admin':
            branches = Branch.objects.all()
        elif user.role == 'business_owner':
            branches = Branch.objects.filter(business__in=user.owned_businesses.all())
        else:
            branches = user.managed_branches.all()

        branch_ids = list(branches.values_list('id', flat=True))

        # === MÉTRICAS DEL MES ACTUAL ===
        appointments_qs = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=first_day,
            start_datetime__lte=last_day
        )

        # Total de citas programadas
        total_appointments = appointments_qs.count()

        # Citas completadas
        completed = appointments_qs.filter(status='completed').count()

        # Citas canceladas
        cancelled = appointments_qs.filter(status='cancelled').count()

        # No shows
        no_shows = appointments_qs.filter(status='no_show').count()

        # Ingresos del mes (completadas)
        revenue = appointments_qs.filter(
            status='completed'
        ).aggregate(total=Sum('price'))['total'] or 0

        # Ingresos esperados (confirmadas + en progreso)
        expected_revenue = appointments_qs.filter(
            status__in=['confirmed', 'in_progress', 'completed']
        ).aggregate(total=Sum('price'))['total'] or 0

        # Ticket promedio
        avg_ticket = appointments_qs.filter(
            status='completed'
        ).aggregate(avg=Avg('price'))['avg'] or 0

        # Clientes nuevos del mes
        new_clients = Client.objects.filter(
            created_at__gte=first_day,
            created_at__lte=last_day
        ).count()

        # === MÉTRICAS DEL MES ANTERIOR (para comparación) ===
        prev_appointments_qs = Appointment.objects.filter(
            branch_id__in=branch_ids,
            start_datetime__gte=prev_first_day,
            start_datetime__lte=prev_last_day
        )
        prev_total = prev_appointments_qs.count()
        prev_completed = prev_appointments_qs.filter(status='completed').count()
        prev_revenue = prev_appointments_qs.filter(
            status='completed'
        ).aggregate(total=Sum('price'))['total'] or 0

        # === TASAS Y PORCENTAJES ===
        # Tasa de completitud
        completion_rate = (completed / total_appointments * 100) if total_appointments > 0 else 0

        # Tasa de cancelación
        cancellation_rate = (cancelled / total_appointments * 100) if total_appointments > 0 else 0

        # Tasa de no shows
        no_show_rate = (no_shows / total_appointments * 100) if total_appointments > 0 else 0

        # Cambios vs mes anterior
        appointments_change = ((total_appointments - prev_total) / prev_total * 100) if prev_total > 0 else 0
        revenue_change = ((float(revenue) - float(prev_revenue)) / float(prev_revenue) * 100) if prev_revenue > 0 else 0

        # === DATOS DIARIOS PARA GRÁFICO ===
        # Usar extracción manual de fecha para compatibilidad con MySQL
        from django.db.models.functions import Cast
        from django.db.models import DateField

        daily_appointments = []
        daily_revenue = []

        # Obtener todas las citas del período y agrupar en Python
        appointments_for_charts = appointments_qs.filter(
            status__in=['completed', 'confirmed', 'in_progress']
        ).values('start_datetime', 'price')

        # Agrupar por fecha en Python para evitar problemas de TruncDate con MySQL
        daily_data_dict = {}
        for apt in appointments_for_charts:
            if apt['start_datetime']:
                date_key = apt['start_datetime'].date().isoformat()
                if date_key not in daily_data_dict:
                    daily_data_dict[date_key] = {'count': 0, 'revenue': 0}
                daily_data_dict[date_key]['count'] += 1
                daily_data_dict[date_key]['revenue'] += float(apt['price'] or 0)

        # Convertir a listas ordenadas por fecha
        for date_str in sorted(daily_data_dict.keys()):
            data = daily_data_dict[date_str]
            daily_appointments.append({
                'date': date_str,
                'count': data['count']
            })
            daily_revenue.append({
                'date': date_str,
                'amount': data['revenue']
            })

        # === SERVICIOS MÁS POPULARES ===
        popular_services = appointments_qs.filter(
            status__in=['completed', 'confirmed', 'in_progress']
        ).values(
            'service__id', 'service__name'
        ).annotate(
            count=Count('id'),
            revenue=Sum('price')
        ).order_by('-count')[:5]

        # === PROFESIONALES MÁS OCUPADOS ===
        staff_stats = appointments_qs.filter(
            status__in=['completed', 'confirmed', 'in_progress']
        ).values(
            'staff__id', 'staff__first_name', 'staff__last_name_paterno'
        ).annotate(
            appointments=Count('id'),
            revenue=Sum('price')
        ).order_by('-appointments')[:5]

        return Response({
            'period': {
                'year': year,
                'month': month,
                'month_name': first_day.strftime('%B'),
                'start_date': first_day.date().isoformat(),
                'end_date': last_day.date().isoformat()
            },
            'overview': {
                'total_appointments': total_appointments,
                'completed_appointments': completed,
                'cancelled_appointments': cancelled,
                'no_shows': no_shows,
                'new_clients': new_clients,
                'revenue': float(revenue),
                'expected_revenue': float(expected_revenue),
                'avg_ticket': round(float(avg_ticket), 2)
            },
            'efficiency': {
                'completion_rate': round(completion_rate, 1),
                'cancellation_rate': round(cancellation_rate, 1),
                'no_show_rate': round(no_show_rate, 1)
            },
            'comparison': {
                'appointments_change': round(appointments_change, 1),
                'revenue_change': round(revenue_change, 1),
                'prev_appointments': prev_total,
                'prev_revenue': float(prev_revenue)
            },
            'charts': {
                'daily_appointments': daily_appointments,
                'daily_revenue': daily_revenue
            },
            'rankings': {
                'popular_services': [
                    {
                        'id': s['service__id'],
                        'name': s['service__name'],
                        'count': s['count'],
                        'revenue': float(s['revenue'] or 0)
                    }
                    for s in popular_services
                ],
                'top_staff': [
                    {
                        'id': s['staff__id'],
                        'name': f"{s['staff__first_name']} {s['staff__last_name_paterno'] or ''}".strip(),
                        'appointments': s['appointments'],
                        'revenue': float(s['revenue'] or 0)
                    }
                    for s in staff_stats
                ]
            }
        })


class DashboardBranchViewSet(viewsets.ModelViewSet):
    """
    API de sucursales para el dashboard.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]
    serializer_class = DashboardBranchSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'super_admin':
            return Branch.objects.all()
        elif user.role == 'business_owner':
            return Branch.objects.filter(business__in=user.owned_businesses.all())
        return user.managed_branches.all()

    def perform_create(self, serializer):
        """Asigna el business del usuario al crear una sucursal."""
        user = self.request.user
        if user.role == 'business_owner':
            business = user.owned_businesses.first()
        elif hasattr(user, 'managed_branches') and user.managed_branches.exists():
            business = user.managed_branches.first().business
        else:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'error': 'No tienes un negocio asociado'})

        # Manejar cover_image desde request.FILES
        cover_image = self.request.FILES.get('cover_image')
        if cover_image:
            serializer.save(business=business, cover_image=cover_image)
        else:
            serializer.save(business=business)

    def partial_update(self, request, *args, **kwargs):
        """Override para manejar archivos correctamente en PATCH."""
        instance = self.get_object()

        # Manejar cover_image desde request.FILES
        if 'cover_image' in request.FILES:
            instance.cover_image = request.FILES['cover_image']
            instance.save(update_fields=['cover_image'])

        # Continuar con el partial_update normal para los demás campos
        return super().partial_update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Override para manejar archivos correctamente en PUT."""
        instance = self.get_object()

        # Manejar cover_image desde request.FILES
        if 'cover_image' in request.FILES:
            instance.cover_image = request.FILES['cover_image']
            instance.save(update_fields=['cover_image'])

        # Continuar con el update normal para los demás campos
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['get', 'put'])
    def schedule(self, request, pk=None):
        """
        Obtiene o actualiza el horario de atención de la sucursal.

        GET: Retorna los 7 días con su configuración
        PUT: Actualiza el horario completo
             Recibe: { schedules: [{day_of_week: 0, opening_time: "09:00", closing_time: "18:00", is_open: true}, ...] }
        """
        from apps.scheduling.models import BranchSchedule

        branch = self.get_object()
        days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

        if request.method == 'GET':
            schedules = BranchSchedule.objects.filter(branch=branch).order_by('day_of_week')
            schedule_dict = {s.day_of_week: s for s in schedules}

            result = []
            for day_num in range(7):
                if day_num in schedule_dict:
                    s = schedule_dict[day_num]
                    result.append({
                        'day_of_week': day_num,
                        'day_name': days[day_num],
                        'opening_time': s.opening_time.strftime('%H:%M') if s.opening_time else '09:00',
                        'closing_time': s.closing_time.strftime('%H:%M') if s.closing_time else '19:00',
                        'is_open': s.is_open
                    })
                else:
                    result.append({
                        'day_of_week': day_num,
                        'day_name': days[day_num],
                        'opening_time': '09:00',
                        'closing_time': '19:00',
                        'is_open': False
                    })

            return Response({'schedules': result})

        # PUT - actualizar horarios
        schedules_data = request.data.get('schedules', [])

        # Variables para actualizar el horario general del Branch
        first_open_day = None

        for schedule_item in schedules_data:
            day_of_week = schedule_item.get('day_of_week')
            if day_of_week is None or day_of_week < 0 or day_of_week > 6:
                continue

            opening_time = schedule_item.get('opening_time', '09:00')
            closing_time = schedule_item.get('closing_time', '19:00')
            is_open = schedule_item.get('is_open', False)

            BranchSchedule.objects.update_or_create(
                branch=branch,
                day_of_week=day_of_week,
                defaults={
                    'opening_time': opening_time,
                    'closing_time': closing_time,
                    'is_open': is_open
                }
            )

            # Guardar el primer día abierto para usarlo como horario general
            if is_open and first_open_day is None:
                first_open_day = {
                    'opening_time': opening_time,
                    'closing_time': closing_time
                }

        # Actualizar opening_time y closing_time del Branch con el primer día abierto
        if first_open_day:
            branch.opening_time = first_open_day['opening_time']
            branch.closing_time = first_open_day['closing_time']
            branch.save(update_fields=['opening_time', 'closing_time'])

        # Retornar horarios actualizados
        schedules = BranchSchedule.objects.filter(branch=branch).order_by('day_of_week')
        schedule_dict = {s.day_of_week: s for s in schedules}

        result = []
        for day_num in range(7):
            if day_num in schedule_dict:
                s = schedule_dict[day_num]
                result.append({
                    'day_of_week': day_num,
                    'day_name': days[day_num],
                    'opening_time': s.opening_time.strftime('%H:%M') if s.opening_time else '09:00',
                    'closing_time': s.closing_time.strftime('%H:%M') if s.closing_time else '19:00',
                    'is_open': s.is_open
                })
            else:
                result.append({
                    'day_of_week': day_num,
                    'day_name': days[day_num],
                    'opening_time': '09:00',
                    'closing_time': '19:00',
                    'is_open': False
                })

        return Response({'schedules': result, 'message': 'Horarios actualizados correctamente'})

    @action(detail=True, methods=['get'])
    def staff(self, request, pk=None):
        """Obtiene los profesionales de una sucursal específica."""
        branch = self.get_object()
        staff_members = StaffMember.objects.filter(
            branches=branch,
            is_active=True
        ).order_by('first_name')
        return Response(DashboardStaffSerializer(staff_members, many=True).data)

    @action(detail=True, methods=['get'])
    def calendar(self, request, pk=None):
        """Obtiene las citas para el calendario.

        Soporta filtro por fecha única (date) o rango de fechas (start_date, end_date).
        """
        branch = self.get_object()
        date_str = request.query_params.get('date')
        start_date_str = request.query_params.get('start_date')
        end_date_str = request.query_params.get('end_date')

        from datetime import datetime as dt
        import pytz
        local_tz = pytz.timezone('America/Lima')

        # Si se proporciona un rango de fechas (para vista mensual)
        if start_date_str and end_date_str:
            try:
                start_date = dt.strptime(start_date_str, '%Y-%m-%d').date()
                end_date = dt.strptime(end_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response(
                    {'error': 'Formato de fecha inválido'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            start_datetime = local_tz.localize(dt.combine(start_date, dt.min.time()))
            end_datetime = local_tz.localize(dt.combine(end_date, dt.max.time()))
        else:
            # Filtro por fecha única (para vista diaria)
            if date_str:
                try:
                    date = dt.strptime(date_str, '%Y-%m-%d').date()
                except ValueError:
                    return Response(
                        {'error': 'Formato de fecha inválido'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
            else:
                date = timezone.now().date()

            start_datetime = local_tz.localize(dt.combine(date, dt.min.time()))
            end_datetime = local_tz.localize(dt.combine(date, dt.max.time()))

        appointments = Appointment.objects.filter(
            branch=branch,
            start_datetime__gte=start_datetime,
            start_datetime__lte=end_datetime
        ).select_related('client', 'staff', 'service').order_by('start_datetime')

        return Response(DashboardAppointmentSerializer(appointments, many=True).data)

    @action(detail=True, methods=['get'])
    def appointments(self, request, pk=None):
        """Lista las citas de la sucursal."""
        branch = self.get_object()
        status_filter = request.query_params.get('status')

        appointments = Appointment.objects.filter(
            branch=branch
        ).select_related('client', 'staff', 'service')

        if status_filter:
            appointments = appointments.filter(status=status_filter)

        appointments = appointments.order_by('-start_datetime')[:50]

        return Response(DashboardAppointmentSerializer(appointments, many=True).data)

    @action(detail=True, methods=['post'])
    def set_main(self, request, pk=None):
        """Marca una sucursal como principal."""
        branch = self.get_object()

        # Quitar is_main de todas las otras sucursales del mismo negocio
        Branch.objects.filter(business=branch.business, is_main=True).update(is_main=False)

        # Marcar esta como principal
        branch.is_main = True
        branch.save()

        return Response({
            'success': True,
            'message': f'"{branch.name}" ahora es la sucursal principal'
        })

    @action(detail=True, methods=['get', 'post'])
    def photos(self, request, pk=None):
        """
        GET: Lista las fotos de la sucursal.
        POST: Agrega una nueva foto a la sucursal.
        """
        branch = self.get_object()

        if request.method == 'GET':
            photos = branch.photos.all().order_by('-is_cover', 'order', '-created_at')
            return Response(BranchPhotoSerializer(photos, many=True).data)

        # POST - agregar foto
        serializer = BranchPhotoCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Si es la primera foto, marcarla como cover automáticamente
        is_first = not branch.photos.exists()
        is_cover = serializer.validated_data.get('is_cover', False) or is_first

        photo = BranchPhoto.objects.create(
            branch=branch,
            is_cover=is_cover,
            **{k: v for k, v in serializer.validated_data.items() if k != 'is_cover'}
        )

        return Response(
            BranchPhotoSerializer(photo).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['delete'], url_path='photos/(?P<photo_id>[^/.]+)')
    def delete_photo(self, request, pk=None, photo_id=None):
        """Elimina una foto de la sucursal."""
        branch = self.get_object()

        try:
            photo = branch.photos.get(id=photo_id)
        except BranchPhoto.DoesNotExist:
            return Response(
                {'error': 'Foto no encontrada'},
                status=status.HTTP_404_NOT_FOUND
            )

        was_cover = photo.is_cover
        photo.delete()

        # Si era la cover, marcar la siguiente como cover
        if was_cover:
            next_photo = branch.photos.first()
            if next_photo:
                next_photo.is_cover = True
                next_photo.save()

        return Response({'success': True, 'message': 'Foto eliminada'})

    @action(detail=True, methods=['post'], url_path='photos/(?P<photo_id>[^/.]+)/set-cover')
    def set_photo_cover(self, request, pk=None, photo_id=None):
        """Marca una foto como portada."""
        branch = self.get_object()

        try:
            photo = branch.photos.get(id=photo_id)
        except BranchPhoto.DoesNotExist:
            return Response(
                {'error': 'Foto no encontrada'},
                status=status.HTTP_404_NOT_FOUND
            )

        # El modelo ya se encarga de desmarcar las otras
        photo.is_cover = True
        photo.save()

        return Response({
            'success': True,
            'message': f'Foto marcada como portada'
        })

    @action(detail=True, methods=['post'], url_path='photos/reorder')
    def reorder_photos(self, request, pk=None):
        """Reordena las fotos de la sucursal."""
        branch = self.get_object()
        photo_ids = request.data.get('photo_ids', [])

        if not photo_ids:
            return Response(
                {'error': 'Se requiere la lista de photo_ids'},
                status=status.HTTP_400_BAD_REQUEST
            )

        for index, photo_id in enumerate(photo_ids):
            branch.photos.filter(id=photo_id).update(order=index)

        return Response({
            'success': True,
            'message': 'Fotos reordenadas'
        })


class DashboardStaffViewSet(viewsets.ModelViewSet):
    """
    API de profesionales para el dashboard.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'super_admin':
            return StaffMember.objects.all().prefetch_related('branches')
        elif user.role == 'business_owner':
            return StaffMember.objects.filter(
                branches__business__in=user.owned_businesses.all()
            ).distinct().prefetch_related('branches')
        return StaffMember.objects.filter(
            branches__in=user.managed_branches.all()
        ).distinct().prefetch_related('branches')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return StaffCreateUpdateSerializer
        return DashboardStaffSerializer

    def perform_create(self, serializer):
        """Crea el User asociado al StaffMember."""
        from apps.accounts.models import User

        # DEBUG: Ver qué llega en el request al crear
        print("=" * 50)
        print("[DEBUG] POST Staff - Crear nuevo")
        print(f"[DEBUG] request.FILES: {self.request.FILES}")
        print(f"[DEBUG] request.FILES.keys(): {list(self.request.FILES.keys())}")
        print(f"[DEBUG] request.data: {self.request.data}")
        print(f"[DEBUG] request.data.keys(): {list(self.request.data.keys())}")
        print(f"[DEBUG] Content-Type: {self.request.content_type}")
        if 'photo' in self.request.FILES:
            photo_file = self.request.FILES['photo']
            print(f"[DEBUG] Photo encontrada: {photo_file.name}, size: {photo_file.size}")
        else:
            print("[DEBUG] NO hay 'photo' en request.FILES")
        if 'photo' in self.request.data:
            print(f"[DEBUG] 'photo' en request.data: {type(self.request.data['photo'])}")
        print("=" * 50)

        # Crear usuario sin teléfono (se agregará cuando el staff active su cuenta)
        user = User.objects.create_user(
            role='staff',
            is_verified=False
        )

        # Manejar photo desde request.FILES
        photo = self.request.FILES.get('photo')
        if photo:
            staff = serializer.save(user=user, created_by_admin=True, photo=photo)
            print(f"[DEBUG] Staff creado con foto")
        else:
            staff = serializer.save(user=user, created_by_admin=True)
            print(f"[DEBUG] Staff creado SIN foto")

        # Crear StaffSubscription para el trial del nuevo profesional
        # Obtener el business de las sucursales asignadas
        branch_ids = self.request.data.getlist('branch_ids', [])
        if not branch_ids:
            branch_ids = self.request.data.get('branch_ids', [])
        if branch_ids:
            first_branch = Branch.objects.filter(id=branch_ids[0]).first()
            if first_branch:
                business = first_branch.business
                # Crear suscripción con trial (trial_ends_at se calcula automáticamente)
                StaffSubscription.objects.get_or_create(
                    business=business,
                    staff=staff,
                    defaults={'is_active': True}
                )
                print(f"[DEBUG] StaffSubscription creada para {staff.full_name} en {business.name}")

    def partial_update(self, request, *args, **kwargs):
        """Override para manejar archivos correctamente en PATCH."""
        instance = self.get_object()

        # DEBUG: Ver qué llega en el request
        print("=" * 50)
        print(f"[DEBUG] PATCH Staff ID: {instance.id}")
        print(f"[DEBUG] request.FILES: {request.FILES}")
        print(f"[DEBUG] request.FILES.keys(): {list(request.FILES.keys())}")
        print(f"[DEBUG] request.data: {request.data}")
        print(f"[DEBUG] request.data.keys(): {list(request.data.keys())}")
        print(f"[DEBUG] Content-Type: {request.content_type}")
        if 'photo' in request.FILES:
            photo_file = request.FILES['photo']
            print(f"[DEBUG] Photo encontrada: {photo_file.name}, size: {photo_file.size}")
        else:
            print("[DEBUG] NO hay 'photo' en request.FILES")
        if 'photo' in request.data:
            print(f"[DEBUG] 'photo' en request.data: {type(request.data['photo'])}")
        print("=" * 50)

        # Manejar photo desde request.FILES
        if 'photo' in request.FILES:
            instance.photo = request.FILES['photo']
            instance.save(update_fields=['photo'])
            print(f"[DEBUG] Foto guardada: {instance.photo.url}")

        # Continuar con el partial_update normal para los demás campos
        return super().partial_update(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        """Override para manejar archivos correctamente en PUT."""
        instance = self.get_object()

        # Manejar photo desde request.FILES
        if 'photo' in request.FILES:
            instance.photo = request.FILES['photo']
            instance.save(update_fields=['photo'])

        # Continuar con el update normal para los demás campos
        return super().update(request, *args, **kwargs)

    @action(detail=True, methods=['get', 'put'])
    def schedule(self, request, pk=None):
        """Obtiene o actualiza los horarios de trabajo."""
        staff = self.get_object()

        if request.method == 'GET':
            schedules = WorkSchedule.objects.filter(staff=staff).order_by('day_of_week')
            return Response(WorkScheduleUpdateSerializer(schedules, many=True).data)

        # PUT - actualizar horarios
        schedules_data = request.data.get('schedules', [])
        for schedule_data in schedules_data:
            WorkSchedule.objects.update_or_create(
                staff=staff,
                day_of_week=schedule_data['day_of_week'],
                defaults={
                    'start_time': schedule_data.get('start_time'),
                    'end_time': schedule_data.get('end_time'),
                    'is_working': schedule_data.get('is_working', True)
                }
            )

        schedules = WorkSchedule.objects.filter(staff=staff).order_by('day_of_week')
        return Response(WorkScheduleUpdateSerializer(schedules, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def blocked_times(self, request, pk=None):
        """Gestiona los tiempos bloqueados."""
        staff = self.get_object()

        if request.method == 'GET':
            blocked = BlockedTime.objects.filter(
                staff=staff,
                end_datetime__gte=timezone.now()
            ).order_by('start_datetime')
            return Response(BlockedTimeCreateSerializer(blocked, many=True).data)

        # POST - crear bloqueo
        serializer = BlockedTimeCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        BlockedTime.objects.create(staff=staff, **serializer.validated_data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='lookup-dni')
    def lookup_dni(self, request):
        """
        Consulta datos de persona por DNI desde API externa.

        Recibe: dni (string de 8 dígitos)
        Retorna: { found: bool, first_name, last_name_paterno, last_name_materno, photo_base64 }
        """
        from apps.accounts.services.dni_service import DNIService

        dni = request.data.get('dni', '').strip()
        if not dni:
            return Response(
                {'error': 'DNI es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = DNIService.lookup_dni(dni)
        return Response(result)

    @action(detail=False, methods=['post'], url_path='lookup')
    def lookup_staff(self, request):
        """
        Buscar profesional por documento.

        Si existe, retorna sus datos para agregarlo a una sucursal.
        Si no existe, retorna found=false para crear uno nuevo.

        Recibe: document_type, document_number
        Retorna: { found: bool, staff?: {...} }
        """
        document_type = request.data.get('document_type')
        document_number = request.data.get('document_number', '').strip().upper()

        if not document_type or not document_number:
            return Response(
                {'error': 'document_type y document_number son requeridos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Normalizar documento (solo alfanuméricos)
        document_number = ''.join(c for c in document_number if c.isalnum())

        try:
            staff = StaffMember.objects.prefetch_related('branches').get(
                document_type=document_type,
                document_number=document_number
            )
            branches = list(staff.branches.all())
            return Response({
                'found': True,
                'staff': {
                    'id': staff.id,
                    'first_name': staff.first_name,
                    'last_name_paterno': staff.last_name_paterno,
                    'last_name_materno': staff.last_name_materno or '',
                    'phone_number': staff.phone_number or '',
                    'specialty': staff.specialty or '',
                    'branch_ids': [b.id for b in branches],
                    'branches_info': [{'id': b.id, 'name': b.name} for b in branches],
                    'is_active': staff.is_active,
                }
            })
        except StaffMember.DoesNotExist:
            return Response({'found': False})

    @action(detail=True, methods=['get', 'put'])
    def services(self, request, pk=None):
        """
        Obtiene o actualiza los servicios que ofrece un profesional.

        GET: Retorna lista de servicios disponibles en la sucursal y sus IDs asignados
             ?branch_id=X para filtrar por una sucursal específica (edición contextual)
        PUT: Actualiza los servicios asignados
             Recibe: { branch_service_ids: [1, 2, 3] } (IDs de Service)
        """
        staff = self.get_object()

        if request.method == 'GET':
            # Obtener branch_id del query param para filtrar por sucursal específica
            branch_id = request.query_params.get('branch_id')

            # Obtener servicios disponibles de las sucursales del staff
            branches = staff.branches.all()
            if branch_id:
                # Si se especifica branch_id, solo mostrar servicios de esa sucursal
                branches = branches.filter(id=branch_id)

            if not branches.exists():
                return Response({
                    'available_services': [],
                    'assigned_service_ids': []
                })

            available_services = Service.objects.filter(
                branch__in=branches,
                is_active=True
            ).select_related('category', 'branch').values(
                'id',
                'name',
                'category__name',
                'duration_minutes',
                'price',
                'gender',
                'branch__name',
                'branch_id'
            )

            # Formatear para el frontend
            formatted_services = [
                {
                    'id': s['id'],
                    'service_id': s['id'],
                    'name': s['name'],
                    'category_name': s['category__name'],
                    'duration_minutes': s['duration_minutes'],
                    'price': float(s['price']),
                    'gender': s['gender'],
                    'branch_id': s['branch_id'],
                    'branch_name': s['branch__name']
                }
                for s in available_services
            ]

            # Obtener IDs de servicios asignados al staff (filtrar por branch si se especifica)
            assigned_filter = {'staff': staff, 'is_active': True}
            if branch_id:
                # Solo mostrar asignaciones de servicios de esa sucursal
                assigned_filter['service__branch_id'] = branch_id

            assigned_ids = list(
                StaffService.objects.filter(
                    **assigned_filter
                ).values_list('service_id', flat=True)
            )

            return Response({
                'available_services': formatted_services,
                'assigned_service_ids': assigned_ids
            })

        # PUT - actualizar servicios asignados
        service_ids = request.data.get('branch_service_ids', [])
        branch_id = request.data.get('branch_id')

        # Si se especifica branch_id, solo actualizar servicios de esa sucursal
        if branch_id:
            try:
                branch = staff.branches.get(id=branch_id)
            except Branch.DoesNotExist:
                return Response(
                    {'error': 'El profesional no está asignado a esta sucursal'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Validar que los servicios pertenezcan a la sucursal específica
            valid_services = Service.objects.filter(
                id__in=service_ids,
                branch=branch,
                is_active=True
            ).values_list('id', flat=True)

            # Obtener todos los servicios de esta sucursal
            all_branch_services = Service.objects.filter(
                branch=branch,
                is_active=True
            ).values_list('id', flat=True)

            # Desactivar solo los servicios de esta sucursal que no estén en la lista
            StaffService.objects.filter(
                staff=staff,
                service_id__in=all_branch_services
            ).exclude(
                service_id__in=valid_services
            ).update(is_active=False)

        else:
            # Comportamiento original: actualizar todos los servicios de todas las sucursales
            valid_services = Service.objects.filter(
                id__in=service_ids,
                branch__in=staff.branches.all(),
                is_active=True
            ).values_list('id', flat=True)

            # Desactivar servicios no incluidos
            StaffService.objects.filter(staff=staff).exclude(
                service_id__in=valid_services
            ).update(is_active=False)

        # Crear o activar servicios incluidos
        for service_id in valid_services:
            StaffService.objects.update_or_create(
                staff=staff,
                service_id=service_id,
                defaults={'is_active': True}
            )

        # Obtener lista actualizada (filtrada por branch si se especificó)
        filter_kwargs = {'staff': staff, 'is_active': True}
        if branch_id:
            filter_kwargs['service__branch_id'] = branch_id

        assigned_ids = list(
            StaffService.objects.filter(**filter_kwargs).values_list('service_id', flat=True)
        )

        return Response({
            'success': True,
            'assigned_service_ids': assigned_ids,
            'message': f'{len(assigned_ids)} servicios asignados'
        })

    @action(detail=True, methods=['get', 'put'])
    def schedule(self, request, pk=None):
        """
        Obtiene o actualiza el horario de trabajo de un profesional por sucursal.

        GET: Retorna los 7 días con su configuración para cada sucursal
             ?branch_id=X para filtrar por sucursal específica
        PUT: Actualiza el horario completo
             Recibe: { branch_id: 1, schedules: [{day_of_week: 0, start_time: "09:00", end_time: "18:00", is_working: true}, ...] }
        """
        staff = self.get_object()

        if request.method == 'GET':
            branch_id = request.query_params.get('branch_id')

            # Obtener todas las sucursales del staff
            branches = staff.branches.all()
            if branch_id:
                branches = branches.filter(id=branch_id)

            days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
            result_by_branch = []

            for branch in branches:
                # Obtener horarios existentes para esta sucursal
                schedules = WorkSchedule.objects.filter(
                    staff=staff,
                    branch=branch
                ).order_by('day_of_week')

                # Crear diccionario con los días existentes
                schedule_dict = {s.day_of_week: s for s in schedules}

                # Generar los 7 días
                branch_schedules = []
                for day_num in range(7):
                    if day_num in schedule_dict:
                        s = schedule_dict[day_num]
                        branch_schedules.append({
                            'day_of_week': day_num,
                            'day_name': days[day_num],
                            'start_time': s.start_time.strftime('%H:%M') if s.start_time else '09:00',
                            'end_time': s.end_time.strftime('%H:%M') if s.end_time else '18:00',
                            'is_working': s.is_working
                        })
                    else:
                        branch_schedules.append({
                            'day_of_week': day_num,
                            'day_name': days[day_num],
                            'start_time': '09:00',
                            'end_time': '18:00',
                            'is_working': False
                        })

                result_by_branch.append({
                    'branch_id': branch.id,
                    'branch_name': branch.name,
                    'schedules': branch_schedules
                })

            # Si se pidió una sola sucursal, devolver formato plano para compatibilidad
            if branch_id and len(result_by_branch) == 1:
                return Response({
                    'branch_id': result_by_branch[0]['branch_id'],
                    'branch_name': result_by_branch[0]['branch_name'],
                    'schedules': result_by_branch[0]['schedules']
                })

            return Response({'branches_schedules': result_by_branch})

        # PUT - actualizar horarios
        branch_id = request.data.get('branch_id')
        schedules_data = request.data.get('schedules', [])

        if not branch_id:
            return Response(
                {'error': 'branch_id es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que el staff pertenece a esta sucursal
        try:
            branch = staff.branches.get(id=branch_id)
        except Branch.DoesNotExist:
            return Response(
                {'error': 'El profesional no está asignado a esta sucursal'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from django.core.exceptions import ValidationError as DjangoValidationError

        for schedule_item in schedules_data:
            day_of_week = schedule_item.get('day_of_week')
            if day_of_week is None or day_of_week < 0 or day_of_week > 6:
                continue

            try:
                # Buscar o crear el registro
                try:
                    schedule = WorkSchedule.objects.get(
                        staff=staff,
                        branch=branch,
                        day_of_week=day_of_week
                    )
                except WorkSchedule.DoesNotExist:
                    schedule = WorkSchedule(
                        staff=staff,
                        branch=branch,
                        day_of_week=day_of_week
                    )

                # Actualizar los valores
                schedule.start_time = schedule_item.get('start_time', '09:00')
                schedule.end_time = schedule_item.get('end_time', '18:00')
                schedule.is_working = schedule_item.get('is_working', False)
                # save() llama a full_clean() que valida superposiciones con otras sucursales
                schedule.save()

            except DjangoValidationError as e:
                # Error de validación del modelo (ej: horarios superpuestos)
                # Extraer mensaje limpio del ValidationError
                if hasattr(e, 'message_dict'):
                    # Error con diccionario: {'__all__': ['mensaje']}
                    messages = e.message_dict.get('__all__', [])
                    if messages:
                        error_msg = messages[0]
                    else:
                        # Tomar el primer mensaje de cualquier campo
                        for field_msgs in e.message_dict.values():
                            if field_msgs:
                                error_msg = field_msgs[0]
                                break
                        else:
                            error_msg = str(e)
                elif hasattr(e, 'messages'):
                    error_msg = e.messages[0] if e.messages else str(e)
                elif hasattr(e, 'message'):
                    error_msg = e.message
                else:
                    error_msg = str(e)

                # Formatear horas: 06:30:00 -> 06:30
                import re
                error_msg = re.sub(r'(\d{2}:\d{2}):\d{2}', r'\1', error_msg)

                return Response(
                    {'error': error_msg},
                    status=status.HTTP_400_BAD_REQUEST
                )
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )

        return Response({
            'success': True,
            'message': f'Horario actualizado para {branch.name}'
        })

    @action(detail=False, methods=['post'], url_path='add-to-branch')
    def add_to_branch(self, request):
        """
        Agrega un profesional existente a una sucursal.

        Recibe: staff_id, branch_id
        """
        staff_id = request.data.get('staff_id')
        branch_id = request.data.get('branch_id')

        if not staff_id or not branch_id:
            return Response(
                {'error': 'staff_id y branch_id son requeridos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que la sucursal pertenece al usuario
        user = request.user
        if user.role == 'business_owner':
            branches = Branch.objects.filter(business__in=user.owned_businesses.all())
        else:
            branches = user.managed_branches.all()

        try:
            branch = branches.get(id=branch_id)
        except Branch.DoesNotExist:
            return Response(
                {'error': 'No tienes acceso a esta sucursal'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            staff = StaffMember.objects.prefetch_related('branches').get(id=staff_id)
        except StaffMember.DoesNotExist:
            return Response(
                {'error': 'Profesional no encontrado'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Agregar la sucursal al staff (M2M)
        staff.branches.add(branch)

        return Response({
            'success': True,
            'message': f'{staff.full_name} agregado a {branch.name}',
            'staff': DashboardStaffSerializer(staff).data
        })


class DashboardServiceViewSet(viewsets.ModelViewSet):
    """
    API de servicios para el dashboard.
    Los servicios se crean a nivel de sucursal (Branch).
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]

    def get_queryset(self):
        user = self.request.user
        branch_id = self.request.query_params.get('branch_id')

        if user.role == 'super_admin':
            qs = Service.objects.all()
        elif user.role == 'business_owner':
            qs = Service.objects.filter(
                branch__business__in=user.owned_businesses.all()
            )
        elif hasattr(user, 'managed_branches') and user.managed_branches.exists():
            qs = Service.objects.filter(branch__in=user.managed_branches.all())
        else:
            qs = Service.objects.none()

        # Filtrar por sucursal si se especifica
        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        return qs.select_related('branch', 'category')

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ServiceCreateUpdateSerializer
        return DashboardServiceSerializer

    def perform_create(self, serializer):
        """Valida que la sucursal pertenezca al usuario."""
        user = self.request.user
        branch = serializer.validated_data.get('branch')

        if not branch:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch': 'La sucursal es requerida'})

        # Verificar acceso a la sucursal
        if user.role == 'business_owner':
            if branch.business not in user.owned_businesses.all():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'branch': 'No tienes acceso a esta sucursal'})
        elif user.role == 'branch_manager':
            if branch not in user.managed_branches.all():
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'branch': 'No tienes acceso a esta sucursal'})

        serializer.save()

    @action(detail=False, methods=['get'])
    def categories(self, request):
        """
        Lista las categorías de servicios globales.
        Las categorías son compartidas por todos los negocios.
        """
        categories = ServiceCategory.objects.filter(is_active=True).order_by('order', 'name')

        return Response([
            {'id': c.id, 'name': c.name, 'order': c.order}
            for c in categories
        ])


class DashboardAppointmentViewSet(viewsets.ModelViewSet):
    """
    API de citas para el dashboard.
    """
    permission_classes = [IsBusinessOwner | IsBranchManager]
    serializer_class = DashboardAppointmentSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == 'super_admin':
            return Appointment.objects.all()
        elif user.role == 'business_owner':
            return Appointment.objects.filter(
                branch__business__in=user.owned_businesses.all()
            )
        return Appointment.objects.filter(branch__in=user.managed_branches.all())

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Actualiza el estado de una cita."""
        appointment = self.get_object()
        new_status = request.data.get('status')

        if new_status not in dict(Appointment.STATUS_CHOICES):
            return Response(
                {'error': 'Estado inválido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        appointment.status = new_status
        if staff_notes := request.data.get('staff_notes'):
            appointment.staff_notes = staff_notes
        appointment.save()

        return Response(DashboardAppointmentSerializer(appointment).data)


class OnboardingView(APIView):
    """
    POST /dashboard/onboarding
    Crea el negocio y sucursal inicial para un business_owner.
    Solo para usuarios business_owner que aun no tienen negocio.
    """
    permission_classes = [IsBusinessOwner]

    def get(self, request):
        """Verifica si el usuario necesita completar onboarding."""
        user = request.user
        has_business = user.owned_businesses.exists()
        return Response({
            'needs_onboarding': not has_business,
            'has_business': has_business
        })

    def post(self, request):
        """Crea el negocio y sucursal principal."""
        user = request.user

        # Verificar que no tenga negocio
        if user.owned_businesses.exists():
            return Response(
                {'error': 'Ya tienes un negocio registrado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar datos requeridos
        data = request.data
        required_fields = ['business_name', 'branch_name', 'branch_address', 'branch_phone']
        missing = [f for f in required_fields if not data.get(f)]
        if missing:
            return Response(
                {'error': f'Campos requeridos: {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generar slug unico
        from django.utils.text import slugify
        import random
        import string

        base_slug = slugify(data['business_name'])
        slug = base_slug
        while Business.objects.filter(slug=slug).exists():
            suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
            slug = f"{base_slug}-{suffix}"

        # Crear negocio
        business = Business.objects.create(
            name=data['business_name'],
            slug=slug,
            description=data.get('business_description', ''),
            primary_color=data.get('primary_color', '#1a1a2e'),
            secondary_color=data.get('secondary_color', '#c9a227'),
        )

        # Asignar al usuario
        user.owned_businesses.add(business)

        # Crear sucursal principal
        branch_slug = slugify(data['branch_name']) or 'principal'
        branch = Branch.objects.create(
            business=business,
            name=data['branch_name'],
            slug=branch_slug,
            address=data['branch_address'],
            phone=data['branch_phone'],
            email=data.get('branch_email', ''),
        )

        return Response({
            'success': True,
            'business': {
                'id': business.id,
                'name': business.name,
                'slug': business.slug,
            },
            'branch': {
                'id': branch.id,
                'name': branch.name,
                'slug': branch.slug,
            }
        }, status=status.HTTP_201_CREATED)


class OnboardingCompleteView(APIView):
    """
    POST /dashboard/onboarding/complete
    Wizard completo de onboarding: negocio + sucursal + horarios + profesional + servicio.
    """
    permission_classes = [IsBusinessOwner]

    def post(self, request):
        """Crea el negocio completo con todos los datos del wizard."""
        from django.utils.text import slugify
        from django.db import transaction
        from apps.scheduling.models import WorkSchedule
        from apps.services.models import Service, ServiceCategory, StaffService
        import random
        import string

        user = request.user

        # Verificar que no tenga negocio
        if user.owned_businesses.exists():
            return Response(
                {'error': 'Ya tienes un negocio registrado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        data = request.data

        # Validar campos requeridos
        required_fields = ['business_name', 'branch_address', 'branch_phone']
        missing = [f for f in required_fields if not data.get(f)]
        if missing:
            return Response(
                {'error': f'Campos requeridos: {", ".join(missing)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # 1. Crear negocio
                base_slug = slugify(data['business_name'])
                slug = base_slug or 'negocio'
                while Business.objects.filter(slug=slug).exists():
                    suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=4))
                    slug = f"{base_slug}-{suffix}"

                business = Business.objects.create(
                    name=data['business_name'],
                    slug=slug,
                    description=data.get('business_description', ''),
                    primary_color=data.get('primary_color', '#1a1a2e'),
                    secondary_color=data.get('secondary_color', '#c9a227'),
                )
                user.owned_businesses.add(business)

                # 2. Crear sucursal
                branch_name = data.get('branch_name', 'Sucursal Principal')
                branch_slug = slugify(branch_name) or 'principal'
                branch = Branch.objects.create(
                    business=business,
                    name=branch_name,
                    slug=branch_slug,
                    address=data['branch_address'],
                    phone=data['branch_phone'],
                    email=data.get('branch_email', ''),
                )

                # 3. Crear horarios de la sucursal (BranchSchedule)
                from apps.scheduling.models import BranchSchedule
                schedule_data = data.get('schedule', {})
                day_mapping = {
                    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
                    'friday': 4, 'saturday': 5, 'sunday': 6
                }

                for day_name, day_num in day_mapping.items():
                    day_schedule = schedule_data.get(day_name, {})
                    is_open = day_schedule.get('enabled', False)
                    BranchSchedule.objects.create(
                        branch=branch,
                        day_of_week=day_num,
                        opening_time=day_schedule.get('open', '09:00'),
                        closing_time=day_schedule.get('close', '19:00'),
                        is_open=is_open
                    )

                staff_created = None
                service_created = None

                # 4. Crear profesional (opcional)
                if data.get('add_self_as_staff', False):
                    # Obtener datos del perfil del dueño si existe
                    owner_profile = getattr(user, 'owner_profile', None)
                    staff_first_name = owner_profile.first_name if owner_profile else 'Profesional'
                    staff_last_name_paterno = owner_profile.last_name_paterno if owner_profile else ''
                    staff_last_name_materno = owner_profile.last_name_materno if owner_profile else ''
                    staff_doc_type = owner_profile.document_type if owner_profile else 'dni'
                    staff_doc_number = owner_profile.document_number if owner_profile else f'AUTO{user.id}'

                    staff_created = StaffMember.objects.create(
                        user=user,
                        current_business=business,
                        first_name=staff_first_name,
                        last_name_paterno=staff_last_name_paterno,
                        last_name_materno=staff_last_name_materno,
                        document_type=staff_doc_type,
                        document_number=staff_doc_number,
                        phone_number=user.phone_number or data.get('branch_phone', ''),
                        specialty=data.get('staff_specialty', ''),
                        employment_status='active',
                        is_active=True,
                    )
                    staff_created.branches.add(branch)

                    # Crear StaffSubscription para el trial del nuevo profesional
                    StaffSubscription.objects.get_or_create(
                        business=business,
                        staff=staff_created,
                        defaults={'is_active': True}
                    )

                    # Copiar horarios de sucursal al staff (de BranchSchedule a WorkSchedule)
                    for branch_schedule in branch.schedules.filter(is_open=True):
                        WorkSchedule.objects.create(
                            branch=branch,
                            staff=staff_created,
                            day_of_week=branch_schedule.day_of_week,
                            start_time=branch_schedule.opening_time,
                            end_time=branch_schedule.closing_time,
                            is_working=True
                        )

                # 5. Crear servicio (opcional)
                if data.get('add_first_service', False) and data.get('service_name'):
                    # Obtener o crear categoria por defecto (global)
                    category, _ = ServiceCategory.objects.get_or_create(
                        name='General',
                        defaults={'description': 'Servicios generales', 'order': 0}
                    )

                    service_created = Service.objects.create(
                        branch=branch,
                        category=category,
                        name=data['service_name'],
                        duration_minutes=int(data.get('service_duration', 60)),
                        price=float(data.get('service_price', 50)),
                        is_active=True,
                    )

                    # Asignar servicio al staff si existe
                    if staff_created:
                        StaffService.objects.create(
                            staff=staff_created,
                            service=service_created,
                            custom_duration=None,
                            custom_price=None,
                            is_active=True
                        )

                return Response({
                    'success': True,
                    'business': {
                        'id': business.id,
                        'name': business.name,
                        'slug': business.slug,
                    },
                    'branch': {
                        'id': branch.id,
                        'name': branch.name,
                    },
                    'staff': {
                        'id': staff_created.id,
                        'name': staff_created.full_name,
                    } if staff_created else None,
                    'service': {
                        'id': service_created.id,
                        'name': service_created.name,
                    } if service_created else None,
                }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response(
                {'error': f'Error al crear el negocio: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
