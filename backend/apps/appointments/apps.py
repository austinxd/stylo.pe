"""
Configuración de la app Appointments.
"""
from django.apps import AppConfig


class AppointmentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.appointments'
    verbose_name = 'Citas y Reservas'

    def ready(self):
        """Registra las señales cuando la app está lista."""
        import apps.appointments.signals  # noqa
