import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ui/ErrorBoundary";
import "./index.css";
import { bootstrapSupabaseProvider } from "./services/commerce/providers/supabase/bootstrap";

bootstrapSupabaseProvider();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
