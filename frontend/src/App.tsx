import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// Layouts
import PublicLayout from '@/components/layout/PublicLayout'
import ClientLayout from '@/components/layout/ClientLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'

// Páginas públicas
import Home from '@/pages/public/Home'
import Search from '@/pages/public/Search'
import BusinessPage from '@/pages/public/BusinessPage'
import BookingFlow from '@/pages/public/BookingFlow'
import ReviewPage from '@/pages/public/ReviewPage'

// Páginas de autenticación
import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'
import ForgotPassword from '@/pages/auth/ForgotPassword'

// Páginas de cliente
import MyAppointments from '@/pages/client/MyAppointments'
import Profile from '@/pages/client/Profile'

// Paginas de dashboard
import DashboardHome from '@/pages/dashboard/DashboardHome'
import CalendarView from '@/pages/dashboard/CalendarView'
import QRCodeGenerator from '@/pages/dashboard/QRCodeGenerator'
import Onboarding from '@/pages/dashboard/Onboarding'
import ServicesManagement from '@/pages/dashboard/ServicesManagement'
import StaffManagement from '@/pages/dashboard/StaffManagement'
import AppointmentsList from '@/pages/dashboard/AppointmentsList'
import BranchesManagement from '@/pages/dashboard/BranchesManagement'
import BusinessSettings from '@/pages/dashboard/BusinessSettings'

// Componente de ruta protegida
function ProtectedRoute({
  children,
  allowedRoles,
}: {
  children: React.ReactNode
  allowedRoles?: string[]
}) {
  const { isAuthenticated, user } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <Routes>
      {/* Ruta de reseña con token (pública, sin layout) */}
      <Route path="/review/:token" element={<ReviewPage />} />

      {/* Rutas de autenticación (PRIMERO para evitar conflicto con /:businessSlug) */}
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/register" element={<Register />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />

      {/* Rutas de cliente (protegidas) */}
      <Route
        element={
          <ProtectedRoute allowedRoles={['client']}>
            <ClientLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/mis-citas" element={<MyAppointments />} />
        <Route path="/perfil" element={<Profile />} />
      </Route>

      {/* Rutas de dashboard (protegidas) */}
      <Route
        element={
          <ProtectedRoute
            allowedRoles={['super_admin', 'business_owner', 'branch_manager', 'staff']}
          >
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardHome />} />
        <Route path="/dashboard/onboarding" element={<Onboarding />} />
        <Route path="/dashboard/calendario" element={<CalendarView />} />
        <Route path="/dashboard/citas" element={<AppointmentsList />} />
        <Route path="/dashboard/servicios" element={<ServicesManagement />} />
        <Route path="/dashboard/equipo" element={<StaffManagement />} />
        <Route path="/dashboard/qr" element={<QRCodeGenerator />} />
        <Route path="/dashboard/sucursales" element={<BranchesManagement />} />
        <Route path="/dashboard/configuracion" element={<BusinessSettings />} />
      </Route>

      {/* Rutas públicas (AL FINAL porque /:businessSlug es genérica) */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buscar" element={<Search />} />
        <Route path="/:businessSlug" element={<BusinessPage />} />
        <Route path="/:businessSlug/:branchSlug" element={<BookingFlow />} />
      </Route>

      {/* Ruta 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
