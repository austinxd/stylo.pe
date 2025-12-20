"""
Configuración del proyecto Stylo.
"""
try:
    from .celery import app as celery_app
    __all__ = ('celery_app',)
except ImportError:
    # Celery no está instalado - la app puede funcionar sin él
    celery_app = None
    __all__ = ()
