"""
Serializers para autenticación y cuentas.
"""
import re
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Client, StaffMember

User = get_user_model()


class PhoneNumberSerializer(serializers.Serializer):
    """Serializer para validar número de teléfono."""
    phone_number = serializers.CharField(max_length=20)

    def validate_phone_number(self, value):
        # Formato esperado: +51987654321 (código país + número)
        pattern = r'^\+[1-9]\d{6,14}$'
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                'Formato inválido. Use formato internacional: +51987654321'
            )
        return value


class OTPVerifySerializer(serializers.Serializer):
    """Serializer para verificar OTP."""
    phone_number = serializers.CharField(max_length=20)
    otp_code = serializers.CharField(max_length=6, min_length=6)

    def validate_otp_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('El código OTP debe contener solo números')
        return value


class CompleteRegistrationSerializer(serializers.Serializer):
    """
    Serializer para completar el registro de duenos o profesionales.

    Flujo:
    1. Usuario selecciona tipo de cuenta
    2. Llena formulario con datos personales completos
    3. Se envia OTP a WhatsApp
    4. Verifica OTP y se crea la cuenta

    account_type:
    - 'business_owner': Dueno de negocio (creara su negocio despues)
    - 'staff': Profesional independiente (sera asignado a un negocio)
    """
    ACCOUNT_TYPE_CHOICES = [
        ('business_owner', 'Dueno de negocio'),
        ('staff', 'Profesional'),
    ]

    DOCUMENT_TYPE_CHOICES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carne de Extranjeria'),
    ]

    registration_token = serializers.CharField(max_length=64)
    account_type = serializers.ChoiceField(choices=ACCOUNT_TYPE_CHOICES)

    # Documento de identidad
    document_type = serializers.ChoiceField(choices=DOCUMENT_TYPE_CHOICES)
    document_number = serializers.CharField(max_length=20, min_length=8)

    # Datos personales
    first_name = serializers.CharField(max_length=100)
    last_name_paterno = serializers.CharField(max_length=100)
    last_name_materno = serializers.CharField(max_length=100, required=False, allow_blank=True)
    birth_date = serializers.DateField()
    phone_number = serializers.CharField(max_length=20)
    email = serializers.EmailField(required=False, allow_blank=True)

    # Contrasena
    password = serializers.CharField(max_length=128, min_length=8, write_only=True)
    password_confirm = serializers.CharField(max_length=128, min_length=8, write_only=True)

    # Solo para profesionales
    specialty = serializers.CharField(max_length=100, required=False, allow_blank=True)
    bio = serializers.CharField(max_length=500, required=False, allow_blank=True)

    def validate_document_number(self, value):
        # Solo alfanumericos
        if not value.isalnum():
            raise serializers.ValidationError('El documento solo puede contener letras y numeros')
        return value.upper()

    def validate_phone_number(self, value):
        # Formato esperado: +51987654321
        pattern = r'^\+?[1-9]\d{6,14}$'
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                'Formato invalido. Use formato internacional: +51987654321'
            )
        return value

    def validate(self, attrs):
        account_type = attrs.get('account_type')

        # Validar que las contraseñas coincidan
        password = attrs.get('password')
        password_confirm = attrs.get('password_confirm')
        if password != password_confirm:
            raise serializers.ValidationError({
                'password_confirm': 'Las contraseñas no coinciden'
            })

        # Validaciones especificas por tipo
        if account_type == 'staff':
            if not attrs.get('specialty'):
                raise serializers.ValidationError({
                    'specialty': 'La especialidad es requerida para profesionales'
                })

        return attrs


class ClientSerializer(serializers.ModelSerializer):
    """Serializer para el perfil de cliente."""
    phone_number = serializers.CharField(source='user.phone_number', read_only=True)

    class Meta:
        model = Client
        fields = [
            'id', 'phone_number', 'document_type', 'document_number',
            'first_name', 'last_name_paterno', 'last_name_materno',
            'birth_date', 'whatsapp_opt_in', 'created_at'
        ]
        read_only_fields = ['id', 'document_type', 'document_number', 'created_at']


