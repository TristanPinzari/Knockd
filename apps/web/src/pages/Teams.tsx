import { useAuth0 } from "@auth0/auth0-react";
import type { CreateTeamBody, GetMeRes, TeamRes } from "@knockd/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApi } from "../api";
import { Avatar, Logo, Spinner, ThemeToggle } from "../ui";

/** Home: your teams, and making a new one. */
export function Teams() {
  const api = useApi();
  const navigate = useNavigate();
  const { logout } = useAuth0();
  const [me, setMe] = useState<GetMeRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<GetMeRes>("/v1/me")
      .then(setMe)
      .catch((e: Error) => setError(e.message));
  }, [api]);

  const create = async () => {
    setCreating(true);
    try {
      const body: CreateTeamBody = { name: name.trim() };
      const { team } = await api<TeamRes>("/v1/teams", { method: "POST", body: JSON.stringify(body) });
      navigate(`/teams/${team.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="topbar">
        <Logo />
        <div className="grow" />
        {me && (
          <div className="row">
            <span className="small" style={{ fontWeight: 600 }}>
              {me.user.displayName}
            </span>
            <Avatar name={me.user.displayName} />
          </div>
        )}
        <ThemeToggle />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
        >
          Log out
        </button>
      </div>

      <div className="container">
        <h1 style={{ marginBottom: 24 }}>Your teams</h1>
        {error && <p style={{ color: "var(--bad)", marginBottom: 16 }}>{error}</p>}
        {!me && !error && <Spinner />}

        {me && (
          <div className="card" style={{ padding: "8px 20px" }}>
            {me.teams.length === 0 && (
              <p className="muted" style={{ padding: "16px 0" }}>
                You&apos;re not on a team yet. Make one below, or open an invite link from your team.
              </p>
            )}
            {me.teams.map((t) => (
              <Link key={t.id} to={`/teams/${t.id}`} className="list-item">
                <Avatar name={t.name} />
                <div className="grow">
                  <h3 className="ellipsis">{t.name}</h3>
                </div>
                <span className={`chip ${t.role === "owner" ? "chip-accent" : ""}`}>{t.role}</span>
                <span className="muted">›</span>
              </Link>
            ))}
          </div>
        )}

        {me && (
          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <h3 style={{ marginBottom: 12 }}>Start a team</h3>
            <div className="row">
              <input
                className="input"
                placeholder="Team name, e.g. High Five Painting"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && create()}
              />
              <button className="btn btn-primary" disabled={!name.trim() || creating} onClick={create}>
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
