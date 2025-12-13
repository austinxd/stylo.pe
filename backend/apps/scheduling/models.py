"""
Modelos de horarios y disponibilidad.
"""
from django.db import models
from apps.core.models import Branch
from apps.accounts.models import StaffMember


class BranchSchedule(models.Model):
    """
    Horario de operación de una sucursal.
    Define los días y horas que la sucursal está abierta.
    """
    DAYS_OF_WEEK = [
        (0, 'Lunes'),
        (1, 'Martes'),
        (2, 'Miércoles'),
        (3, 'Jueves'),
        (4, 'Viernes'),
        (5, 'Sábado'),
        (6, 'Domingo'),
    ]

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='schedules',
        verbose_name='Sucursal'
    )
    day_of_week = models.PositiveSmallIntegerField('Día', choices=DAYS_OF_WEEK)
    opening_time = models.TimeField('Hora de apertura')
    closing_time = models.TimeField('Hora de cierre')
    is_open = models.BooleanField('Abierto', default=True)

    class Meta:
        verbose_name = 'Horario de Sucursal'
        verbose_name_plural = 'Horarios de Sucursales'
        unique_together = ['branch', 'day_of_week']
        ordering = ['branch', 'day_of_week']

    def __str__(self):
        day_name = dict(self.DAYS_OF_WEEK)[self.day_of_week]
        if self.is_open:
            return f'{self.branch.name} - {day_name}: {self.opening_time} - {self.closing_time}'
        return f'{self.branch.name} - {day_name}: Cerrado'


class WorkSchedule(models.Model):
    """
    Horario de trabajo de un profesional en una sucursal específica.
    Define cuándo está disponible para atender en esa sucursal.

    Un profesional puede tener horarios en múltiples sucursales,
    pero los horarios del mismo día no deben cruzarse entre sucursales.
    """
    DAYS_OF_WEEK = [
        (0, 'Lunes'),
        (1, 'Martes'),
        (2, 'Miércoles'),
        (3, 'Jueves'),
        (4, 'Viernes'),
        (5, 'Sábado'),
        (6, 'Domingo'),
    ]

    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='work_schedules',
        verbose_name='Profesional'
    )
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='staff_schedules',
        verbose_name='Sucursal'
    )
    day_of_week = models.PositiveSmallIntegerField('Día', choices=DAYS_OF_WEEK)
    start_time = models.TimeField('Hora de inicio')
    end_time = models.TimeField('Hora de fin')
    is_working = models.BooleanField('Trabaja', default=True)

    class Meta:
        verbose_name = 'Horario de Trabajo'
        verbose_name_plural = 'Horarios de Trabajo'
        unique_together = ['staff', 'branch', 'day_of_week']
        ordering = ['staff', 'branch', 'day_of_week']

    def __str__(self):
        day_name = dict(self.DAYS_OF_WEEK)[self.day_of_week]
        if self.is_working:
            return f'{self.staff.full_name} - {self.branch.name} - {day_name}: {self.start_time} - {self.end_time}'
        return f'{self.staff.full_name} - {self.branch.name} - {day_name}: No trabaja'

    def clean(self):
        """Valida que los horarios no se crucen con otras sucursales."""
        from django.core.exceptions import ValidationError

        if not self.is_working:
            return

        # Buscar otros horarios del mismo staff en el mismo día pero otras sucursales
        overlapping = WorkSchedule.objects.filter(
            staff=self.staff,
            day_of_week=self.day_of_week,
            is_working=True
        ).exclude(branch=self.branch)

        if self.pk:
            overlapping = overlapping.exclude(pk=self.pk)

        for schedule in overlapping:
            # Verificar si hay cruce de horarios
            if self._times_overlap(
                self.start_time, self.end_time,
                schedule.start_time, schedule.end_time
            ):
                day_name = dict(self.DAYS_OF_WEEK)[self.day_of_week]
                raise ValidationError(
                    f'El horario de {day_name} ({self.start_time}-{self.end_time}) '
                    f'se cruza con el horario en {schedule.branch.name} '
                    f'({schedule.start_time}-{schedule.end_time})'
                )

    def _times_overlap(self, start1, end1, start2, end2):
        """Verifica si dos rangos de tiempo se cruzan."""
        return start1 < end2 and start2 < end1

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @classmethod
    def validate_schedules_no_overlap(cls, staff, schedules_data):
        """
        Valida que un conjunto de horarios no se crucen entre sí.
        Útil para validar antes de guardar múltiples horarios.

        schedules_data: lista de dicts con {branch_id, day_of_week, start_time, end_time, is_working}
        """
        from django.core.exceptions import ValidationError

        # Agrupar por día
        by_day = {}
        for s in schedules_data:
            if not s.get('is_working', True):
                continue
            day = s['day_of_week']
            if day not in by_day:
                by_day[day] = []
            by_day[day].append(s)

        errors = []
        days = dict(cls.DAYS_OF_WEEK)

        for day, day_schedules in by_day.items():
            # Ordenar por hora de inicio
            sorted_schedules = sorted(day_schedules, key=lambda x: x['start_time'])

            for i in range(len(sorted_schedules) - 1):
                current = sorted_schedules[i]
                next_s = sorted_schedules[i + 1]

                # Si el fin del actual es mayor que el inicio del siguiente, hay cruce
                if current['end_time'] > next_s['start_time']:
                    day_name = days[day]
                    errors.append(
                        f'{day_name}: horario {current["start_time"]}-{current["end_time"]} '
                        f'se cruza con {next_s["start_time"]}-{next_s["end_time"]}'
                    )

        if errors:
            raise ValidationError({'schedules': errors})


