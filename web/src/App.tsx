import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { HashRouter, Route, Routes } from "react-router-dom";

import { BottomNav } from "./components/BottomNav";
import { SkeletonCard } from "./components/Skeleton";
import { Log } from "./views/Log";
import { Settings } from "./views/Settings";

// Recharts is heavy (~500KB) — only load it when the user actually visits a
// route that uses it. Everything else stays in the main bundle.
const Home = lazy(() => import("./views/Home").then((m) => ({ default: m.Home })));
const History = lazy(() => import("./views/History").then((m) => ({ default: m.History })));
const Detail = lazy(() => import("./views/Detail").then((m) => ({ default: m.Detail })));

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
          <Suspense fallback={<SkeletonCard />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/log" element={<Log />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/detail/:date" element={<Detail />} />
            </Routes>
          </Suspense>
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
