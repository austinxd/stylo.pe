"""
Tests del webhook Culqi: verificación HMAC y respuestas HTTP.
"""
import hmac
import hashlib
import json

from django.test import TestCase, Client, override_settings
from django.urls import reverse


WEBHOOK_SECRET = 'test-webhook-secret-1234567890'


def _sign(body: bytes, secret: str = WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()


@override_settings(CULQI_WEBHOOK_SECRET=WEBHOOK_SECRET)
class CulqiWebhookTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.url = reverse('culqi-webhook')

    def test_valid_signature_returns_200(self):
        body = json.dumps({
            'type': 'charge.creation.succeeded',
            'data': {'id': 'chr_test_abc'},
        }).encode()
        signature = _sign(body)

        response = self.client.post(
            self.url,
            data=body,
            content_type='application/json',
            HTTP_X_CULQI_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 200)

    def test_missing_signature_returns_403(self):
        body = json.dumps({'type': 'x'}).encode()
        response = self.client.post(
            self.url, data=body, content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_invalid_signature_returns_403(self):
        body = json.dumps({'type': 'x'}).encode()
        response = self.client.post(
            self.url, data=body, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE='a' * 64,
        )
        self.assertEqual(response.status_code, 403)

    def test_tampered_body_returns_403(self):
        original = json.dumps({'type': 'charge', 'data': {'id': 'orig'}}).encode()
        signature = _sign(original)

        tampered = json.dumps({'type': 'charge', 'data': {'id': 'evil'}}).encode()
        response = self.client.post(
            self.url, data=tampered, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 403, 'Body modificado debe rechazarse')

    def test_wrong_secret_returns_403(self):
        body = json.dumps({'type': 'x'}).encode()
        # firmar con otro secret
        signature = _sign(body, secret='wrong-secret')
        response = self.client.post(
            self.url, data=body, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 403)

    def test_malformed_body_returns_400(self):
        body = b'not valid json'
        signature = _sign(body)
        response = self.client.post(
            self.url, data=body, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 400)

    def test_get_not_allowed(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 405)

    def test_csrf_exempt(self):
        """El webhook NO debe requerir CSRF token (es server-to-server)."""
        body = json.dumps({'type': 'x'}).encode()
        signature = _sign(body)
        # Enviar sin token CSRF, debe pasar la verificación de firma
        response = self.client.post(
            self.url, data=body, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE=signature,
        )
        self.assertEqual(response.status_code, 200)


@override_settings(CULQI_WEBHOOK_SECRET='')
class CulqiWebhookWithoutSecretTests(TestCase):
    def test_without_secret_rejects_all_requests(self):
        """Si no hay secret configurado, rechazar TODO (fail-secure)."""
        client = Client()
        url = reverse('culqi-webhook')
        body = b'{}'

        response = client.post(
            url, data=body, content_type='application/json',
            HTTP_X_CULQI_SIGNATURE='anything',
        )
        self.assertEqual(response.status_code, 403)
