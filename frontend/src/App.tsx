import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import ErrorBoundary from '@/components/feedback/ErrorBoundary'
import PageLoader from '@/components/feedback/PageLoader'

// Layouts (eager: pequeños y siempre montados)
import PublicLayout from '@/components/layout/PublicLayout'
import ClientLayout from '@/components/layout/ClientLayout'
import DashboardLayout from '@/components/layout/DashboardLayout'

// Páginas públicas (lazy: separadas en chunks)
const Home = lazy(() => import('@/pages/public/Home'))
const Search = lazy(() => import('@/pages/public/Search'))
const BusinessPage = lazy(() => import('@/pages/public/BusinessPage'))
const BookingFlow = lazy(() => import('@/pages/public/BookingFlow'))
const ReviewPage = lazy(() => import('@/pages/public/ReviewPage'))

// Autenticación
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'))

// Cliente
const MyAppointments = lazy(() => import('@/pages/client/MyAppointments'))
const Profile = lazy(() => import('@/pages/client/Profile'))

// Dashboard (chunk separado: sólo usuarios B2B lo necesitan)
const DashboardHome = lazy(() => import('@/pages/dashboard/DashboardHome'))
const AppointmentsPage = lazy(() => import('@/pages/dashboard/AppointmentsPage'))
const QRCodeGenerator = lazy(() => import('@/pages/dashboard/QRCodeGenerator'))
const OnboardingWizard = lazy(() => import('@/pages/dashboard/OnboardingWizard'))
const ServicesManagement = lazy(() => import('@/pages/dashboard/ServicesManagement'))
const StaffManagement = lazy(() => import('@/pages/dashboard/StaffManagement'))
const BranchesManagement = lazy(() => import('@/pages/dashboard/BranchesManagement'))
const BusinessSettings = lazy(() => import('@/pages/dashboard/BusinessSettings'))
const Subscription = lazy(() => import('@/pages/dashboard/Subscription'))

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
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Reseña con token (pública, sin layout) */}
          <Route path="/review/:token" element={<ReviewPage />} />

          {/* Autenticación */}
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/register" element={<Register />} />
          <Route path="/auth/forgot-password" element={<ForgotPassword />} />

          {/* Cliente (protegidas) */}
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

          {/* Dashboard (protegidas) */}
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
            <Route path="/dashboard/onboarding" element={<OnboardingWizard />} />
            <Route path="/dashboard/citas" element={<AppointmentsPage />} />
            <Route path="/dashboard/servicios" element={<ServicesManagement />} />
            <Route path="/dashboard/equipo" element={<StaffManagement />} />
            <Route path="/dashboard/qr" element={<QRCodeGenerator />} />
            <Route path="/dashboard/sucursales" element={<BranchesManagement />} />
            <Route path="/dashboard/configuracion" element={<BusinessSettings />} />
            <Route path="/dashboard/suscripcion" element={<Subscription />} />
          </Route>

          {/* Públicas (al final por /:businessSlug) */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/buscar" element={<Search />} />
            <Route path="/:businessSlug" element={<BusinessPage />} />
            <Route path="/:businessSlug/:branchSlug" element={<BookingFlow />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App
