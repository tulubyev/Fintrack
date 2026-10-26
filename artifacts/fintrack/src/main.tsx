import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
// шрифт Onest с нашего сервера, без запросов к Google Fonts (E1.8-T8)
import "@fontsource-variable/onest";
import "./index.css";
import { installSessionRefresh } from "./lib/sessionRefresh";
import { initAnalytics } from "./lib/analytics";
import { installNetworkStatus } from "./lib/network";
import { ThemeProvider } from "./lib/theme";

installSessionRefresh();
initAnalytics();
installNetworkStatus();

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster />
    </QueryClientProvider>
  </ThemeProvider>
);
