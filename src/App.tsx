import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RoleRoute from "@/components/auth/RoleRoute";
import VendorStatusGate from "@/components/auth/VendorStatusGate";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CartPage from "@/pages/CartPage";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/NotFound";
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const OtpVerifyPage = lazy(() => import("@/pages/auth/OtpVerifyPage"));
const AccountSecurityPage = lazy(() => import("@/pages/account/AccountSecurityPage"));

import { SidebarProvider } from "@/contexts/SidebarContext";
import ShopSidebar from "@/components/navigation/ShopSidebar";
import PageSkeleton from "@/components/ui/PageSkeleton";
import { LocationProvider } from "@/contexts/LocationContext";

// Lazy-loaded routes (code-splitting): trims the initial bundle. These are
// behind auth/role guards so most users never download them.
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));
const PaymentsListPage = lazy(() => import("@/pages/PaymentsListPage"));
const PaymentDetailPage = lazy(() => import("@/pages/PaymentDetailPage"));
const PaymentSuccessPage = lazy(() => import("@/pages/PaymentSuccessPage"));
const PaymentFailedPage = lazy(() => import("@/pages/PaymentFailedPage"));
const VendorOnboardingPage = lazy(() => import("@/pages/VendorOnboardingPage"));
const VendorKYCPage = lazy(() => import("@/pages/vendor/VendorKYCPage"));
const VendorSettings = lazy(() => import("@/pages/vendor/VendorSettings"));

const VendorDashboard = lazy(() => import("@/pages/vendor/VendorDashboard"));
const VendorOverview = lazy(() => import("@/pages/vendor/VendorOverview"));
const VendorProducts = lazy(() => import("@/pages/vendor/VendorProducts"));
const VendorCampaigns = lazy(() => import("@/pages/vendor/VendorCampaigns"));
const VendorAnalytics = lazy(() => import("@/pages/vendor/VendorAnalytics"));
const VendorPayments = lazy(() => import("@/pages/vendor/VendorPayments"));
const VendorOrders = lazy(() => import("@/pages/vendor/VendorOrders"));
const VendorNotifications = lazy(() => import("@/pages/vendor/VendorNotifications"));

const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminOverview = lazy(() => import("@/pages/admin/AdminOverview"));
const AdminVendors = lazy(() => import("@/pages/admin/AdminVendors"));
const AdminCampaigns = lazy(() => import("@/pages/admin/AdminCampaigns"));
const AdminPayouts = lazy(() => import("@/pages/admin/AdminPayouts"));
const AdminPlacements = lazy(() => import("@/pages/admin/AdminPlacements"));
const AdminReviews = lazy(() => import("@/pages/admin/AdminReviews"));
const AdminPricing = lazy(() => import("@/pages/admin/AdminPricing"));
const AdminSecurity = lazy(() => import("@/pages/admin/AdminSecurity"));
const AdminPayments = lazy(() => import("@/pages/admin/AdminPayments"));
const AdminSettings = lazy(() => import("@/pages/admin/AdminSettings"));
const AdminMenu = lazy(() => import("@/pages/admin/AdminMenu"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
          <CurrencyProvider>
          <LocationProvider>
          <CartProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SidebarProvider>
              <ShopSidebar />
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1">
                  <Suspense fallback={<PageSkeleton />}>
                    <Routes>
                      {/* Public routes */}
                      <Route path="/" element={<HomePage />} />
                      <Route path="/search" element={<SearchPage />} />
                      <Route path="/product/:slug" element={<ProductDetailPage />} />
                      <Route path="/cart" element={<CartPage />} />
                      <Route path="/auth" element={<AuthPage />} />
                      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
                      <Route path="/auth/verify-otp" element={<OtpVerifyPage />} />

                      {/* Authenticated routes */}
                      <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                      <Route path="/account/security" element={<ProtectedRoute><AccountSecurityPage /></ProtectedRoute>} />
                      <Route path="/payments" element={<ProtectedRoute><PaymentsListPage /></ProtectedRoute>} />
                      <Route path="/payments/:paymentId" element={<ProtectedRoute><PaymentDetailPage /></ProtectedRoute>} />
                      <Route path="/payment/success" element={<ProtectedRoute><PaymentSuccessPage /></ProtectedRoute>} />
                      <Route path="/payment/failed" element={<ProtectedRoute><PaymentFailedPage /></ProtectedRoute>} />
                      <Route path="/vendor/apply" element={<ProtectedRoute><VendorOnboardingPage /></ProtectedRoute>} />
                      <Route path="/vendor/apply/kyc" element={<ProtectedRoute><VendorKYCPage /></ProtectedRoute>} />

                      {/* Vendor routes */}
                      <Route path="/vendor" element={<RoleRoute requiredRole="vendor"><VendorStatusGate><VendorDashboard /></VendorStatusGate></RoleRoute>}>
                        <Route index element={<VendorOverview />} />
                        <Route path="products" element={<VendorProducts />} />
                        <Route path="orders" element={<VendorOrders />} />
                        <Route path="campaigns" element={<VendorCampaigns />} />
                        <Route path="analytics" element={<VendorAnalytics />} />
                        <Route path="payments" element={<VendorPayments />} />
                        <Route path="notifications" element={<VendorNotifications />} />
                        <Route path="settings" element={<VendorSettings />} />
                      </Route>

                      {/* Admin routes */}
                      <Route path="/admin" element={<RoleRoute requiredRole="admin"><AdminDashboard /></RoleRoute>}>
                        <Route index element={<AdminOverview />} />
                        <Route path="vendors" element={<AdminVendors />} />
                        <Route path="campaigns" element={<AdminCampaigns />} />
                        <Route path="placements" element={<AdminPlacements />} />
                        <Route path="payouts" element={<AdminPayouts />} />
                        <Route path="reviews" element={<AdminReviews />} />
                        <Route path="pricing" element={<AdminPricing />} />
                        <Route path="security" element={<AdminSecurity />} />
                        <Route path="payments" element={<AdminPayments />} />
                        <Route path="settings" element={<AdminSettings />} />
                        <Route path="menu" element={<AdminMenu />} />
                      </Route>

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </main>
                <Footer />
                
              </div>
              </SidebarProvider>
            </BrowserRouter>
          </CartProvider>
          </LocationProvider>
          </CurrencyProvider>
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;
