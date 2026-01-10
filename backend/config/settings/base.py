"""
Configuración base de Django para Stylo.
"""
from pathlib import Path
from datetime import timedelta
from decouple import config
import pymysql

pymysql.install_as_MySQLdb()

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = config('SECRET_KEY', default='django-insecure-cambiar-en-produccion')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=lambda v: [s.strip() for s in v.split(',')])

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
]

LOCAL_APPS = [
    'apps.core',
    'apps.accounts',
    'apps.services',
    'apps.scheduling',
    'apps.appointments',
    'apps.dashboard',
    'apps.subscriptions',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': config('DB_NAME', default='backend_stylo'),
        'USER': config('DB_USER', default='root'),
        'PASSWORD': config('DB_PASSWORD', default='leonel123'),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='3306'),
        'OPTIONS': {
            'charset': 'utf8mb4',
        },
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Internationalization
LANGUAGE_CODE = 'es-pe'
TIME_ZONE = 'America/Lima'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'common.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'EXCEPTION_HANDLER': 'common.exceptions.custom_exception_handler',
}

# JWT Configuration
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# CORS
CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:5173,http://127.0.0.1:5173',
    cast=lambda v: [s.strip() for s in v.split(',')]
)

# Celery Configuration
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# Celery Beat Schedule (tareas programadas)
# Nota: En producción usamos cron jobs en lugar de Celery Beat
try:
    from celery.schedules import crontab
    CELERY_BEAT_SCHEDULE = {
        'check-expired-trials': {
            'task': 'subscriptions.check_expired_trials',
            'schedule': crontab(hour=0, minute=5),  # 00:05 AM diario
        },
        'generate-monthly-invoices': {
            'task': 'subscriptions.generate_monthly_invoices',
            'schedule': crontab(hour=1, minute=0, day_of_month=1),  # 01:00 AM día 1 del mes
        },
        'process-pending-payments': {
            'task': 'subscriptions.process_pending_payments',
            'schedule': crontab(hour=9, minute=0),  # 09:00 AM diario
        },
        'send-payment-reminders': {
            'task': 'subscriptions.send_payment_reminders',
            'schedule': crontab(hour=10, minute=0),  # 10:00 AM diario
        },
        'suspend-unpaid-subscriptions': {
            'task': 'subscriptions.suspend_unpaid_subscriptions',
            'schedule': crontab(hour=23, minute=0),  # 11:00 PM diario
        },
    }
except ImportError:
    # Celery no está instalado - usar cron jobs en su lugar
    CELERY_BEAT_SCHEDULE = {}

# Culqi Configuration (Pasarela de pagos)
CULQI_PUBLIC_KEY = config('CULQI_PUBLIC_KEY', default='')
CULQI_SECRET_KEY = config('CULQI_SECRET_KEY', default='')

# Subscription Configuration
# Permitir activación manual de suscripciones (sin pago real)
# Útil para desarrollo/testing. Desactivar en producción.
SUBSCRIPTION_ALLOW_MANUAL_ACTIVATION = config(
    'SUBSCRIPTION_ALLOW_MANUAL_ACTIVATION',
    default=True,
    cast=bool
)

# OTP Configuration
OTP_LENGTH = 6
OTP_EXPIRY_MINUTES = 5
REGISTRATION_TOKEN_EXPIRY_MINUTES = 15

# OTP Provider Configuration
OTP_PROVIDER = config('OTP_PROVIDER', default='mock')  # mock, twilio, whatsapp

# Twilio Verify Configuration (cuando OTP_PROVIDER=twilio)
TWILIO_VERIFY_SERVICE_SID = config('TWILIO_VERIFY_SERVICE_SID', default='')  # VA...

# WhatsApp Configuration (abstracto para diferentes proveedores)
WHATSAPP_PROVIDER = config('WHATSAPP_PROVIDER', default='mock')  # mock, twilio, meta

# Twilio Configuration
TWILIO_ACCOUNT_SID = config('TWILIO_ACCOUNT_SID', default='')
TWILIO_AUTH_TOKEN = config('TWILIO_AUTH_TOKEN', default='')
TWILIO_WHATSAPP_FROM = config('TWILIO_WHATSAPP_FROM', default='')

# Meta WhatsApp Business API Configuration
META_WHATSAPP_TOKEN = config('META_WHATSAPP_TOKEN', default='')
META_WHATSAPP_PHONE_ID = config('META_WHATSAPP_PHONE_ID', default='')
META_WHATSAPP_OTP_TEMPLATE = config('META_WHATSAPP_OTP_TEMPLATE', default='stylo_otp')
META_WHATSAPP_CONFIRMATION_TEMPLATE = config('META_WHATSAPP_CONFIRMATION_TEMPLATE', default='stylo_appointment_confirmation')
META_WHATSAPP_REMINDER_TEMPLATE = config('META_WHATSAPP_REMINDER_TEMPLATE', default='stylo_appointment_reminder')
