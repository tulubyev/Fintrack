import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
import "./index.css";
import { installSessionRefresh } from "./lib/sessionRefresh";
import { initAnalytics } from "./lib/analytics";

installSessionRefresh();
initAnalytics();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <Toaster />
  </QueryClientProvider>
);
