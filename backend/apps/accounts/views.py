"""
Views para autenticación y gestión de cuentas.
"""
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings

from .models import User
from .serializers import (
    PhoneNumberSerializer,
    OTPVerifySerializer,
    CompleteRegistrationSerializer,
    PasswordLoginSerializer,
    DocumentCheckSerializer,
    DocumentLoginSerializer,
    UserSerializer,
    StaffMemberSerializer,
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer
)
from .services import OTPService, WhatsAppService, OTPProviderService
from .models import StaffMember, BusinessOwnerProfile


class CheckPhoneView(APIView):
    """
    POST /auth/whatsapp/check
    Verifica si un número de teléfono está registrado (sin enviar OTP).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PhoneNumberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone_number = serializer.validated_data['phone_number']

        # Verificar si existe usuario con este teléfono
        try:
            user = User.objects.get(phone_number=phone_number)
            return Response({
                'success': True,
                'exists': True,
                'is_active': user.is_active,
                'role': user.role
            })
        except User.DoesNotExist:
            return Response({
                'success': True,
                'exists': False
            })


class CheckDocumentView(APIView):
    """
    POST /auth/document/check
    Verifica si existe una cuenta de profesional o dueño por documento.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DocumentCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document_type = serializer.validated_data['document_type']
        document_number = serializer.validated_data['document_number']

        # Buscar en perfiles de staff
        try:
            staff = StaffMember.objects.select_related('user').get(
                document_type=document_type,
                document_number=document_number
            )
            return Response({
                'success': True,
                'exists': True,
                'role': 'staff',
                'is_active': staff.user.is_active if staff.user else False,
                'name': staff.full_name
            })
        except StaffMember.DoesNotExist:
            pass

        # Buscar en perfiles de dueños
        try:
            owner = BusinessOwnerProfile.objects.select_related('user').get(
                document_type=document_type,
                document_number=document_number
            )
            return Response({
                'success': True,
                'exists': True,
                'role': 'business_owner',
                'is_active': owner.user.is_active if owner.user else False,
                'name': owner.full_name
            })
        except BusinessOwnerProfile.DoesNotExist:
            pass

        # No existe
        return Response({
            'success': True,
            'exists': False
        })


