"""
Servicio de integración con Culqi.
Maneja la comunicación con la API de Culqi para procesar pagos.
"""
import requests
import logging
from decimal import Decimal
from typing import Optional
from django.conf import settings


logger = logging.getLogger(__name__)


class CulqiError(Exception):
    """Excepción base para errores de Culqi."""

    def __init__(self, message: str, code: str = None, response: dict = None):
        self.message = message
        self.code = code
        self.response = response
        super().__init__(self.message)


class CulqiService:
    """
    Servicio para integración con Culqi.

    Culqi es una pasarela de pagos para Perú.
    Documentación: https://docs.culqi.com/

    Flujo típico:
    1. Frontend genera token de tarjeta usando Culqi.js
    2. Backend crea Customer si no existe
    3. Backend crea Card asociada al Customer
    4. Backend realiza Charge usando la Card
    """

    BASE_URL = "https://api.culqi.com/v2"

    def __init__(self):
        self.public_key = getattr(settings, 'CULQI_PUBLIC_KEY', '')
        self.secret_key = getattr(settings, 'CULQI_SECRET_KEY', '')

        if not self.secret_key:
            logger.warning("CULQI_SECRET_KEY not configured")

    def _get_headers(self) -> dict:
        """Headers para requests autenticados."""
        return {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json"
        }

    def _make_request(
        self,
        method: str,
        endpoint: str,
        data: dict = None,
        params: dict = None
    ) -> dict:
        """
        Realiza una petición a la API de Culqi.

        Args:
            method: GET, POST, DELETE, etc.
            endpoint: Endpoint de la API (sin la base URL)
            data: Body de la petición (para POST/PUT)
            params: Query params (para GET)

        Returns:
            Response JSON de Culqi

        Raises:
            CulqiError: Si hay error en la petición
        """
        url = f"{self.BASE_URL}/{endpoint}"
        headers = self._get_headers()

        try:
            response = requests.request(
                method=method,
                url=url,
                json=data,
                params=params,
                headers=headers,
                timeout=30
            )

            response_data = response.json()

            if response.status_code >= 400:
                error_message = response_data.get('user_message') or response_data.get('merchant_message', 'Error desconocido')
                error_code = response_data.get('type', 'unknown_error')
                logger.error(f"Culqi API error: {error_code} - {error_message}")
                raise CulqiError(
                    message=error_message,
                    code=error_code,
                    response=response_data
                )

            return response_data

        except requests.exceptions.Timeout:
            logger.error("Culqi API timeout")
            raise CulqiError(message="Tiempo de espera agotado", code="timeout")
        except requests.exceptions.RequestException as e:
            logger.error(f"Culqi API request error: {e}")
            raise CulqiError(message="Error de conexión", code="connection_error")

    # ==================== CUSTOMERS ====================

    def create_customer(
        self,
        email: str,
        first_name: str,
        last_name: str,
        phone: str = None,
        address: str = None,
        address_city: str = None,
        country_code: str = "PE",
        metadata: dict = None
    ) -> dict:
        """
        Crea un Customer en Culqi.

        El Customer es necesario para asociar tarjetas y realizar cobros.

        Args:
            email: Email del cliente (obligatorio, único)
            first_name: Nombre
            last_name: Apellido
            phone: Teléfono (opcional)
            address: Dirección (opcional)
            address_city: Ciudad (opcional)
            country_code: Código de país (default: PE)
            metadata: Datos adicionales (opcional)

        Returns:
            dict con id del customer y datos
        """
        data = {
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "country_code": country_code
        }

        if phone:
            data["phone_number"] = phone
        if address:
            data["address"] = address
        if address_city:
            data["address_city"] = address_city
        if metadata:
            data["metadata"] = metadata

        logger.info(f"Creating Culqi customer for: {email}")
        return self._make_request("POST", "customers", data)

    def get_customer(self, customer_id: str) -> dict:
        """Obtiene un Customer por su ID."""
        return self._make_request("GET", f"customers/{customer_id}")

    def get_customer_by_email(self, email: str) -> Optional[dict]:
        """
        Busca un Customer por email.

        Returns:
            dict con datos del customer o None si no existe
        """
        try:
            response = self._make_request("GET", "customers", params={"email": email})
            items = response.get("data", [])
            return items[0] if items else None
        except CulqiError:
            return None

    def delete_customer(self, customer_id: str) -> dict:
        """Elimina un Customer."""
        return self._make_request("DELETE", f"customers/{customer_id}")

    # ==================== CARDS ====================

    def create_card(
        self,
        customer_id: str,
        token_id: str,
        metadata: dict = None
    ) -> dict:
        """
        Asocia una tarjeta (Card) a un Customer.

        El token_id se genera en el frontend usando Culqi.js

        Args:
            customer_id: ID del Customer en Culqi
            token_id: Token generado por Culqi.js (válido por 5 minutos)
            metadata: Datos adicionales (opcional)

        Returns:
            dict con id de la card y datos (brand, last_four, etc.)
        """
        data = {
            "customer_id": customer_id,
            "token_id": token_id
        }

        if metadata:
            data["metadata"] = metadata

        logger.info(f"Creating Culqi card for customer: {customer_id}")
        return self._make_request("POST", "cards", data)

    def get_card(self, card_id: str) -> dict:
        """Obtiene una Card por su ID."""
        return self._make_request("GET", f"cards/{card_id}")

    def get_customer_cards(self, customer_id: str) -> list:
        """Lista las Cards de un Customer."""
        response = self._make_request(
            "GET",
            "cards",
            params={"customer_id": customer_id}
        )
        return response.get("data", [])

    def delete_card(self, card_id: str) -> dict:
        """Elimina una Card."""
        return self._make_request("DELETE", f"cards/{card_id}")

    # ==================== CHARGES ====================

    def create_charge(
        self,
        amount_cents: int,
        currency: str,
        email: str,
        source_id: str,
        description: str = None,
        capture: bool = True,
        installments: int = None,
        metadata: dict = None,
        antifraud_details: dict = None
    ) -> dict:
        """
        Crea un Charge (cobro) en Culqi.

        Args:
            amount_cents: Monto en centavos (ej: 5000 = S/50.00)
            currency: Moneda (PEN o USD)
            email: Email del cliente
            source_id: ID de la Card o Token
            description: Descripción del cobro
            capture: Si se captura inmediatamente (default: True)
            installments: Número de cuotas (opcional, 2-36)
            metadata: Datos adicionales (opcional)
            antifraud_details: Datos antifraude (opcional)

        Returns:
            dict con id del charge, estado, etc.
        """
        data = {
            "amount": amount_cents,
            "currency_code": currency,
            "email": email,
            "source_id": source_id,
            "capture": capture
        }

        if description:
            data["description"] = description
        if installments:
            data["installments"] = installments
        if metadata:
            data["metadata"] = metadata
        if antifraud_details:
            data["antifraud_details"] = antifraud_details

        logger.info(f"Creating Culqi charge: {amount_cents} {currency} for {email}")
        return self._make_request("POST", "charges", data)

    def get_charge(self, charge_id: str) -> dict:
        """Obtiene un Charge por su ID."""
        return self._make_request("GET", f"charges/{charge_id}")

    def capture_charge(self, charge_id: str) -> dict:
        """Captura un Charge que fue creado con capture=False."""
        return self._make_request("POST", f"charges/{charge_id}/capture")

    # ==================== REFUNDS ====================

    def create_refund(
        self,
        charge_id: str,
        amount_cents: int,
        reason: str = "solicitud_comprador"
    ) -> dict:
        """
        Crea un Refund (reembolso) para un Charge.

        Args:
            charge_id: ID del Charge a reembolsar
            amount_cents: Monto a reembolsar en centavos
            reason: Razón del reembolso:
                - solicitud_comprador
                - duplicado
                - fraude

        Returns:
            dict con id del refund y estado
        """
        data = {
            "charge_id": charge_id,
            "amount": amount_cents,
            "reason": reason
        }

        logger.info(f"Creating Culqi refund for charge: {charge_id}")
        return self._make_request("POST", "refunds", data)

    # ==================== HELPER METHODS ====================

    @staticmethod
    def amount_to_cents(amount: Decimal) -> int:
        """Convierte un monto decimal a centavos (entero)."""
        return int(amount * 100)

    @staticmethod
    def cents_to_amount(cents: int) -> Decimal:
        """Convierte centavos a monto decimal."""
        return Decimal(cents) / 100

    def create_or_get_customer(
        self,
        email: str,
        first_name: str,
        last_name: str,
        **kwargs
    ) -> dict:
        """
        Obtiene un Customer existente o crea uno nuevo.

        Args:
            email: Email del cliente
            first_name: Nombre
            last_name: Apellido
            **kwargs: Argumentos adicionales para create_customer

        Returns:
            dict con datos del customer
        """
        # Intentar buscar por email
        existing = self.get_customer_by_email(email)
        if existing:
            logger.info(f"Found existing Culqi customer: {existing['id']}")
            return existing

        # Crear nuevo
        return self.create_customer(
            email=email,
            first_name=first_name,
            last_name=last_name,
            **kwargs
        )

    def charge_card(
        self,
        card_id: str,
        amount: Decimal,
        currency: str,
        email: str,
        description: str = None,
        metadata: dict = None
    ) -> dict:
        """
        Realiza un cobro usando una Card guardada.

        Args:
            card_id: ID de la Card en Culqi
            amount: Monto en soles (Decimal)
            currency: Moneda (PEN o USD)
            email: Email del cliente
            description: Descripción del cobro
            metadata: Datos adicionales

        Returns:
            dict con datos del charge
        """
        amount_cents = self.amount_to_cents(amount)

        return self.create_charge(
            amount_cents=amount_cents,
            currency=currency,
            email=email,
            source_id=card_id,
            description=description,
            metadata=metadata
        )

    def process_subscription_payment(
        self,
        card_id: str,
        amount: Decimal,
        email: str,
        business_name: str,
        invoice_id: int,
        period: str
    ) -> dict:
        """
        Procesa un pago de suscripción.

        Args:
            card_id: ID de la Card en Culqi
            amount: Monto a cobrar
            email: Email del negocio
            business_name: Nombre del negocio
            invoice_id: ID de la factura
            period: Período de facturación (ej: "2024-01")

        Returns:
            dict con datos del charge
        """
        description = f"Suscripción Stylo - {business_name} ({period})"
        metadata = {
            "business_name": business_name,
            "invoice_id": str(invoice_id),
            "period": period,
            "type": "subscription"
        }

        return self.charge_card(
            card_id=card_id,
            amount=amount,
            currency="PEN",
            email=email,
            description=description,
            metadata=metadata
        )
