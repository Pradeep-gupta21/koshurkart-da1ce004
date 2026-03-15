import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import RoleRoute from "@/components/auth/RoleRoute";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HomePage from "@/pages/HomePage";
import SearchPage from "@/pages/SearchPage";
import ProductDetailPage from "@/pages/ProductDetailPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import AuthPage from "@/pages/AuthPage";
import ProfilePage from "@/pages/ProfilePage";
import VendorApplyPage from "@/pages/VendorApplyPage";
import VendorDashboard from "@/pages/vendor/VendorDashboard";
import VendorOverview from "@/pages/vendor/VendorOverview";
import VendorProducts from "@/pages/vendor/VendorProducts";
import VendorCampaigns from "@/pages/vendor/VendorCampaigns";
import VendorAnalytics from "@/pages/vendor/VendorAnalytics";
import VendorPayments from "@/pages/vendor/VendorPayments";
import VendorOrders from "@/pages/vendor/VendorOrders";
import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminVendors from "@/pages/admin/AdminVendors";
import AdminCampaigns from "@/pages/admin/AdminCampaigns";
import AdminPayouts from "@/pages/admin/AdminPayouts";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <CartProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen flex flex-col">
              <Header />
              <main className="flex-1">
                <Routes>
                  {/* Public routes */}
                  <Route path="/" element={<HomePage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/product/:slug" element={<ProductDetailPage />} />
                  <Route path="/cart" element={<CartPage />} />
                  <Route path="/auth" element={<AuthPage />} />

                  {/* Authenticated routes */}
                  <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                  <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                  <Route path="/vendor/apply" element={<ProtectedRoute><VendorApplyPage /></ProtectedRoute>} />

                  {/* Vendor routes */}
                  <Route path="/vendor" element={<RoleRoute requiredRole="vendor"><VendorDashboard /></RoleRoute>}>
                    <Route index element={<VendorOverview />} />
                    <Route path="products" element={<VendorProducts />} />
                    <Route path="orders" element={<VendorOrders />} />
                    <Route path="campaigns" element={<VendorCampaigns />} />
                    <Route path="analytics" element={<VendorAnalytics />} />
                    <Route path="payments" element={<VendorPayments />} />
                  </Route>

                  {/* Admin routes */}
                  <Route path="/admin" element={<RoleRoute requiredRole="admin"><AdminDashboard /></RoleRoute>}>
                    <Route index element={<AdminOverview />} />
                    <Route path="vendors" element={<AdminVendors />} />
                    <Route path="campaigns" element={<AdminCampaigns />} />
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </main>
              <Footer />
            </div>
          </BrowserRouter>
        </CartProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
