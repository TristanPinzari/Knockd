import { useAuth0 } from "@auth0/auth0-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AcceptInvite } from "./pages/AcceptInvite";
import { Landing } from "./pages/Landing";
import { TeamMap } from "./pages/TeamMap";
import { Teams } from "./pages/Teams";
import { FullPageSpinner } from "./ui";

export function App() {
  const { isLoading, isAuthenticated } = useAuth0();
  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <Landing />;
  return (
    <Routes>
      <Route path="/" element={<Teams />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/teams/:teamId" element={<TeamMap />} />
      <Route path="/teams/:teamId/maps/:mapId" element={<TeamMap />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
