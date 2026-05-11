"""
Views para citas.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from datetime import timedelta

from .models import Appointment, AppointmentReminder, WaitlistEntry
from .services import (
    create_appointment_atomic,
    reschedule_appointment_atomic,
    AppointmentConflictError,
)
from common.throttling import (
    BookingSendOTPIPThrottle,
    BookingVerifyOTPIPThrottle,
    OTPSendPhoneThrottle,
    OTPVerifyPhoneThrottle,
    DocumentCheckThrottle,
)
from .serializers import (
    AppointmentSerializer,
    AppointmentListSerializer,
    AppointmentCancelSerializer,
    PublicBookingStartSerializer,
    PublicBookingSendOTPSerializer,
    PublicBookingVerifyOTPSerializer,
    PublicAppointmentConfirmationSerializer,
    WaitlistJoinSerializer,
    WaitlistEntrySerializer,
)
from apps.core.models import Branch
from apps.accounts.models import Client, BookingSession
from apps.services.models import Service, StaffService
from apps.subscriptions.services import SubscriptionService


class PublicBookingViewSet(viewsets.ViewSet):
    """
    API pública para reservas sin autenticación.

    Flujo de reserva:
    1. POST /start/ - Seleccionar servicio, profesional, fecha → session_token
    2. POST /send-otp/ - Enviar datos del cliente → OTP enviado por WhatsApp
    3. POST /verify-otp/ - Verificar OTP → Reserva confirmada

    El cliente no necesita cuenta. Se identifica por su documento.
    """
    permission_classes = [AllowAny]

    @action(detail=False, methods=['post'], url_path='start')
    def start_booking(self, request):
        """
        Paso 1: Iniciar reserva.

        Recibe: branch_id, service_id (Service ID), staff_id, start_datetime, notes
        Retorna: session_token, resumen de la reserva
        """
        serializer = PublicBookingStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        service = data['service']
        staff = data['staff']

        # Verificar que el negocio puede recibir reservas (suscripción activa)
        branch = Branch.objects.select_related('business').get(pk=data['branch_id'])
        can_book, error_msg = SubscriptionService.can_receive_bookings(branch.business)
        if not can_book:
            return Response(
                {'error': error_msg or 'Este negocio no puede recibir reservas en este momento.'},
                status=status.HTTP_402_PAYMENT_REQUIRED
            )

        # Obtener precio del profesional para este servicio
        try:
            staff_service = StaffService.objects.get(staff=staff, service=service)
            price = staff_service.price
        except StaffService.DoesNotExist:
            price = service.price

        # Crear sesión de reserva (expira en 15 minutos)
        session = BookingSession.objects.create(
            session_token=BookingSession.generate_session_token(),
            phone_number='',  # Se llenará en el paso 2
            document_type='',
            document_number='',
            first_name='',
            last_name_paterno='',
            branch_id=data['branch_id'],
            service_id=service.id,
            staff_id=data['staff_id'],
            start_datetime=data['start_datetime'],
            notes=data.get('notes', ''),
            status='PENDING',
            expires_at=timezone.now() + timedelta(minutes=15)
        )

        return Response({
            'session_token': session.session_token,
            'expires_in': 900,  # 15 minutos en segundos
            'booking_summary': {
                'business_name': branch.business.name,
                'branch_name': branch.name,
                'branch_address': branch.address,
                'service_name': service.name,
                'service_duration': service.total_duration,
                'staff_name': staff.full_name,
                'staff_photo': staff.photo.url if staff.photo else None,
                'start_datetime': data['start_datetime'].isoformat(),
                'end_datetime': data['end_datetime'].isoformat(),
                'price': str(price)
            }
        })

    @action(
        detail=False,
        methods=['post'],
        url_path='lookup-client',
        throttle_classes=[DocumentCheckThrottle],
    )
    def lookup_client(self, request):
        """
        Buscar cliente por documento.

        Si el cliente existe, retorna sus datos para autocompletar.
        Si no existe, retorna found=false.

        Recibe: document_type, document_number
        Retorna: { found: bool, client?: {...} }
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
            client = Client.objects.get(
                document_type=document_type,
                document_number=document_number
            )
            return Response({
                'found': True,
                'client': {
                    'first_name': client.first_name,
                    'last_name_paterno': client.last_name_paterno,
                    'last_name_materno': client.last_name_materno or '',
                    'phone_number': client.phone_number,
                    'email': client.email or '',
                    'gender': client.gender,
                    'birth_date': client.birth_date.isoformat() if client.birth_date else None,
                }
            })
        except Client.DoesNotExist:
            return Response({'found': False})

    @action(detail=False, methods=['post'], url_path='lookup-reniec')
    def lookup_reniec(self, request):
        """
        Buscar datos de persona en RENIEC por DNI.

        Útil para autocompletar el formulario de cliente cuando es nuevo.
        Retorna nombres, apellidos, fecha de nacimiento y género.

        Recibe: dni (8 dígitos)
        Retorna: { found: bool, first_name, last_name_paterno, last_name_materno, birth_date, gender }
        """
        from apps.accounts.services.dni_service import DNIService

        dni = request.data.get('dni', '').strip()

        if not dni:
            return Response(
                {'error': 'DNI es requerido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        result = DNIService.lookup_dni(dni)

        if not result.get('found'):
            return Response({
                'found': False,
                'error': result.get('error', 'No se encontraron datos')
            })

        return Response({
            'found': True,
            'first_name': result.get('first_name', ''),
            'last_name_paterno': result.get('last_name_paterno', ''),
            'last_name_materno': result.get('last_name_materno', ''),
            'birth_date': result.get('birth_date'),
            'gender': result.get('gender', 'M'),
        })

    @action(
        detail=False,
        methods=['post'],
        url_path='send-otp',
        throttle_classes=[BookingSendOTPIPThrottle, OTPSendPhoneThrottle],
    )
    def send_otp(self, request):
        """
        Paso 2: Enviar datos del cliente y solicitar OTP.

        Recibe: session_token, phone_number, document_type, document_number,
                first_name, last_name_paterno, last_name_materno, email, birth_date
        Retorna: mensaje de confirmación
        """
        serializer = PublicBookingSendOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = serializer.context['booking_session']
        data = serializer.validated_data

        # Actualizar sesión con datos del cliente
        session.phone_number = data['phone_number']
        session.document_type = data['document_type']
        session.document_number = data['document_number']
        session.first_name = data['first_name']
        session.last_name_paterno = data['last_name_paterno']
        session.last_name_materno = data.get('last_name_materno', '')
        session.email = data.get('email')
        session.gender = data.get('gender', 'M')
        session.birth_date = data.get('birth_date')
        session.photo = data.get('photo')

        # Generar y guardar OTP
        otp_code = BookingSession.generate_otp()
        session.set_otp(otp_code)
        session.status = 'OTP_SENT'
        session.expires_at = timezone.now() + timedelta(minutes=5)  # OTP válido 5 min
        session.save()

        # Enviar OTP usando el proveedor configurado (SMS o WhatsApp)
        from apps.accounts.services import OTPProviderService
        from django.conf import settings
        otp_service = OTPProviderService()
        otp_service.send_otp(session.phone_number, otp_code)

        # Respuesta
        response_data = {
            'message': f'Código de verificación enviado a {data["phone_number"]}',
            'expires_in': 300  # 5 minutos
        }

        # En desarrollo/mock, mostramos el OTP en la respuesta
        if getattr(settings, 'OTP_PROVIDER', 'mock') == 'mock':
            response_data['debug_otp'] = otp_code

        return Response(response_data)

    @action(
        detail=False,
        methods=['post'],
        url_path='verify-otp',
        throttle_classes=[BookingVerifyOTPIPThrottle, OTPVerifyPhoneThrottle],
    )
    def verify_otp(self, request):
        """
        Paso 3: Verificar OTP y confirmar reserva.

        Recibe: session_token, otp_code
        Retorna: Detalles de la cita confirmada
        """
        serializer = PublicBookingVerifyOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session = serializer.context['booking_session']
        otp_code = serializer.validated_data['otp_code']

        # Verificar OTP - usar Twilio Verify si está configurado
        from apps.accounts.services import OTPProviderService
        otp_service = OTPProviderService()

        otp_valid = False
        if otp_service.uses_external_verification:
            # Verificar contra Twilio Verify API
            verify_result = otp_service.verify_otp(session.phone_number, otp_code)
            otp_valid = verify_result.get('success') and verify_result.get('valid')
        else:
            # Verificar contra hash local
            otp_valid = session.verify_otp(otp_code)

        if not otp_valid:
            session.attempts += 1
            session.save(update_fields=['attempts'])

            remaining = session.max_attempts - session.attempts
            if remaining <= 0:
                return Response(
                    {'error': 'Demasiados intentos fallidos. Inicie una nueva reserva.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response(
                {'error': f'Código incorrecto. {remaining} intentos restantes.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # OTP correcto - crear/actualizar cliente
        client, created = Client.get_or_create_from_booking(
            document_type=session.document_type,
            document_number=session.document_number,
            phone_number=session.phone_number,
            first_name=session.first_name,
            last_name_paterno=session.last_name_paterno,
            last_name_materno=session.last_name_materno,
            email=session.email,
            gender=session.gender,
            birth_date=session.birth_date,
            photo=session.photo
        )

        # Obtener precio desde Service
        try:
            service = Service.objects.get(pk=session.service_id)

            # Intentar obtener precio personalizado del profesional
            try:
                staff_service = StaffService.objects.get(
                    staff_id=session.staff_id,
                    service=service
                )
                price = staff_service.price
            except StaffService.DoesNotExist:
                price = service.price
        except Service.DoesNotExist:
            return Response(
                {'error': 'Servicio no encontrado'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Crear la cita con lock atómico (evita double-booking)
        try:
            appointment = create_appointment_atomic(
                branch_id=session.branch_id,
                client=client,
                staff_id=session.staff_id,
                service=service,
                start_datetime=session.start_datetime,
                price=price,
                notes=session.notes,
                status='confirmed',
                create_reminder=True,
            )
        except AppointmentConflictError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_409_CONFLICT
            )

        # Actualizar sesión
        session.status = 'COMPLETED'
        session.verified_at = timezone.now()
        session.appointment_id = appointment.id
        session.save()

        # TODO: Enviar confirmación por WhatsApp (Celery task)

        return Response({
            'success': True,
            'message': '¡Reserva confirmada!',
            'appointment': PublicAppointmentConfirmationSerializer(appointment).data
        }, status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=['post'],
        url_path='resend-otp',
        throttle_classes=[BookingSendOTPIPThrottle],
    )
    def resend_otp(self, request):
        """
        Reenviar OTP si el anterior expiró o no llegó.
        """
        session_token = request.data.get('session_token')

        try:
            session = BookingSession.objects.get(
                session_token=session_token,
                status='OTP_SENT'
            )
        except BookingSession.DoesNotExist:
            return Response(
                {'error': 'Sesión no válida'},
                status=status.HTTP_400_BAD_REQUEST
            )

        if session.is_locked():
            return Response(
                {'error': 'Demasiados intentos. Inicie una nueva reserva.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Generar nuevo OTP
        otp_code = BookingSession.generate_otp()
        session.set_otp(otp_code)
        session.expires_at = timezone.now() + timedelta(minutes=5)
        session.save()

        # Enviar OTP usando el proveedor configurado (SMS o WhatsApp)
        from apps.accounts.services import OTPProviderService
        from django.conf import settings
        otp_service = OTPProviderService()
        otp_service.send_otp(session.phone_number, otp_code)

        response_data = {
            'message': f'Nuevo código enviado a {session.phone_number}',
            'expires_in': 300
        }

        if getattr(settings, 'OTP_PROVIDER', 'mock') == 'mock':
            response_data['debug_otp'] = otp_code

        return Response(response_data)


class DashboardAppointmentViewSet(viewsets.ModelViewSet):
    """
    API de citas para el dashboard de negocios.
    Requiere autenticación de staff/admin.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = AppointmentSerializer

    def get_queryset(self):
        """Retorna las citas según el rol del usuario (multi-tenant scoping)."""
        from common.scoping import scope_appointments
        return scope_appointments(Appointment.objects.all(), self.request.user)

    def create(self, request, *args, **kwargs):
        """
        Crear cita desde el dashboard con lock atómico contra double-booking.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            appointment = create_appointment_atomic(
                branch_id=data['branch'].id if hasattr(data['branch'], 'id') else data['branch'],
                client=data['client'],
                staff_id=data['staff'].id if hasattr(data['staff'], 'id') else data['staff'],
                service=data['service'],
                start_datetime=data['start_datetime'],
                price=data['price'],
                notes=data.get('notes', ''),
                status=data.get('status', 'confirmed'),
                create_reminder=True,
            )
        except AppointmentConflictError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_409_CONFLICT
            )

        return Response(
            AppointmentSerializer(appointment).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'])
    def update_status(self, request, pk=None):
        """Actualizar estado de una cita."""
        appointment = self.get_object()
        new_status = request.data.get('status')
        staff_notes = request.data.get('staff_notes', '')

        if new_status not in dict(Appointment.STATUS_CHOICES):
            return Response(
                {'error': 'Estado no válido'},
                status=status.HTTP_400_BAD_REQUEST
            )

        appointment.status = new_status
        if staff_notes:
            appointment.staff_notes = staff_notes
        appointment.save()

        return Response(AppointmentSerializer(appointment).data)

    @action(detail=True, methods=['post'])
    def reschedule(self, request, pk=None):
        """
        Reagendar una cita a una nueva fecha/hora.

        Body: { "start_datetime": "2026-05-15T14:00:00Z" }

        Garantiza atómicamente que no haya conflicto con otras citas del staff.
        Si el nuevo horario está tomado, retorna 409 Conflict.
        Si la cita está en estado terminal (cancelled/completed/no_show),
        retorna 400.
        """
        from django.utils.dateparse import parse_datetime

        appointment = self.get_object()

        if appointment.status in ('cancelled', 'completed', 'no_show'):
            return Response(
                {'error': f'No se puede reagendar una cita {appointment.get_status_display().lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw = request.data.get('start_datetime')
        if not raw:
            return Response(
                {'error': 'start_datetime es requerido'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        new_start = parse_datetime(raw)
        if new_start is None:
            return Response(
                {'error': 'Formato inválido. Usa ISO 8601 (ej: 2026-05-15T14:00:00Z).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(new_start):
            new_start = timezone.make_aware(new_start)

        # Política: no reagendar a fechas pasadas
        if new_start <= timezone.now():
            return Response(
                {'error': 'No se puede reagendar a una fecha pasada.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            updated = reschedule_appointment_atomic(
                appointment=appointment,
                new_start_datetime=new_start,
            )
        except AppointmentConflictError as e:
            return Response({'error': str(e)}, status=status.HTTP_409_CONFLICT)

        return Response(AppointmentSerializer(updated).data)

    @action(detail=False, methods=['get'])
    def calendar(self, request):
        """
        Obtener citas para el calendario.
        Parámetros: branch_id, start_date, end_date
        """
        branch_id = request.query_params.get('branch_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        if not all([branch_id, start_date, end_date]):
            return Response(
                {'error': 'branch_id, start_date y end_date son requeridos'},
                status=status.HTTP_400_BAD_REQUEST
            )

        appointments = self.get_queryset().filter(
            branch_id=branch_id,
            start_datetime__date__gte=start_date,
            start_datetime__date__lte=end_date
        ).select_related('client', 'staff', 'service')

        return Response(AppointmentSerializer(appointments, many=True).data)


class WaitlistViewSet(viewsets.ViewSet):
    """
    API pública para gestionar lista de espera de slots.

    POST /api/v1/appointments/waitlist/join/        Anotarse
    GET  /api/v1/appointments/waitlist/status/?phone=+51...  Ver entries
    POST /api/v1/appointments/waitlist/cancel/      Salir
    """
    permission_classes = [AllowAny]

    @action(
        detail=False,
        methods=['post'],
        url_path='join',
        throttle_classes=[BookingSendOTPIPThrottle],
    )
    def join(self, request):
        """
        Anota a un cliente en lista de espera.

        El cliente NO necesita cuenta. Si su documento ya existe como
        Client, lo asociamos automáticamente.
        """
        serializer = WaitlistJoinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Buscar Client existente por phone_number (best-effort)
        client = Client.objects.filter(
            phone_number=data['phone_number']
        ).first()

        # Check explícito ANTES de intentar crear: hay un entry activo
        # con la misma combinación clave. Más confiable que capturar
        # IntegrityError (cuyo mensaje varía entre MySQL y SQLite).
        already_waiting = WaitlistEntry.objects.filter(
            branch_id=data['branch_id'],
            service=data['_service'],
            phone_number=data['phone_number'],
            preferred_date=data['preferred_date'],
            status='waiting',
        ).exists()
        if already_waiting:
            return Response(
                {'error': 'Ya estás en la lista de espera para este servicio en esta fecha.'},
                status=status.HTTP_409_CONFLICT,
            )

        entry = WaitlistEntry.objects.create(
            branch_id=data['branch_id'],
            service=data['_service'],
            staff=data.get('_staff'),
            client=client,
            phone_number=data['phone_number'],
            first_name=data['first_name'],
            preferred_date=data['preferred_date'],
            preferred_time_start=data.get('preferred_time_start'),
            preferred_time_end=data.get('preferred_time_end'),
            notes=data.get('notes', ''),
            status='waiting',
        )

        return Response(
            WaitlistEntrySerializer(entry).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=['get'], url_path='status')
    def get_status(self, request):
        """
        Lista las entries en waitlist del teléfono dado.

        Query: ?phone=+51987654321
        """
        phone = request.query_params.get('phone', '').strip()
        if not phone:
            return Response(
                {'error': 'El parámetro phone es requerido'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        entries = WaitlistEntry.objects.filter(
            phone_number=phone,
        ).exclude(status__in=['cancelled', 'expired', 'claimed']).order_by('-created_at')

        return Response(WaitlistEntrySerializer(entries, many=True).data)

    @action(
        detail=False,
        methods=['post'],
        url_path='cancel',
        throttle_classes=[BookingSendOTPIPThrottle],
    )
    def cancel(self, request):
        """
        Cancela una entry de waitlist (cliente se baja de la lista).

        Body: { "entry_id": 123, "phone_number": "+51..." }
        Pedimos el teléfono como prueba simple de identidad.
        """
        entry_id = request.data.get('entry_id')
        phone = request.data.get('phone_number', '').strip()

        if not entry_id or not phone:
            return Response(
                {'error': 'entry_id y phone_number son requeridos'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            entry = WaitlistEntry.objects.get(pk=entry_id, phone_number=phone)
        except WaitlistEntry.DoesNotExist:
            return Response(
                {'error': 'No se encontró la entrada o el teléfono no coincide.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if entry.status in ['cancelled', 'expired', 'claimed']:
            return Response(
                {'error': f'Esta entrada ya está {entry.get_status_display().lower()}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry.status = 'cancelled'
        entry.save(update_fields=['status', 'updated_at'])
        return Response({'success': True, 'message': 'Te quitamos de la lista de espera.'})
