"""
Servicio de envío de mensajes WhatsApp.
Soporta múltiples proveedores: mock, twilio, meta.
"""
import logging
from abc import ABC, abstractmethod
from django.conf import settings

logger = logging.getLogger(__name__)


class WhatsAppProvider(ABC):
    """Interfaz base para proveedores de WhatsApp."""

    @abstractmethod
    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        """
        Envía un código OTP por WhatsApp.

        Returns:
            dict: {'success': bool, 'error': str | None, 'message_id': str | None}
        """
        pass

    @abstractmethod
    def send_reminder(self, phone_number: str, message: str) -> dict:
        """
        Envía un recordatorio por WhatsApp.

        Returns:
            dict: {'success': bool, 'error': str | None, 'message_id': str | None}
        """
        pass


class MockWhatsAppProvider(WhatsAppProvider):
    """Proveedor mock para desarrollo. Solo loguea los mensajes."""

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        message = f"[MOCK WhatsApp] Enviando OTP {otp_code} a {phone_number}"
        logger.info(message)
        print(message)  # Para verlo en consola durante desarrollo
        return {
            'success': True,
            'error': None,
            'message_id': f'mock_{phone_number}_{otp_code}'
        }

    def send_reminder(self, phone_number: str, message: str) -> dict:
        log_message = f"[MOCK WhatsApp] Enviando recordatorio a {phone_number}: {message}"
        logger.info(log_message)
        print(log_message)
        return {
            'success': True,
            'error': None,
            'message_id': f'mock_reminder_{phone_number}'
        }


class TwilioWhatsAppProvider(WhatsAppProvider):
    """Proveedor de WhatsApp via Twilio."""

    def __init__(self):
        self.account_sid = settings.TWILIO_ACCOUNT_SID
        self.auth_token = settings.TWILIO_AUTH_TOKEN
        self.from_number = settings.TWILIO_WHATSAPP_FROM
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
                body=f"Tu código de verificación Stylo es: {otp_code}. Válido por 5 minutos.",
                from_=f'whatsapp:{self.from_number}',
                to=f'whatsapp:{phone_number}'
            )
            logger.info(f"OTP enviado a {phone_number} via Twilio: {message.sid}")
            return {
                'success': True,
                'error': None,
                'message_id': message.sid
            }
        except Exception as e:
            logger.error(f"Error enviando OTP via Twilio: {e}")
            return {
                'success': False,
                'error': str(e),
                'message_id': None
            }

    def send_reminder(self, phone_number: str, message: str) -> dict:
        try:
            msg = self.client.messages.create(
                body=message,
                from_=f'whatsapp:{self.from_number}',
                to=f'whatsapp:{phone_number}'
            )
            return {
                'success': True,
                'error': None,
                'message_id': msg.sid
            }
        except Exception as e:
            logger.error(f"Error enviando recordatorio via Twilio: {e}")
            return {
                'success': False,
                'error': str(e),
                'message_id': None
            }


class MetaWhatsAppProvider(WhatsAppProvider):
    """Proveedor de WhatsApp via Meta Cloud API."""

    def __init__(self):
        self.token = settings.META_WHATSAPP_TOKEN
        self.phone_id = settings.META_WHATSAPP_PHONE_ID
        self.api_url = f"https://graph.facebook.com/v18.0/{self.phone_id}/messages"

    def _send_message(self, phone_number: str, text: str) -> dict:
        try:
            import requests
        except ImportError:
            raise ImportError("Instala requests: pip install requests")

        headers = {
            'Authorization': f'Bearer {self.token}',
            'Content-Type': 'application/json'
        }
        payload = {
            'messaging_product': 'whatsapp',
            'to': phone_number.replace('+', ''),
            'type': 'text',
            'text': {'body': text}
        }

        try:
            response = requests.post(self.api_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            message_id = data.get('messages', [{}])[0].get('id')
            logger.info(f"Mensaje enviado via Meta: {message_id}")
            return {
                'success': True,
                'error': None,
                'message_id': message_id
            }
        except Exception as e:
            logger.error(f"Error enviando mensaje via Meta: {e}")
            return {
                'success': False,
                'error': str(e),
                'message_id': None
            }

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        message = f"Tu código de verificación Stylo es: {otp_code}. Válido por 5 minutos."
        return self._send_message(phone_number, message)

    def send_reminder(self, phone_number: str, message: str) -> dict:
        return self._send_message(phone_number, message)


class WhatsAppService:
    """
    Servicio principal de WhatsApp.
    Selecciona el proveedor según la configuración.
    """
    _providers = {
        'mock': MockWhatsAppProvider,
        'twilio': TwilioWhatsAppProvider,
        'meta': MetaWhatsAppProvider,
    }

    def __init__(self):
        provider_name = getattr(settings, 'WHATSAPP_PROVIDER', 'mock')
        provider_class = self._providers.get(provider_name, MockWhatsAppProvider)
        self.provider = provider_class()
        logger.info(f"WhatsApp service inicializado con proveedor: {provider_name}")

    def send_otp(self, phone_number: str, otp_code: str) -> dict:
        """Envía un código OTP."""
        return self.provider.send_otp(phone_number, otp_code)

    def send_reminder(self, phone_number: str, message: str) -> dict:
        """Envía un recordatorio de cita."""
        return self.provider.send_reminder(phone_number, message)

    def send_appointment_confirmation(
        self,
        phone_number: str,
        client_name: str,
        service_name: str,
        staff_name: str,
        datetime_str: str,
        branch_name: str
    ) -> dict:
        """Envía confirmación de cita."""
        message = (
            f"¡Hola {client_name}! 👋\n\n"
            f"Tu cita ha sido confirmada:\n"
            f"📋 Servicio: {service_name}\n"
            f"👤 Profesional: {staff_name}\n"
            f"📅 Fecha: {datetime_str}\n"
            f"📍 Local: {branch_name}\n\n"
            f"¡Te esperamos!"
        )
        return self.provider.send_reminder(phone_number, message)

    def send_appointment_reminder(
        self,
        phone_number: str,
        client_name: str,
        service_name: str,
        datetime_str: str,
        branch_name: str
    ) -> dict:
        """Envía recordatorio de cita (24h antes)."""
        message = (
            f"¡Hola {client_name}! 👋\n\n"
            f"Te recordamos tu cita para mañana:\n"
            f"📋 Servicio: {service_name}\n"
            f"📅 Fecha: {datetime_str}\n"
            f"📍 Local: {branch_name}\n\n"
            f"¿Necesitas reprogramar? Responde a este mensaje."
        )
        return self.provider.send_reminder(phone_number, message)
