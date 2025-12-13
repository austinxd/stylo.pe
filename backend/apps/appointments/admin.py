"""
Admin para modelos de citas.
"""
from django.contrib import admin
from .models import Appointment, AppointmentReminder


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'client', 'service', 'staff', 'branch',
        'start_datetime', 'status', 'price', 'created_at'
    ]
    list_filter = ['status', 'branch__business', 'branch', 'created_at']
    search_fields = [
        'client__first_name', 'client__last_name_paterno',
        'staff__first_name', 'staff__last_name',
        'service__name'
    ]
    date_hierarchy = 'start_datetime'
    ordering = ['-start_datetime']

    fieldsets = (
        ('Información principal', {
            'fields': ('branch', 'client', 'staff', 'service')
        }),
        ('Horario', {
            'fields': ('start_datetime', 'end_datetime')
        }),
        ('Estado', {
            'fields': ('status', 'price')
        }),
        ('Notas', {
            'fields': ('notes', 'staff_notes')
        }),
        ('Cancelación', {
            'fields': ('cancelled_at', 'cancelled_by', 'cancellation_reason'),
            'classes': ('collapse',)
        }),
    )


@admin.register(AppointmentReminder)
class AppointmentReminderAdmin(admin.ModelAdmin):
    list_display = ['appointment', 'reminder_type', 'scheduled_at', 'status', 'sent_at']
    list_filter = ['status', 'reminder_type', 'scheduled_at']
    ordering = ['scheduled_at']
