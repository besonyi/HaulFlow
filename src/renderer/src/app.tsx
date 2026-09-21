import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { DriversPage } from "@/pages/drivers-page";
import { LoadBoardsPage } from "@/pages/load-boards-page";
import { LoadsPage } from "@/pages/loads-page";
import { RoutesPage } from "@/pages/routes-page";
import { AlertsPage } from "@/pages/alerts-page";
import { SearchPage } from "@/pages/search-page";
import { MyLoadsPage } from "@/pages/my-loads-page";
import { LoadWorkspaceProvider } from "@/components/workspace/load-workspace";

export function App(): JSX.Element {
  return (
    <HashRouter>
      <LoadWorkspaceProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/search" replace />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/planner" element={<RoutesPage />} />
          <Route path="/my-loads" element={<MyLoadsPage />} />
          <Route path="/sessions" element={<LoadBoardsPage />} />
          <Route path="/loads" element={<LoadsPage />} />
          <Route path="/load-boards" element={<LoadBoardsPage />} />
          <Route path="/drivers" element={<DriversPage />} />
          <Route path="/routes" element={<RoutesPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      </LoadWorkspaceProvider>
    </HashRouter>
  );
}
