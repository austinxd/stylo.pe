"""
Webhook receivers para Culqi.

Provee endpoint público que verifica firma HMAC antes de procesar eventos.
La firma se calcula como HMAC-SHA256 del cuerpo crudo (raw body) usando
CULQI_WEBHOOK_SECRET, y se compara contra el header configurado en
constant-time para evitar timing attacks.

Sin firma válida → 403. Nunca debe procesarse el evento.

Integración:
1. Configurar en panel Culqi la URL: https://<dominio>/api/v1/subscriptions/webhooks/culqi/
2. Establecer CULQI_WEBHOOK_SECRET en .env (mismo valor que en Culqi)
3. Culqi envía eventos (charge.creation.succeeded, refund.creation.succeeded, etc.)
   con header X-Culqi-Signature: <hex digest>
"""
import hmac
import hashlib
import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST


logger = logging.getLogger(__name__)


CULQI_SIGNATURE_HEADER = 'HTTP_X_CULQI_SIGNATURE'


def _verify_signature(raw_body: bytes, received_signature: str, secret: str) -> bool:
    """
    Verifica firma HMAC-SHA256 en constant-time.

    Retorna False si:
    - No hay firma recibida
    - No hay secret configurado
    - La firma no coincide
    """
    if not received_signature or not secret:
        return False

    expected = hmac.new(
        secret.encode('utf-8'),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # compare_digest es constant-time: no permite timing attacks
    return hmac.compare_digest(expected, received_signature)


@csrf_exempt
@require_POST
def culqi_webhook(request):
    """
    Recibe webhooks de Culqi. Verifica firma antes de procesar.

    Respuestas:
    - 200: evento procesado (incluso si el tipo es desconocido, devolvemos 200
           para que Culqi no reintente — el evento se loguea para análisis)
    - 400: cuerpo malformado
    - 403: firma inválida o ausente
    """
    secret = getattr(settings, 'CULQI_WEBHOOK_SECRET', '')
    if not secret:
        # Defensa: si el secret no está configurado, rechazamos en vez de
        # silenciosamente aceptar cualquier request.
        logger.error("Culqi webhook llegó pero CULQI_WEBHOOK_SECRET no está configurado")
        return HttpResponse(status=403)

    received_signature = request.META.get(CULQI_SIGNATURE_HEADER, '')

    if not _verify_signature(request.body, received_signature, secret):
        logger.warning(
            "Webhook Culqi con firma inválida desde %s",
            request.META.get('REMOTE_ADDR', 'unknown'),
        )
        return HttpResponse(status=403)

    # Firma válida → parsear payload
    try:
        payload = json.loads(request.body.decode('utf-8'))
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.error("Webhook Culqi con body inválido")
        return HttpResponse(status=400)

    event_type = payload.get('type') or payload.get('event', 'unknown')
    object_id = (payload.get('data') or {}).get('id') if isinstance(payload.get('data'), dict) else None

    logger.info(
        "Webhook Culqi recibido: type=%s object_id=%s",
        event_type,
        object_id,
    )

    # Handlers por tipo de evento. Por ahora sólo logueamos.
    # TODO: implementar acciones específicas cuando se requiera:
    # - charge.creation.succeeded → marcar Payment como exitoso
    # - charge.creation.failed → marcar Payment como fallido y notificar
    # - refund.creation.succeeded → registrar reembolso en Invoice
    # - dispute.creation → alertar a soporte

    return HttpResponse(status=200)
