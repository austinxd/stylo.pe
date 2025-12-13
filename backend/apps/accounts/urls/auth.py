"""
URLs de autenticación.
"""
from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from apps.accounts.views import (
    CheckPhoneView,
    CheckDocumentView,
    DocumentLoginView,
    WhatsAppStartView,
    WhatsAppVerifyView,
    CompleteRegistrationView,
    PasswordLoginView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    LogoutView
)

urlpatterns = [
    # Login con documento (dueños y profesionales)
    path('document/check', CheckDocumentView.as_view(), name='document-check'),
    path('document/login', DocumentLoginView.as_view(), name='document-login'),

    # WhatsApp OTP (clientes)
    path('whatsapp/check', CheckPhoneView.as_view(), name='whatsapp-check'),
    path('whatsapp/start', WhatsAppStartView.as_view(), name='whatsapp-start'),
    path('whatsapp/verify', WhatsAppVerifyView.as_view(), name='whatsapp-verify'),
    path('whatsapp/complete', CompleteRegistrationView.as_view(), name='whatsapp-complete'),

    # Login con contraseña por teléfono (deprecado)
    path('password/login', PasswordLoginView.as_view(), name='password-login'),

    # Reset de contraseña
    path('password/reset-request', PasswordResetRequestView.as_view(), name='password-reset-request'),
    path('password/reset-confirm', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),

    # JWT
    path('token/refresh', TokenRefreshView.as_view(), name='token-refresh'),
    path('logout', LogoutView.as_view(), name='logout'),
]