class DocumentLoginView(APIView):
    """
    POST /auth/document/login
    Login con documento + contraseña (para dueños y profesionales).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = DocumentLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document_type = serializer.validated_data['document_type']
        document_number = serializer.validated_data['document_number']
        password = serializer.validated_data['password']

        user = None
        profile = None

        # Buscar en perfiles de staff
        try:
            staff = StaffMember.objects.select_related('user').get(
                document_type=document_type,
                document_number=document_number
            )
            user = staff.user
            profile = staff
        except StaffMember.DoesNotExist:
            pass

        # Buscar en perfiles de dueños
        if not user:
            try:
                owner = BusinessOwnerProfile.objects.select_related('user').get(
                    document_type=document_type,
                    document_number=document_number
                )
                user = owner.user
                profile = owner
            except BusinessOwnerProfile.DoesNotExist:
                pass

        if not user:
            return Response(
                {'success': False, 'error': 'Credenciales incorrectas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Verificar contraseña
        if not user.check_password(password):
            return Response(
                {'success': False, 'error': 'Credenciales incorrectas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Verificar si la cuenta está activa
        if not user.is_active:
            return Response({
                'success': False,
                'error': 'Tu cuenta está pendiente de aprobación.',
                'pending_approval': True
            }, status=status.HTTP_403_FORBIDDEN)

        # Generar tokens
        refresh = RefreshToken.for_user(user)

        response_data = {
            'success': True,
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': UserSerializer(user).data
        }

        # Incluir perfil de staff si existe
        if hasattr(user, 'staff_profile') and user.staff_profile:
            response_data['staff'] = StaffMemberSerializer(user.staff_profile).data

        return Response(response_data)


class WhatsAppStartView(APIView):
    """
    POST /auth/whatsapp/start
    Inicia el proceso de autenticación enviando un OTP por WhatsApp.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PhoneNumberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone_number = serializer.validated_data['phone_number']

        # Crear sesión OTP
        session, otp_code = OTPService.create_session(phone_number)

        # Enviar OTP usando el proveedor configurado (SMS o WhatsApp)
        otp_sender = OTPProviderService()
        result = otp_sender.send_otp(phone_number, otp_code)

        if not result['success']:
            return Response(
                {
                    'success': False,
                    'error': 'Error al enviar el código. Intenta nuevamente.'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        expiry_minutes = getattr(settings, 'OTP_EXPIRY_MINUTES', 5)

        return Response({
            'success': True,
            'message': 'Código OTP enviado por WhatsApp',
            'expires_in': expiry_minutes * 60  # en segundos
        })


class WhatsAppVerifyView(APIView):
    """
    POST /auth/whatsapp/verify
    Verifica el código OTP.
    - Si el usuario existe: devuelve tokens de acceso.
    - Si no existe: devuelve registration_token para completar registro.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone_number = serializer.validated_data['phone_number']
        otp_code = serializer.validated_data['otp_code']

        # Verificar OTP
        result = OTPService.verify_otp(phone_number, otp_code)

        if not result['success']:
            return Response(
                {'success': False, 'error': result['error']},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Usuario ya registrado - devolver tokens
        if result['is_registered']:
            user = result['user']

            # Verificar si la cuenta está activa (aprobada por super_admin)
            if not user.is_active:
                return Response({
                    'success': False,
                    'error': 'Tu cuenta está pendiente de aprobación.',
                    'pending_approval': True
                }, status=status.HTTP_403_FORBIDDEN)

            refresh = RefreshToken.for_user(user)

            response_data = {
                'success': True,
                'is_registered': True,
                'access_token': str(refresh.access_token),
                'refresh_token': str(refresh),
                'user': UserSerializer(user).data
            }

            # Incluir perfil de staff si existe
            if hasattr(user, 'staff_profile'):
                response_data['staff'] = StaffMemberSerializer(user.staff_profile).data

            return Response(response_data)

        # Usuario nuevo - devolver token de registro
        return Response({
            'success': True,
            'is_registered': False,
            'registration_token': result['registration_token'],
            'message': 'Número verificado. Complete su registro.'
        })


class CompleteRegistrationView(APIView):
    """
    POST /auth/whatsapp/complete
    Completa el registro de un dueño de negocio.

    REGLA TEMPORAL:
    - Solo se permite registro de 'business_owner'
    - Los profesionales NO pueden registrarse solos, son creados por el dueño del negocio
    - Los profesionales no controlan su cuenta temporalmente

    account_type:
    - 'business_owner': Crea usuario con rol business_owner + BusinessOwnerProfile

    La cuenta queda pendiente de aprobación por super_admin.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CompleteRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Validar token de registro
        token = serializer.validated_data['registration_token']
        token_result = OTPService.validate_registration_token(token)

        if not token_result['valid']:
            return Response(
                {'success': False, 'error': token_result['error']},
                status=status.HTTP_400_BAD_REQUEST
            )

        session = token_result['session']
        account_type = serializer.validated_data['account_type']
        data = serializer.validated_data

        # RESTRICCIÓN TEMPORAL: Solo permitir business_owner
        if account_type != 'business_owner':
            return Response(
                {
                    'success': False,
                    'error': 'Temporalmente solo se permite registro de dueños de negocio. '
                             'Los profesionales son gestionados por el dueño del negocio.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Crear usuario como business_owner
        user = User.objects.create_user(
            phone_number=session.phone_number,
            email=data.get('email') or None,
            password=data['password'],
            role='business_owner',
            is_verified=True,
            is_active=False  # Pendiente de aprobación por super_admin
        )

        # Datos del perfil
        profile_data = {
            'document_type': data['document_type'],
            'document_number': data['document_number'],
            'first_name': data['first_name'],
            'last_name_paterno': data['last_name_paterno'],
            'last_name_materno': data.get('last_name_materno', ''),
            'birth_date': data['birth_date'],
        }

        # Crear perfil de dueño de negocio
        from .models import BusinessOwnerProfile

        BusinessOwnerProfile.objects.create(
            user=user,
            **profile_data
        )

        # Marcar sesión como completada
        OTPService.complete_registration(session)

        # NO generamos tokens porque la cuenta está inactiva
        # El usuario debe esperar aprobación del super_admin

        return Response({
            'success': True,
            'user': UserSerializer(user).data,
            'message': 'Registro completado. Tu cuenta está pendiente de aprobación.',
            'pending_approval': True
        }, status=status.HTTP_201_CREATED)


class PasswordLoginView(APIView):
    """
    POST /auth/password/login
    Login con teléfono y contraseña (solo para business_owner y staff).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        phone_number = serializer.validated_data['phone_number']
        password = serializer.validated_data['password']

        # Buscar usuario
        try:
            user = User.objects.get(phone_number=phone_number)
        except User.DoesNotExist:
            return Response(
                {'success': False, 'error': 'Credenciales incorrectas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Verificar que sea business_owner o staff
        if user.role not in ['business_owner', 'staff']:
            return Response(
                {'success': False, 'error': 'Este tipo de cuenta no usa contraseña'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar contraseña
        if not user.check_password(password):
            return Response(
                {'success': False, 'error': 'Credenciales incorrectas'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Verificar si la cuenta está activa
        if not user.is_active:
            return Response({
                'success': False,
                'error': 'Tu cuenta está pendiente de aprobación.',
                'pending_approval': True
            }, status=status.HTTP_403_FORBIDDEN)

        # Generar tokens
        refresh = RefreshToken.for_user(user)

        response_data = {
            'success': True,
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
            'user': UserSerializer(user).data
        }

        # Incluir perfil de staff si existe
        if hasattr(user, 'staff_profile'):
            response_data['staff'] = StaffMemberSerializer(user.staff_profile).data

        return Response(response_data)


class LogoutView(APIView):
    """
    POST /auth/logout
    Invalida el refresh token actual.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh_token')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            return Response({'success': True, 'message': 'Sesión cerrada'})
        except Exception:
            return Response({'success': True, 'message': 'Sesión cerrada'})


class PasswordResetRequestView(APIView):
    """
    POST /auth/password/reset-request
    Solicita reset de contrasena por documento.
    Busca el usuario y envia OTP a su WhatsApp registrado.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document_type = serializer.validated_data['document_type']
        document_number = serializer.validated_data['document_number']

        user = None
        phone_number = None

        # Buscar en perfiles de staff
        try:
            staff = StaffMember.objects.select_related('user').get(
                document_type=document_type,
                document_number=document_number
            )
            user = staff.user
            phone_number = user.phone_number if user else None
        except StaffMember.DoesNotExist:
            pass

        # Buscar en perfiles de duenos
        if not user:
            try:
                owner = BusinessOwnerProfile.objects.select_related('user').get(
                    document_type=document_type,
                    document_number=document_number
                )
                user = owner.user
                phone_number = user.phone_number if user else None
            except BusinessOwnerProfile.DoesNotExist:
                pass

        if not user or not phone_number:
            return Response(
                {'success': False, 'error': 'No se encontro una cuenta con ese documento'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Crear sesion OTP
        session, otp_code = OTPService.create_session(phone_number)

        # Enviar OTP usando el proveedor configurado (SMS o WhatsApp)
        otp_sender = OTPProviderService()
        result = otp_sender.send_otp(phone_number, otp_code)

        if not result['success']:
            return Response(
                {
                    'success': False,
                    'error': 'Error al enviar el codigo. Intenta nuevamente.'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        # Ocultar parte del numero para seguridad
        masked_phone = phone_number[:4] + '****' + phone_number[-3:]

        expiry_minutes = getattr(settings, 'OTP_EXPIRY_MINUTES', 5)

        return Response({
            'success': True,
            'message': f'Codigo enviado a {masked_phone}',
            'phone_masked': masked_phone,
            'expires_in': expiry_minutes * 60
        })


class PasswordResetConfirmView(APIView):
    """
    POST /auth/password/reset-confirm
    Verifica OTP y cambia la contrasena.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document_type = serializer.validated_data['document_type']
        document_number = serializer.validated_data['document_number']
        otp_code = serializer.validated_data['otp_code']
        new_password = serializer.validated_data['new_password']

        user = None
        phone_number = None

        # Buscar en perfiles de staff
        try:
            staff = StaffMember.objects.select_related('user').get(
                document_type=document_type,
                document_number=document_number
            )
            user = staff.user
            phone_number = user.phone_number if user else None
        except StaffMember.DoesNotExist:
            pass

        # Buscar en perfiles de duenos
        if not user:
            try:
                owner = BusinessOwnerProfile.objects.select_related('user').get(
                    document_type=document_type,
                    document_number=document_number
                )
                user = owner.user
                phone_number = user.phone_number if user else None
            except BusinessOwnerProfile.DoesNotExist:
                pass

        if not user or not phone_number:
            return Response(
                {'success': False, 'error': 'No se encontro una cuenta con ese documento'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Verificar OTP
        result = OTPService.verify_otp(phone_number, otp_code)

        if not result['success']:
            return Response(
                {'success': False, 'error': result['error']},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cambiar contrasena
        user.set_password(new_password)
        user.save()

        return Response({
            'success': True,
            'message': 'Contrasena actualizada correctamente. Ya puedes iniciar sesion.'
        })
