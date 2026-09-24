import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RootLayout } from "@/layouts/RootLayout";
import { LandingPage } from "@/pages/LandingPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootLayout />}>
          <Route index element={<LandingPage />} />
          {/* Future auth and dashboard routes will be hooked in Phases 5-8 */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}