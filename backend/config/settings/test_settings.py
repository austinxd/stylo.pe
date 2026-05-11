"""Settings minimal para correr tests con SQLite en memoria."""
from config.settings.base import *  # noqa

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }
}

# Cache local (no Redis para tests)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'test',
    }
}

# Disable migration madness — usa structure directa del modelo
class DisableMigrations:
    def __contains__(self, item): return True
    def __getitem__(self, item): return None
MIGRATION_MODULES = DisableMigrations()

# Tests no necesitan Celery beat ni emails
CELERY_TASK_ALWAYS_EAGER = True
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']  # rápido para tests

# Throttling: subir todos los rates a un valor altísimo en tests para que
# nunca se gatille (la cache se comparte entre tests del mismo proceso).
# Mantener las keys porque las actions usan scopes específicos que el
# framework requiere encontrar en THROTTLE_RATES.
_HIGH_RATE = '1000000/min'
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_THROTTLE_CLASSES': [],
    'DEFAULT_THROTTLE_RATES': {
        scope: _HIGH_RATE
        for scope in REST_FRAMEWORK['DEFAULT_THROTTLE_RATES']
    },
}
