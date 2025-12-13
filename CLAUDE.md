# CLAUDE.md

Este archivo proporciona guía a Claude Code (claude.ai/code) para trabajar con el código en este repositorio.

## Descripción del Proyecto

**Stylo** es una plataforma SaaS de reservas para negocios de servicios (salones de belleza, barberías, spas, etc.). Permite a los clientes reservar citas vía WhatsApp OTP y a los negocios gestionar sus sucursales, profesionales y servicios.

## Arquitectura

### Stack Tecnológico
- **Backend**: Django 5.x + Django REST Framework + MySQL + Redis + Celery
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + React Query + Zustand

### Estructura Multi-Tenant
```
SaaS Platform (Super Admin)
    └── Business (Negocio)
            └── Branch (Sucursal)
                    ├── Staff (Profesionales)
                    ├── Services (Servicios)
                    └── Appointments (Citas)
```

### Roles de Usuario
1. `super_admin` - Administrador de la plataforma SaaS
2. `business_owner` - Dueño de negocio (gestiona todas sus sucursales)
3. `branch_manager` - Administrador de sucursal específica
4. `staff` - Profesional (futuro: gestiona su calendario)
5. `client` - Cliente final (reserva citas)

## Comandos de Desarrollo

### Backend (Django)
```bash
cd backend

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Instalar dependencias
pip install -r requirements/development.txt

# Variables de entorno
cp ../.env.example .env

# Migraciones
python manage.py makemigrations
python manage.py migrate

# Crear superusuario
python manage.py createsuperuser

# Ejecutar servidor
python manage.py runserver

# Ejecutar tests
pytest

# Celery (para recordatorios)
celery -A config worker -l info
celery -A config beat -l info
```

### Frontend (React)
```bash
cd frontend

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build producción
npm run build

# Lint
npm run lint
```

## Estructura del Proyecto

### Backend (`/backend`)
```
backend/
├── config/                 # Configuración Django
│   ├── settings/
│   │   ├── base.py        # Configuración base
│   │   ├── development.py # Desarrollo
│   │   └── production.py  # Producción
│   ├── urls.py            # URLs principales
│   └── celery.py          # Configuración Celery
├── apps/
│   ├── core/              # Business, Branch
│   ├── accounts/          # User, Client, StaffMember, LoginSession
│   │   └── services/      # OTPService, WhatsAppService
│   ├── services/          # ServiceCategory, Service, StaffService
│   ├── scheduling/        # WorkSchedule, BlockedTime, AvailabilityService
│   ├── appointments/      # Appointment, AppointmentReminder
│   └── dashboard/         # Views del panel administrativo
├── common/                # Utilidades compartidas
│   ├── permissions.py     # Permisos personalizados
│   ├── pagination.py      # Paginación
│   └── exceptions.py      # Manejo de errores
└── requirements/          # Dependencias
```

### Frontend (`/frontend`)
```
frontend/src/
├── api/                   # Llamadas a la API
│   ├── client.ts          # Axios instance con interceptors
│   ├── auth.ts            # Endpoints de autenticación
│   ├── appointments.ts    # Endpoints de citas
│   └── services.ts        # Endpoints de negocios/servicios
├── components/
│   └── layout/            # Layouts (Public, Client, Dashboard)
├── features/              # Componentes por feature
├── hooks/                 # Custom hooks
├── pages/                 # Páginas de la app
│   ├── auth/              # Login, Register
│   ├── public/            # Home, BusinessPage, BookingFlow
│   ├── client/            # MyAppointments, Profile
│   └── dashboard/         # DashboardHome, CalendarView
├── store/
│   └── authStore.ts       # Estado global (Zustand)
└── types/
    └── index.ts           # Tipos TypeScript
```

## Endpoints API

### Autenticación (`/api/v1/auth/`)
- `POST /whatsapp/start` - Envía OTP por WhatsApp
- `POST /whatsapp/verify` - Verifica OTP (retorna token de registro o JWT)
- `POST /whatsapp/complete` - Completa registro con datos personales
- `POST /token/refresh` - Refresca JWT
- `POST /logout` - Cierra sesión

### Clientes (`/api/v1/clients/`)
- `GET /me` - Perfil del cliente
- `PATCH /me` - Actualizar perfil

### Negocios (`/api/v1/businesses/`)
- `GET /` - Lista negocios
- `GET /{slug}` - Detalle negocio
- `GET /{slug}/branches/` - Sucursales

### Disponibilidad (`/api/v1/branches/`)
- `GET /{id}/availability` - Slots disponibles para una fecha
- `GET /{id}/availability/month` - Resumen del mes

### Citas (`/api/v1/appointments/`)
- `GET /` - Mis citas
- `GET /upcoming/` - Citas futuras
- `GET /history/` - Historial
- `POST /` - Crear cita
- `POST /{id}/cancel/` - Cancelar cita

### Dashboard (`/api/v1/dashboard/`)
- `GET /summary` - Resumen general
- `GET /branches/{id}/calendar/` - Calendario de citas
- `PATCH /appointments/{id}/update_status/` - Actualizar estado

## Flujo de Autenticación WhatsApp

1. Cliente envía número → `POST /auth/whatsapp/start`
2. Backend genera OTP, envía por WhatsApp, crea `LoginSession`
3. Cliente ingresa OTP → `POST /auth/whatsapp/verify`
4. Si usuario existe → JWT directo
5. Si no existe → `registration_token` para completar datos
6. Cliente completa datos → `POST /auth/whatsapp/complete` → JWT

## Variables de Entorno

Ver `.env.example` para todas las variables. Las principales:

```env
# Django
SECRET_KEY=...
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# MySQL
DB_NAME=backend_stylo
DB_USER=root
DB_PASSWORD=leonel123
DB_HOST=localhost

# WhatsApp (mock en desarrollo)
WHATSAPP_PROVIDER=mock

# Frontend
VITE_API_URL=http://localhost:8000/api/v1
```

## Convenciones de Código

### Backend
- Modelos con campos en español (`first_name`, `last_name_paterno`)
- Serializers por modelo con versiones List/Detail
- Permisos en `common/permissions.py`
- Servicios de negocio en carpeta `services/` de cada app

### Frontend
- Componentes funcionales con TypeScript
- React Query para estado del servidor
- Zustand para estado global (auth)
- TailwindCSS para estilos

## Notas para Desarrollo

- El proveedor de WhatsApp está en modo `mock` en desarrollo (muestra OTP en consola)
- Las migraciones de Django deben ejecutarse tras cambios en modelos
- El frontend usa proxy en Vite para evitar CORS en desarrollo
- Celery requiere Redis corriendo para los recordatorios
