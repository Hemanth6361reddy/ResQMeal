import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RootLayout } from "@/layouts/RootLayout";
import { LandingPage } from "@/pages/LandingPage";
import { LoginPage } from "@/pages/LoginPage";
import { DonorDashboardPage } from "@/pages/donor/DonorDashboardPage";
import { CreateDonationPage } from "@/pages/donor/CreateDonationPage";
import { NGODashboardPage } from "@/pages/ngo/NGODashboardPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<LandingPage />} />
            <Route path="login" element={<LoginPage />} />
            
            {/* Donor Portal Routes */}
            <Route path="donor/dashboard" element={<DonorDashboardPage />} />
            <Route path="donor/create" element={<CreateDonationPage />} />

            {/* NGO Portal Routes */}
            <Route path="ngo/dashboard" element={<NGODashboardPage />} />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}