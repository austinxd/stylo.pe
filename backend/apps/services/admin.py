"""
Admin para modelos de servicios.
"""
from django.contrib import admin
from .models import ServiceCategory, Service, StaffService


@admin.register(ServiceCategory)
class ServiceCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'order', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name']
    ordering = ['order', 'name']


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ['name', 'branch', 'category', 'duration_minutes', 'price', 'gender', 'is_active', 'is_featured']
    list_filter = ['is_active', 'is_featured', 'branch__business', 'branch', 'category', 'gender']
    search_fields = ['name', 'branch__name', 'branch__business__name']
    ordering = ['branch', 'category__order', 'name']
    autocomplete_fields = ['branch', 'category']


@admin.register(StaffService)
class StaffServiceAdmin(admin.ModelAdmin):
    list_display = ['staff', 'service', 'price', 'duration', 'is_active']
    list_filter = ['is_active', 'staff__branches', 'service__branch']
    search_fields = ['staff__first_name', 'staff__last_name_paterno', 'service__name']
    autocomplete_fields = ['staff', 'service']