class ClientUpdateSerializer(serializers.ModelSerializer):
    """Serializer para actualizar perfil de cliente."""

    class Meta:
        model = Client
        fields = ['first_name', 'last_name_paterno', 'last_name_materno', 'whatsapp_opt_in']


class StaffMemberSerializer(serializers.ModelSerializer):
    """Serializer para profesionales."""
    business_name = serializers.CharField(source='current_business.name', read_only=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = StaffMember
        fields = [
            'id', 'first_name', 'last_name_paterno', 'last_name_materno',
            'full_name', 'photo', 'bio', 'specialty', 'branches',
            'current_business', 'business_name', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'full_name']


class StaffMemberListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listas de profesionales."""
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = StaffMember
        fields = ['id', 'first_name', 'last_name_paterno', 'full_name', 'photo', 'specialty']


class UserSerializer(serializers.ModelSerializer):
    """Serializer básico de usuario."""

    class Meta:
        model = User
        fields = ['id', 'phone_number', 'email', 'role', 'is_verified']
        read_only_fields = ['id', 'phone_number', 'role', 'is_verified']


class DocumentCheckSerializer(serializers.Serializer):
    """Serializer para verificar si existe cuenta por documento."""
    DOCUMENT_TYPE_CHOICES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carne de Extranjeria'),
    ]

    document_type = serializers.ChoiceField(choices=DOCUMENT_TYPE_CHOICES)
    document_number = serializers.CharField(max_length=20, min_length=8)

    def validate_document_number(self, value):
        if not value.isalnum():
            raise serializers.ValidationError('El documento solo puede contener letras y numeros')
        return value.upper()


class DocumentLoginSerializer(serializers.Serializer):
    """Serializer para login con documento + contraseña (dueños y profesionales)."""
    DOCUMENT_TYPE_CHOICES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carne de Extranjeria'),
    ]

    document_type = serializers.ChoiceField(choices=DOCUMENT_TYPE_CHOICES)
    document_number = serializers.CharField(max_length=20, min_length=8)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_document_number(self, value):
        if not value.isalnum():
            raise serializers.ValidationError('El documento solo puede contener letras y numeros')
        return value.upper()


class PasswordLoginSerializer(serializers.Serializer):
    """Serializer para login con contraseña (dueños y profesionales) - DEPRECADO."""
    phone_number = serializers.CharField(max_length=20)
    password = serializers.CharField(max_length=128, write_only=True)

    def validate_phone_number(self, value):
        pattern = r'^\+[1-9]\d{6,14}$'
        if not re.match(pattern, value):
            raise serializers.ValidationError(
                'Formato invalido. Use formato internacional: +51987654321'
            )
        return value


class AuthResponseSerializer(serializers.Serializer):
    """Serializer para respuestas de autenticación."""
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    user = UserSerializer()
    client = ClientSerializer(required=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer para solicitar reset de contrasena por documento."""
    DOCUMENT_TYPE_CHOICES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carne de Extranjeria'),
    ]

    document_type = serializers.ChoiceField(choices=DOCUMENT_TYPE_CHOICES)
    document_number = serializers.CharField(max_length=20, min_length=8)

    def validate_document_number(self, value):
        if not value.isalnum():
            raise serializers.ValidationError('El documento solo puede contener letras y numeros')
        return value.upper()


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer para confirmar reset de contrasena con OTP."""
    DOCUMENT_TYPE_CHOICES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carne de Extranjeria'),
    ]

    document_type = serializers.ChoiceField(choices=DOCUMENT_TYPE_CHOICES)
    document_number = serializers.CharField(max_length=20, min_length=8)
    otp_code = serializers.CharField(max_length=6, min_length=6)
    new_password = serializers.CharField(max_length=128, min_length=8, write_only=True)
    new_password_confirm = serializers.CharField(max_length=128, min_length=8, write_only=True)

    def validate_document_number(self, value):
        if not value.isalnum():
            raise serializers.ValidationError('El documento solo puede contener letras y numeros')
        return value.upper()

    def validate_otp_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('El codigo OTP debe contener solo numeros')
        return value

    def validate(self, attrs):
        if attrs.get('new_password') != attrs.get('new_password_confirm'):
            raise serializers.ValidationError({
                'new_password_confirm': 'Las contrasenas no coinciden'
            })
        return attrs
