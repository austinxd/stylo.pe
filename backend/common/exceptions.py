"""
Manejo personalizado de excepciones para la API.
"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


def custom_exception_handler(exc, context):
    """
    Manejador de excepciones personalizado que formatea
    las respuestas de error de manera consistente.
    """
    response = exception_handler(exc, context)

    if response is not None:
        custom_response = {
            'success': False,
            'error': {
                'code': response.status_code,
                'message': get_error_message(response.data),
                'details': response.data if isinstance(response.data, dict) else None
            }
        }
        response.data = custom_response

    return response


def get_error_message(data):
    """Extrae un mensaje de error legible de los datos de respuesta."""
    if isinstance(data, dict):
        if 'detail' in data:
            return str(data['detail'])
        if 'non_field_errors' in data:
            return str(data['non_field_errors'][0])
        # Retornar el primer error encontrado
        for key, value in data.items():
            if isinstance(value, list) and value:
                return f"{key}: {value[0]}"
            elif isinstance(value, str):
                return f"{key}: {value}"
    elif isinstance(data, list) and data:
        return str(data[0])
    return 'Error desconocido'


class APIException(Exception):
    """Excepción base para errores de la API."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_message = 'Ha ocurrido un error.'

    def __init__(self, message=None, code=None):
        self.message = message or self.default_message
        if code:
            self.status_code = code
        super().__init__(self.message)


class ValidationError(APIException):
    """Error de validación."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_message = 'Datos inválidos.'


class NotFoundError(APIException):
    """Recurso no encontrado."""
    status_code = status.HTTP_404_NOT_FOUND
    default_message = 'Recurso no encontrado.'


class AuthenticationError(APIException):
    """Error de autenticación."""
    status_code = status.HTTP_401_UNAUTHORIZED
    default_message = 'No autenticado.'


class PermissionError(APIException):
    """Error de permisos."""
    status_code = status.HTTP_403_FORBIDDEN
    default_message = 'No tiene permisos para esta acción.'
