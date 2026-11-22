import type { LayoutChangeEvent } from "react-native";
import { useCrewStore } from "@/realtime/stores/crewStore";
import { useActiveSession } from "@/session";
import { SuggestPanel } from "@/ui/plan";
import { useSuggestStore } from "./suggestStore";

interface Props {
  /** Back to the planning tools. */
  readonly onBack: () => void;
  /** The chosen plan was saved to the shared plan. */
  readonly onApplied: () => void;
  readonly onLayout?: (e: LayoutChangeEvent) => void;
}

/** The Suggest panel wired to the Suggest store and the active session. */
export function SuggestPanelContainer({ onBack, onApplied, onLayout }: Props) {
  const active = useActiveSession((s) => s.active);
  const crew = useCrewStore((s) => s.members);
  const s = useSuggestStore();
  if (!active) return null;

  return (
    <SuggestPanel
      brush={s.brush}
      selectedCount={s.selected.size}
      hasMeet={s.meet !== null}
      options={s.options}
      chosen={s.chosen}
      unrouted={s.unrouted}
      swapping={s.swapping}
      busy={s.busy}
      crew={crew}
      nowMs={s.plannedAtMs}
      onBrush={s.setBrush}
      onClear={s.clearSelection}
      onSuggest={() => void s.run(active.sessionId, active.token)}
      onChoose={s.choose}
      onTapMember={s.tapMember}
      onEdit={s.edit}
      onApply={() =>
        void s.apply(active.memberId).then((ok) => {
          if (ok) onApplied();
        })
      }
      onBack={onBack}
      onLayout={onLayout}
    />
  );
}
