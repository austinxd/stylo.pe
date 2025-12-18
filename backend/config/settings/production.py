"""
Configuración de producción para Stylo.
"""
from .base import *
import sentry_sdk

DEBUG = False

# Media files - URL absoluta para que el frontend pueda acceder
MEDIA_URL = 'https://api.stylo.pe/media/'

# Seguridad
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = [
    'https://stylo.pe',
    'https://www.stylo.pe',
    'https://api.stylo.pe',
]

# Sentry
SENTRY_DSN = config('SENTRY_DSN', default='')
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        traces_sample_rate=0.1,
    )

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}
