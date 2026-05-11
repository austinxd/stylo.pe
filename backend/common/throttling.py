"""
Throttle classes personalizadas para endpoints sensibles.

Provee dos dimensiones de rate limiting:
- Por IP del solicitante (limita atacantes)
- Por número de teléfono (limita spam a un destinatario específico)

Ambos deben usarse en conjunto en endpoints que envían OTP, para que un
atacante no pueda spamear un teléfono específico distribuyendo desde
múltiples IPs ni saturar la cuenta de Twilio/Meta desde una sola IP.
"""
from rest_framework.throttling import SimpleRateThrottle


class IPRateThrottle(SimpleRateThrottle):
    """
    Throttle por IP. Subclases definen scope para configurar el rate.
    """
    scope = 'anon'

    def get_cache_key(self, request, view):
        return self.cache_format % {
            'scope': self.scope,
            'ident': self.get_ident(request),
        }


class OTPSendIPThrottle(IPRateThrottle):
    scope = 'otp_send_ip'


class OTPVerifyIPThrottle(IPRateThrottle):
    scope = 'otp_verify_ip'


class BookingSendOTPIPThrottle(IPRateThrottle):
    scope = 'booking_send_otp_ip'


class BookingVerifyOTPIPThrottle(IPRateThrottle):
    scope = 'booking_verify_otp_ip'


class DocumentCheckThrottle(IPRateThrottle):
    """Anti-enumeración: limita probes contra /document/check."""
    scope = 'document_check'


class PhoneNumberThrottle(SimpleRateThrottle):
    """
    Throttle por número de teléfono normalizado del body del request.

    Si el request no tiene phone_number válido, no aplica este throttle
    (deja pasar — el IP throttle es la defensa principal en ese caso).
    Esto evita que requests malformados se rate-limiten en una key vacía.
    """
    phone_field = 'phone_number'

    def get_cache_key(self, request, view):
        phone = self._extract_phone(request)
        if not phone:
            return None
        return self.cache_format % {
            'scope': self.scope,
            'ident': phone,
        }

    def _extract_phone(self, request):
        if not isinstance(request.data, dict):
            return None
        phone = request.data.get(self.phone_field)
        if not phone or not isinstance(phone, str):
            return None
        normalized = phone.strip()
        if not normalized.startswith('+') or len(normalized) < 8:
            return None
        return normalized


class OTPSendPhoneThrottle(PhoneNumberThrottle):
    scope = 'otp_send_phone'


class OTPVerifyPhoneThrottle(PhoneNumberThrottle):
    scope = 'otp_verify_phone'
