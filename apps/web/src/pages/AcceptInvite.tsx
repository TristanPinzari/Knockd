import type { AcceptInviteRes } from "@knockd/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api";
import { Logo, Spinner } from "../ui";

/** /invite/:token, the link from "Invite people". Joins the team (as a viewer) and opens its map. */
export function AcceptInvite() {
  const { token } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !token) return; // once, even in React's dev double-run
    started.current = true;
    api<AcceptInviteRes>(`/v1/invites/${encodeURIComponent(token)}/accept`, { method: "POST" })
      .then(({ team }) => navigate(`/teams/${team.id}`, { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [api, navigate, token]);

  return (
    <div className="page">
      <div className="topbar">
        <Logo />
      </div>
      <div className="container">
        {!error && (
          <div className="row">
            <Spinner />
            <h2>Joining the team…</h2>
          </div>
        )}
        {error && (
          <div className="card" style={{ padding: 24 }}>
            <h2 style={{ marginBottom: 8 }}>This invite didn&apos;t work</h2>
            <p className="muted" style={{ marginBottom: 20 }}>
              {error}. Invite links expire after 7 days; ask your team for a new one.
            </p>
            <Link to="/" className="btn btn-secondary">
              Go to your teams
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
