import type { CreateInviteRes, GetMeRes, GetTeamMembersRes, TeamRole } from "@knockd/shared";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../api";
import { Avatar, Modal, shortDate, Spinner } from "../ui";

/**
 * People on the team. The owner invites people, changes roles, removes people and can delete the
 * team; everyone else can leave.
 */
export function MembersDialog({
  teamId,
  teamName,
  myRole,
  onClose,
}: {
  teamId: string;
  teamName: string;
  myRole: TeamRole;
  onClose: () => void;
}) {
  const api = useApi();
  const navigate = useNavigate();
  const [members, setMembers] = useState<GetTeamMembersRes["members"] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [invite, setInvite] = useState<CreateInviteRes | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owner = myRole === "owner";

  const load = useCallback(() => {
    Promise.all([api<GetTeamMembersRes>(`/v1/teams/${teamId}/members`), api<GetMeRes>("/v1/me")])
      .then(([m, me]) => {
        setMembers(m.members);
        setMyId(me.user.id);
      })
      .catch((e: Error) => setError(e.message));
  }, [api, teamId]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const makeInvite = () =>
    act(async () => setInvite(await api<CreateInviteRes>(`/v1/teams/${teamId}/invites`, { method: "POST" })));

  const copy = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal title="People" onClose={onClose}>
      {owner && (
        <div className="stat" style={{ marginBottom: 16 }}>
          <h3 style={{ marginBottom: 6 }}>Invite people</h3>
          <p className="muted small" style={{ marginBottom: 12 }}>
            Anyone with the link joins as a viewer. Links last 7 days.
          </p>
          {!invite && (
            <button className="btn btn-primary btn-sm" onClick={makeInvite}>
              Create invite link
            </button>
          )}
          {invite && (
            <div className="row">
              <input className="input" readOnly value={invite.url} onFocus={(e) => e.target.select()} />
              <button className="btn btn-primary btn-sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: "var(--bad)", marginBottom: 12 }}>{error}</p>}
      {!members && <Spinner />}
      {members?.map((m) => {
        const isMe = m.user.id === myId;
        return (
          <div key={m.user.id} className="list-item">
            <Avatar name={m.user.displayName} />
            <div className="grow">
              <h3 className="ellipsis">
                {m.user.displayName}
                {isMe && <span className="muted"> (you)</span>}
              </h3>
              <p className="muted small">Joined {shortDate(m.joinedAt)}</p>
            </div>
            {owner && m.role !== "owner" ? (
              <select
                className="input"
                style={{ width: 110, height: 36 }}
                value={m.role}
                onChange={(e) =>
                  act(() =>
                    api(`/v1/teams/${teamId}/members/${m.user.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ role: e.target.value }),
                    }),
                  )
                }
              >
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            ) : (
              <span className={`chip ${m.role === "owner" ? "chip-accent" : ""}`}>{m.role}</span>
            )}
            {owner && m.role !== "owner" && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  confirm(`Remove ${m.user.displayName} from the team?`) &&
                  act(() => api(`/v1/teams/${teamId}/members/${m.user.id}`, { method: "DELETE" }))
                }
              >
                Remove
              </button>
            )}
          </div>
        );
      })}

      {owner && (
        <div className="danger-zone">
          <h3>Delete team</h3>
          <p className="muted small">
            Removes the team, its maps, highlights and notes for everyone. The sessions stay on any other teams they
            were added to. This can't be undone.
          </p>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              const typed = prompt(`To delete the team for everyone, type its name: ${teamName}`);
              if (typed === null) return;
              if (typed.trim() !== teamName.trim()) {
                setError("The name didn't match, so the team wasn't deleted.");
                return;
              }
              try {
                await api(`/v1/teams/${teamId}`, { method: "DELETE" });
                navigate("/", { replace: true });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Delete team
          </button>
        </div>
      )}

      {!owner && myId && (
        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: 16 }}
          onClick={async () => {
            if (!confirm("Leave this team? You'll need a new invite to come back.")) return;
            try {
              await api(`/v1/teams/${teamId}/members/${myId}`, { method: "DELETE" });
              navigate("/", { replace: true });
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Leave team
        </button>
      )}
    </Modal>
  );
}
