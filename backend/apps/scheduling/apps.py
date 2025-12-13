"""
Configuración de la app Scheduling.
"""
from django.apps import AppConfig


class SchedulingConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.scheduling'
    verbose_name = 'Horarios y Disponibilidad'
