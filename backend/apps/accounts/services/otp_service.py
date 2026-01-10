"""
Servicio de gestión de OTP.
"""
from datetime import timedelta
from django.utils import timezone
from django.conf import settings

from apps.accounts.models import LoginSession, User


class OTPService:
    """Servicio para gestionar OTPs y sesiones de login."""

    @staticmethod
    def create_session(phone_number: str) -> tuple[LoginSession, str]:
        """
        Crea una nueva sesión de login con OTP.

        Returns:
            tuple: (LoginSession, otp_code)
        """
        # Invalidar sesiones anteriores del mismo número
        LoginSession.objects.filter(
            phone_number=phone_number,
            status__in=['OTP_SENT', 'OTP_VERIFIED']
        ).update(status='EXPIRED')

        # Generar OTP
        otp_code = LoginSession.generate_otp()

        # Calcular expiración
        expiry_minutes = getattr(settings, 'OTP_EXPIRY_MINUTES', 5)
        expires_at = timezone.now() + timedelta(minutes=expiry_minutes)

        # Crear sesión
        session = LoginSession.objects.create(
            phone_number=phone_number,
            expires_at=expires_at
        )
        session.set_otp(otp_code)
        session.save()

        return session, otp_code

    @staticmethod
    def verify_otp(phone_number: str, otp_code: str) -> dict:
        """
        Verifica el OTP proporcionado.

        Returns:
            dict: {
                'success': bool,
                'error': str | None,
                'session': LoginSession | None,
                'is_registered': bool,
                'registration_token': str | None (si no está registrado),
                'user': User | None (si está registrado)
            }
        """
        try:
            session = LoginSession.objects.filter(
                phone_number=phone_number,
                status='OTP_SENT'
            ).latest('created_at')
        except LoginSession.DoesNotExist:
            return {
                'success': False,
                'error': 'No se encontró una sesión activa para este número',
                'session': None,
                'is_registered': False,
                'registration_token': None,
                'user': None
            }

        # Verificar expiración
        if session.is_expired():
            session.status = 'EXPIRED'
            session.save()
            return {
                'success': False,
                'error': 'El código OTP ha expirado. Solicita uno nuevo.',
                'session': session,
                'is_registered': False,
                'registration_token': None,
                'user': None
            }

        # Verificar intentos
        if session.is_locked():
            return {
                'success': False,
                'error': 'Demasiados intentos fallidos. Solicita un nuevo código.',
                'session': session,
                'is_registered': False,
                'registration_token': None,
                'user': None
            }

        # Verificar OTP - usar Twilio Verify si está configurado
        from .otp_provider import OTPProviderService
        otp_service = OTPProviderService()

        if otp_service.uses_external_verification:
            # Verificar contra Twilio Verify API
            verify_result = otp_service.verify_otp(phone_number, otp_code)
            if not verify_result['success'] or not verify_result['valid']:
                session.attempts += 1
                session.save()
                remaining = session.max_attempts - session.attempts
                error_msg = verify_result.get('error') or f'Código OTP incorrecto. Te quedan {remaining} intentos.'
                return {
                    'success': False,
                    'error': error_msg,
                    'session': session,
                    'is_registered': False,
                    'registration_token': None,
                    'user': None
                }
        else:
            # Verificar contra hash local
            if not session.verify_otp(otp_code):
                session.attempts += 1
                session.save()
                remaining = session.max_attempts - session.attempts
                return {
                    'success': False,
                    'error': f'Código OTP incorrecto. Te quedan {remaining} intentos.',
                    'session': session,
                    'is_registered': False,
                    'registration_token': None,
                    'user': None
                }

        # OTP correcto - actualizar sesión
        session.status = 'OTP_VERIFIED'
        session.verified_at = timezone.now()

        # Verificar si el usuario ya existe
        try:
            user = User.objects.get(phone_number=phone_number)
            session.status = 'COMPLETED'
            session.save()
            return {
                'success': True,
                'error': None,
                'session': session,
                'is_registered': True,
                'registration_token': None,
                'user': user
            }
        except User.DoesNotExist:
            # Usuario nuevo - generar token de registro
            registration_token = session.generate_registration_token()
            # Actualizar expiración para el registro
            reg_expiry = getattr(settings, 'REGISTRATION_TOKEN_EXPIRY_MINUTES', 15)
            session.expires_at = timezone.now() + timedelta(minutes=reg_expiry)
            session.save()
            return {
                'success': True,
                'error': None,
                'session': session,
                'is_registered': False,
                'registration_token': registration_token,
                'user': None
            }

    @staticmethod
    def validate_registration_token(token: str) -> dict:
        """
        Valida un token de registro.

        Returns:
            dict: {
                'valid': bool,
                'error': str | None,
                'session': LoginSession | None
            }
        """
        try:
            session = LoginSession.objects.get(
                registration_token=token,
                status='OTP_VERIFIED'
            )
        except LoginSession.DoesNotExist:
            return {
                'valid': False,
                'error': 'Token de registro inválido o expirado',
                'session': None
            }

        if session.is_expired():
            session.status = 'EXPIRED'
            session.save()
            return {
                'valid': False,
                'error': 'El token de registro ha expirado',
                'session': None
            }

        return {
            'valid': True,
            'error': None,
            'session': session
        }

    @staticmethod
    def complete_registration(session: LoginSession) -> None:
        """Marca la sesión como completada."""
        session.status = 'COMPLETED'
        session.save()
