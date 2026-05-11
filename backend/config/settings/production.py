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
SECURE_REFERRER_POLICY = 'same-origin'

# HSTS: forzar HTTPS por 1 año. Subdominios incluidos.
# IMPORTANTE: Sólo activar cuando estés seguro de que TODOS los subdominios
# soportan HTTPS, porque preload no se puede revertir fácilmente.
SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Proxy SSL header (necesario si está detrás de nginx/load balancer)
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

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
    'loggers': {
        'apps.accounts.services.whatsapp_service': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}
