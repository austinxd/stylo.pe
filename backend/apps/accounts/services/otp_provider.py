"""
Servicio de envio de OTP.
Soporta multiples proveedores: mock, twilio (Verify API), whatsapp (Meta template).
"""
import sys
import logging
from abc import ABC, abstractmethod
from django.conf import settings

logger = logging.getLogger(__name__)


class OTPProvider(ABC):
    """Interfaz base para proveedores de OTP."""

    @abstractmethod
    def send_otp(self, phone_number: str, otp_code: str = None) -> dict:
        """
        Envia un codigo OTP.

        Args:
            phone_number: Numero de telefono con codigo de pais
            otp_code: Codigo OTP (ignorado por Twilio Verify que genera el suyo)

        Returns:
            dict: {'success': bool, 'error': str | None, 'message_id': str | None}
        """
        pass

    def verify_otp(self, phone_number: str, otp_code: str) -> dict:
        """
        Verifica un codigo OTP.
        Solo implementado por proveedores que manejan su propia verificacion (ej: Twilio Verify).

        Returns:
            dict: {'success': bool, 'valid': bool, 'error': str | None}
        """
        # Por defecto, la verificacion la hace OTPService contra el hash
        return {'success': True, 'valid': None, 'error': None, 'use_local_verification': True}


class MockOTPProvider(OTPProvider):
    """Proveedor mock para desarrollo. Solo loguea los mensajes."""

    def send_otp(self, phone_number: str, otp_code: str = None) -> dict:
        message = f"\n{'='*50}\n[MOCK OTP] Codigo: {otp_code} -> {phone_number}\n{'='*50}\n"
        logger.warning(message)
        sys.stderr.write(message)
        sys.stderr.flush()
        return {
            'success': True,
            'error': None,
            'message_id': f'mock_otp_{phone_number}_{otp_code}'
        }


class TwilioVerifyProvider(OTPProvider):
    """
    Proveedor de OTP via Twilio Verify API.
    Twilio maneja la generacion y verificacion del codigo.
    """

    def __init__(self):
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.verify_service_sid = getattr(settings, 'TWILIO_VERIFY_SERVICE_SID', '')
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                from twilio.rest import Client
                self._client = Client(self.account_sid, self.auth_token)
            except ImportError:
                raise ImportError("Instala twilio: pip install twilio")
        return self._client

    def send_otp(self, phone_number: str, otp_code: str = None) -> dict:
        """
        Envia OTP usando Twilio Verify API.
        El otp_code se ignora - Twilio genera su propio codigo.
        """
        if not self.verify_service_sid:
            logger.error("TWILIO_VERIFY_SERVICE_SID no configurado")
            return {
                'success': False,
                'error': 'Twilio Verify no configurado',
                'message_id': None
            }

        try:
            verification = self.client.verify.v2.services(
                self.verify_service_sid
            ).verifications.create(
                to=phone_number,
                channel='sms'
            )
            logger.info(f"OTP enviado a {phone_number} via Twilio Verify: {verification.sid}")
            return {
                'success': True,
                'error': None,
                'message_id': verification.sid
            }
        except Exception as e:
            logger.error(f"Error enviando OTP via Twilio Verify: {e}")
            return {
                'success': False,
                'error': str(e),
                'message_id': None
            }

    def verify_otp(self, phone_number: str, otp_code: str) -> dict:
        """
        Verifica OTP usando Twilio Verify API.
        """
        if not self.verify_service_sid:
            return {
                'success': False,
                'valid': False,
                'error': 'Twilio Verify no configurado',
                'use_local_verification': False
            }

        try:
            verification_check = self.client.verify.v2.services(
                self.verify_service_sid
            ).verification_checks.create(
                to=phone_number,
                code=otp_code
            )

            is_valid = verification_check.status == 'approved'
            logger.info(f"Verificacion OTP {phone_number}: {verification_check.status}")

            return {
                'success': True,
                'valid': is_valid,
                'error': None if is_valid else 'Codigo incorrecto',
                'use_local_verification': False
            }
        except Exception as e:
            logger.error(f"Error verificando OTP via Twilio Verify: {e}")
            return {
                'success': False,
                'valid': False,
                'error': str(e),
                'use_local_verification': False
            }


class WhatsAppOTPProvider(OTPProvider):
    """Proveedor de OTP via WhatsApp (usa Meta template)."""

    def __init__(self):
        # Importacion diferida para evitar dependencia circular
        from .whatsapp_service import WhatsAppService
        self._whatsapp = WhatsAppService()

    def send_otp(self, phone_number: str, otp_code: str = None) -> dict:
        return self._whatsapp.send_otp(phone_number, otp_code)


class OTPProviderService:
    """
    Servicio principal de OTP.
    Selecciona el proveedor segun la configuracion OTP_PROVIDER.
    """
    _providers = {
        'mock': MockOTPProvider,
        'twilio': TwilioVerifyProvider,
        'whatsapp': WhatsAppOTPProvider,
    }

    def __init__(self):
        self.provider_name = getattr(settings, 'OTP_PROVIDER', 'mock')
        provider_class = self._providers.get(self.provider_name, MockOTPProvider)
        self.provider = provider_class()
        logger.info(f"OTP service inicializado con proveedor: {self.provider_name}")

    def send_otp(self, phone_number: str, otp_code: str = None) -> dict:
        """Envia un codigo OTP usando el proveedor configurado."""
        return self.provider.send_otp(phone_number, otp_code)

    def verify_otp(self, phone_number: str, otp_code: str) -> dict:
        """
        Verifica un codigo OTP.
        Si el proveedor maneja su propia verificacion (Twilio Verify), la usa.
        Si no, retorna que debe usarse la verificacion local.
        """
        return self.provider.verify_otp(phone_number, otp_code)

    @property
    def uses_external_verification(self) -> bool:
        """Indica si el proveedor usa verificacion externa (no local)."""
        return self.provider_name == 'twilio'
