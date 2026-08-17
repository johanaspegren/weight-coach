import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { HashRouter, Route, Routes } from "react-router-dom";

import { BottomNav } from "./components/BottomNav";
import { Detail } from "./views/Detail";
import { History } from "./views/History";
import { Home } from "./views/Home";
import { Log } from "./views/Log";
import { Settings } from "./views/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/log" element={<Log />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/detail/:date" element={<Detail />} />
          </Routes>
        </main>
        <BottomNav />
      </HashRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#111827",
            color: "#e5e7eb",
            border: "1px solid #1f2937",
            fontSize: 14,
          },
          success: { iconTheme: { primary: "#34d399", secondary: "#111827" } },
          error: { iconTheme: { primary: "#f87171", secondary: "#111827" } },
        }}
      />
    </QueryClientProvider>
  );
}