class BlockedTime(models.Model):
    """
    Bloqueo de tiempo de un profesional.
    Para vacaciones, descansos, capacitaciones, etc.
    """
    BLOCK_TYPES = [
        ('vacation', 'Vacaciones'),
        ('break', 'Descanso'),
        ('training', 'Capacitación'),
        ('personal', 'Personal'),
        ('other', 'Otro'),
    ]

    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='blocked_times',
        verbose_name='Profesional'
    )
    block_type = models.CharField(
        'Tipo de bloqueo',
        max_length=20,
        choices=BLOCK_TYPES,
        default='other'
    )
    start_datetime = models.DateTimeField('Inicio')
    end_datetime = models.DateTimeField('Fin')
    reason = models.CharField('Motivo', max_length=200, blank=True)
    is_all_day = models.BooleanField('Todo el día', default=False)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)

    class Meta:
        verbose_name = 'Tiempo Bloqueado'
        verbose_name_plural = 'Tiempos Bloqueados'
        ordering = ['start_datetime']

    def __str__(self):
        return f'{self.staff.full_name} - {self.get_block_type_display()}: {self.start_datetime}'


class SpecialDate(models.Model):
    """
    Fechas especiales para una sucursal.
    Feriados, días especiales con horario diferente, etc.
    """
    DATE_TYPES = [
        ('holiday', 'Feriado'),
        ('special_hours', 'Horario especial'),
        ('closed', 'Cerrado'),
    ]

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='special_dates',
        verbose_name='Sucursal'
    )
    date = models.DateField('Fecha')
    date_type = models.CharField('Tipo', max_length=20, choices=DATE_TYPES)
    name = models.CharField('Nombre', max_length=100)

    # Horario especial (si aplica)
    opening_time = models.TimeField('Hora de apertura', null=True, blank=True)
    closing_time = models.TimeField('Hora de cierre', null=True, blank=True)

    class Meta:
        verbose_name = 'Fecha Especial'
        verbose_name_plural = 'Fechas Especiales'
        unique_together = ['branch', 'date']
        ordering = ['date']

    def __str__(self):
        return f'{self.branch.name} - {self.date}: {self.name}'
