"""
Servicio para consulta de datos por DNI.
"""
import requests
import base64
import uuid
from django.conf import settings
from django.core.files.base import ContentFile


DNI_API_URL = "https://casaaustin.pe/datos/api.php"


class DNIService:
    """
    Servicio para consultar datos de persona por DNI.
    """

    @staticmethod
    def lookup_dni(dni: str) -> dict:
        """
        Consulta datos de una persona por su DNI.

        Args:
            dni: Número de DNI (8 dígitos)

        Returns:
            dict con los datos encontrados o None si no existe
            {
                'found': bool,
                'first_name': str,
                'last_name_paterno': str,
                'last_name_materno': str,
                'photo_base64': str (opcional),
                'birth_date': str (opcional),
                'gender': str (opcional)
            }
        """
        # Validar formato de DNI
        dni = ''.join(c for c in str(dni) if c.isdigit())
        if len(dni) != 8:
            return {'found': False, 'error': 'DNI debe tener 8 dígitos'}

        try:
            response = requests.get(
                DNI_API_URL,
                params={'dni': dni},
                timeout=10
            )
            response.raise_for_status()
            data = response.json()

            if not data or 'data' not in data:
                return {'found': False}

            person_data = data['data']

            result = {
                'found': True,
                'first_name': person_data.get('preNombres', ''),
                'last_name_paterno': person_data.get('apePaterno', ''),
                'last_name_materno': person_data.get('apeMaterno', ''),
            }

            # Agregar foto si existe
            if person_data.get('imagen_foto'):
                result['photo_base64'] = person_data['imagen_foto']

            # Agregar fecha de nacimiento si existe
            if person_data.get('feNacimiento'):
                result['birth_date'] = person_data['feNacimiento']

            # Agregar género si existe (convertir a formato del sistema)
            if person_data.get('sexo'):
                result['gender'] = 'M' if person_data['sexo'].lower() == 'm' else 'F'

            return result

        except requests.RequestException as e:
            return {'found': False, 'error': f'Error de conexión: {str(e)}'}
        except (ValueError, KeyError) as e:
            return {'found': False, 'error': f'Error procesando respuesta: {str(e)}'}

    @staticmethod
    def save_base64_photo(base64_data: str, prefix: str = 'dni_photo') -> ContentFile:
        """
        Convierte una imagen base64 a ContentFile para guardar en Django.

        Args:
            base64_data: String base64 de la imagen (sin el prefijo data:image/...)
            prefix: Prefijo para el nombre del archivo

        Returns:
            ContentFile listo para guardar en ImageField
        """
        try:
            # Decodificar base64
            image_data = base64.b64decode(base64_data)

            # Generar nombre único
            filename = f"{prefix}_{uuid.uuid4().hex[:8]}.jpg"

            return ContentFile(image_data, name=filename)

        except Exception as e:
            raise ValueError(f'Error decodificando imagen: {str(e)}')
