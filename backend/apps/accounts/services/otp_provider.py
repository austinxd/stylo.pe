"""
Servicio de envio de OTP.
Soporta multiples proveedores: mock, twilio (SMS), whatsapp (Meta template).
"""
import sys
import logging
from abc import ABC, abstractmethod
from django.conf import settings

logger = logging.getLogger(__name__)


class OTPProvider(ABC):
    """Interfaz base para proveedores de OTP."""

    @abstractmethod
    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        """
        Envia un codigo OTP.

        Returns:
            dict: {'success': bool, 'error': str | None, 'message_id': str | None}
        """
        pass


class MockOTPProvider(OTPProvider):
    """Proveedor mock para desarrollo. Solo loguea los mensajes."""

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        message = f"\n{'='*50}\n[MOCK OTP] Codigo: {otp_code} -> {phone_number}\n{'='*50}\n"
        logger.warning(message)
        sys.stderr.write(message)
        sys.stderr.flush()
        return {
            'success': True,
            'error': None,
            'message_id': f'mock_otp_{phone_number}_{otp_code}'
        }


class TwilioSMSProvider(OTPProvider):
    """Proveedor de OTP via SMS Twilio (no WhatsApp)."""

    def __init__(self):
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.from_number = settings.TWILIO_SMS_FROM
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

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        try:
            message = self.client.messages.create(
                body=f"Tu codigo de verificacion Stylo es: {otp_code}. Valido por 5 minutos.",
                from_=self.from_number,
                to=phone_number
            )
            logger.info(f"OTP SMS enviado a {phone_number} via Twilio: {message.sid}")
            return {
                'success': True,
                'error': None,
                'message_id': message.sid
            }
        except Exception as e:
            logger.error(f"Error enviando OTP SMS via Twilio: {e}")
            return {
                'success': False,
                'error': str(e),
                'message_id': None
            }


class WhatsAppOTPProvider(OTPProvider):
    """Proveedor de OTP via WhatsApp (usa Meta template)."""

    def __init__(self):
        # Importacion diferida para evitar dependencia circular
        from .whatsapp_service import WhatsAppService
        self._whatsapp = WhatsAppService()

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        return self._whatsapp.send_otp(phone_number, otp_code)


class OTPProviderService:
    """
    Servicio principal de OTP.
    Selecciona el proveedor segun la configuracion OTP_PROVIDER.
    """
    _providers = {
        'mock': MockOTPProvider,
        'twilio': TwilioSMSProvider,
        'whatsapp': WhatsAppOTPProvider,
    }

    def __init__(self):
        provider_name = getattr(settings, 'OTP_PROVIDER', 'mock')
        provider_class = self._providers.get(provider_name, MockOTPProvider)
        self.provider = provider_class()
        logger.info(f"OTP service inicializado con proveedor: {provider_name}")

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        """Envia un codigo OTP usando el proveedor configurado."""
        return self.provider.send_otp(phone_number, otp_code)
