"""
Serializers para citas.
"""
from rest_framework import serializers
from django.utils import timezone
from datetime import timedelta

from .models import Appointment, AppointmentReminder
from apps.services.models import Service, StaffService
from apps.accounts.models import StaffMember, Client, BookingSession
from apps.core.models import Branch


class PublicBookingStartSerializer(serializers.Serializer):
    """
    Serializer para iniciar una reserva pública.

    Flujo:
    1. Cliente selecciona servicio, profesional, fecha/hora
    2. Se crea BookingSession con datos pendientes del cliente
    3. Se retorna session_token para continuar el flujo
    """
    branch_id = serializers.IntegerField()
    service_id = serializers.IntegerField()
    staff_id = serializers.IntegerField()
    start_datetime = serializers.DateTimeField()
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def validate_branch_id(self, value):
        try:
            Branch.objects.get(pk=value, is_active=True)
        except Branch.DoesNotExist:
            raise serializers.ValidationError('Sucursal no encontrada')
        return value

    def validate_start_datetime(self, value):
        if value <= timezone.now():
            raise serializers.ValidationError(
                'No se pueden crear citas en el pasado'
            )
        if value > timezone.now() + timedelta(days=60):
            raise serializers.ValidationError(
                'No se pueden crear citas con más de 60 días de anticipación'
            )
        return value

    def validate(self, attrs):
        branch_id = attrs['branch_id']
        service_id = attrs['service_id']
        staff_id = attrs['staff_id']
        start_datetime = attrs['start_datetime']

        # Verificar Service (servicio pertenece a la sucursal)
        try:
            service = Service.objects.get(
                pk=service_id,
                branch_id=branch_id,
                is_active=True
            )
            attrs['service'] = service
        except Service.DoesNotExist:
            raise serializers.ValidationError({
                'service_id': 'Servicio no disponible en esta sucursal'
            })

        # Verificar profesional
        try:
            staff = StaffMember.objects.get(
                pk=staff_id,
                branches=branch_id,
                is_active=True
            )
            attrs['staff'] = staff
        except StaffMember.DoesNotExist:
            raise serializers.ValidationError({
                'staff_id': 'Profesional no disponible en esta sucursal'
            })

        # Verificar que el profesional ofrece el servicio
        if not StaffService.objects.filter(
            staff=staff,
            service=service,
            is_active=True
        ).exists():
            raise serializers.ValidationError({
                'staff_id': 'Este profesional no ofrece el servicio seleccionado'
            })

        # Calcular hora de fin usando la duración del servicio
        end_datetime = start_datetime + timedelta(minutes=service.total_duration)
        attrs['end_datetime'] = end_datetime

        # Verificar disponibilidad
        conflicting = Appointment.objects.filter(
            staff=staff,
            status__in=['pending', 'confirmed'],
            start_datetime__lt=end_datetime,
            end_datetime__gt=start_datetime
        ).exists()

        if conflicting:
            raise serializers.ValidationError({
                'start_datetime': 'El horario seleccionado no está disponible'
            })

        return attrs


class PublicBookingSendOTPSerializer(serializers.Serializer):
    """
    Serializer para enviar OTP al cliente.

    Recibe los datos del cliente y envía el OTP por WhatsApp.
    """
    session_token = serializers.CharField()

    # Datos del cliente
    phone_number = serializers.RegexField(
        regex=r'^\+[1-9]\d{6,14}$',
        error_messages={
            'invalid': 'Formato de teléfono inválido. Use formato internacional: +51987654321'
        }
    )
    document_type = serializers.ChoiceField(choices=['dni', 'pasaporte', 'ce'])
    document_number = serializers.CharField(min_length=6, max_length=20)
    first_name = serializers.CharField(min_length=2, max_length=100)
    last_name_paterno = serializers.CharField(min_length=2, max_length=100)
    last_name_materno = serializers.CharField(required=False, allow_blank=True, default='')
    email = serializers.EmailField(required=False, allow_blank=True, allow_null=True)
    gender = serializers.ChoiceField(choices=['M', 'F'], default='M')
    birth_date = serializers.DateField(required=False, allow_null=True)
    photo = serializers.ImageField(required=False, allow_null=True)

    def validate_session_token(self, value):
        try:
            session = BookingSession.objects.get(
                session_token=value,
                status='PENDING'
            )
            if session.is_expired():
                raise serializers.ValidationError('Sesión expirada. Inicie una nueva reserva.')
            self.context['booking_session'] = session
        except BookingSession.DoesNotExist:
            raise serializers.ValidationError('Sesión no válida')
        return value

    def validate_document_number(self, value):
        # Normalizar documento (solo alfanuméricos)
        return ''.join(c for c in value.upper() if c.isalnum())


class PublicBookingVerifyOTPSerializer(serializers.Serializer):
    """
    Serializer para verificar OTP y confirmar la reserva.
    """
    session_token = serializers.CharField()
    otp_code = serializers.CharField(min_length=6, max_length=6)

    def validate_session_token(self, value):
        try:
            session = BookingSession.objects.get(
                session_token=value,
                status='OTP_SENT'
            )
            if session.is_expired():
                raise serializers.ValidationError('Código expirado. Solicite uno nuevo.')
            if session.is_locked():
                raise serializers.ValidationError('Demasiados intentos. Inicie una nueva reserva.')
            self.context['booking_session'] = session
        except BookingSession.DoesNotExist:
            raise serializers.ValidationError('Sesión no válida')
        return value


class AppointmentSerializer(serializers.ModelSerializer):
    """Serializer completo para citas."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_phone = serializers.CharField(source='client.phone_number', read_only=True)
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    business_name = serializers.CharField(source='branch.business.name', read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = [
            'id', 'branch', 'branch_name', 'business_name',
            'client_name', 'client_phone',
            'staff', 'staff_name',
            'service', 'service_name',
            'start_datetime', 'end_datetime', 'duration_minutes',
            'status', 'price', 'notes', 'staff_notes',
            'can_cancel', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_can_cancel(self, obj):
        return obj.can_cancel()


class AppointmentListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listas de citas."""
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id', 'branch_name', 'staff_name', 'service_name',
            'start_datetime', 'end_datetime', 'status', 'price'
        ]


class AppointmentCancelSerializer(serializers.Serializer):
    """Serializer para cancelar una cita."""
    reason = serializers.CharField(required=False, allow_blank=True, default='')


class AppointmentStatusUpdateSerializer(serializers.Serializer):
    """Serializer para actualizar el estado de una cita."""
    status = serializers.ChoiceField(choices=Appointment.STATUS_CHOICES)
    staff_notes = serializers.CharField(required=False, allow_blank=True)


class AppointmentReminderSerializer(serializers.ModelSerializer):
    """Serializer para recordatorios."""

    class Meta:
        model = AppointmentReminder
        fields = [
            'id', 'appointment', 'reminder_type',
            'scheduled_at', 'sent_at', 'status'
        ]
        read_only_fields = ['id', 'sent_at', 'status']


class PublicAppointmentConfirmationSerializer(serializers.ModelSerializer):
    """Serializer para la confirmación de reserva (respuesta al cliente)."""
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_photo = serializers.ImageField(source='staff.photo', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    branch_address = serializers.CharField(source='branch.address', read_only=True)
    business_name = serializers.CharField(source='branch.business.name', read_only=True)
    duration_minutes = serializers.IntegerField(read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id', 'business_name', 'branch_name', 'branch_address',
            'staff_name', 'staff_photo', 'service_name',
            'start_datetime', 'end_datetime', 'duration_minutes',
            'status', 'price', 'created_at'
        ]
