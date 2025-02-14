
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/components/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavBar } from "@/components/NavBar";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AuctionDetail from "./pages/AuctionDetail";
import AuctionManagement from "./pages/AuctionManagement";
import AdminDashboard from "./pages/AdminDashboard";
import PaymentPage from "./pages/PaymentPage";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import UserDashboard from "./pages/UserDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<Index />} />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <UserDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/auctions/:id" 
              element={
                <ProtectedRoute>
                  <AuctionDetail />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/my-auctions" 
              element={
                <ProtectedRoute>
                  <AuctionManagement />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute adminOnly>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/payment/:bidId" 
              element={
                <ProtectedRoute>
                  <PaymentPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/payment/success" 
              element={
                <ProtectedRoute>
                  <PaymentSuccess />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/payment/cancel" 
              element={
                <ProtectedRoute>
                  <PaymentCancel />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
