"""
Admin para modelos de scheduling.
"""
from django.contrib import admin
from .models import BranchSchedule, WorkSchedule, BlockedTime, SpecialDate


@admin.register(BranchSchedule)
class BranchScheduleAdmin(admin.ModelAdmin):
    list_display = ['branch', 'day_of_week', 'opening_time', 'closing_time', 'is_open']
    list_filter = ['is_open', 'branch', 'day_of_week']
    ordering = ['branch', 'day_of_week']


@admin.register(WorkSchedule)
class WorkScheduleAdmin(admin.ModelAdmin):
    list_display = ['staff', 'branch', 'day_of_week', 'start_time', 'end_time', 'is_working']
    list_filter = ['is_working', 'branch', 'day_of_week']
    ordering = ['staff', 'branch', 'day_of_week']


@admin.register(BlockedTime)
class BlockedTimeAdmin(admin.ModelAdmin):
    list_display = ['staff', 'block_type', 'start_datetime', 'end_datetime', 'reason']
    list_filter = ['block_type', 'staff__branches', 'created_at']
    search_fields = ['staff__first_name', 'staff__last_name_paterno', 'reason']
    ordering = ['-start_datetime']


@admin.register(SpecialDate)
class SpecialDateAdmin(admin.ModelAdmin):
    list_display = ['branch', 'date', 'date_type', 'name']
    list_filter = ['date_type', 'branch']
    ordering = ['date']
