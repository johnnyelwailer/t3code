/**
 * Planning UX exploration prototypes (draft PR, not mounted in the app). Click-through versions of
 * the role lenses, readiness checklist, team load + sprint lanes, the 3-stop zoom ladder and a
 * static side-agent panel, over a scrambled demo backlog (shape taken from a real sprint pair).
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from "react";

import { Badge } from "~/t3team/components/ui/t3team-badge";
import { Button } from "~/t3team/components/ui/t3team-button";
import type { ProjectTicket } from "~/t3team/t3team-types";

import {
  LENSES,
  PROFILES,
  type LensId,
  type ProfileId,
  childrenOf,
  epicOf,
  hours,
  isDone,
  isStory,
  loadByPerson,
  readinessOf,
  readinessScore,
  sprintMeta,
} from "./t3team-planningUxModel";

export const CURRENT_SPRINT = "4448";
export const NEXT_SPRINT = "7228";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {children}
    </div>
  );
}

function Bar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "ok" | "warn" | "bad" | "info";
}) {
  const color = { ok: "bg-success", warn: "bg-warning", bad: "bg-destructive", info: "bg-info" }[
    tone
  ];
  return (
    <div className="relative h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cx("absolute inset-y-0 left-0", color)}
        style={{ width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%` }}
      />
    </div>
  );
}

function Check({ ok, label, unknown }: { ok: boolean; label: string; unknown?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
        ok
          ? "border-success/40 text-success"
          : unknown
            ? "border-warning/40 text-warning"
            : "border-destructive/40 text-destructive",
      )}
    >
      {ok ? "✓" : unknown ? "?" : "✗"} {label}
    </span>
  );
}

// ——— Lens bodies ———

export function TeamLoadLens({
  tickets,
  sprintId,
  capacityHours,
}: {
  tickets: readonly ProjectTicket[];
  sprintId: string;
  capacityHours: number;
}) {
  const rows = [...loadByPerson(tickets, sprintId).entries()].sort(
    (a, b) => b[1].seconds - a[1].seconds,
  );
  const over = rows.filter(
    ([n, v]) => n !== "Unassigned" && hours(v.seconds) > capacityHours,
  ).length;
  const under = rows.filter(
    ([n, v]) => n !== "Unassigned" && hours(v.seconds) < capacityHours * 0.4,
  ).length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="destructive">{over} over capacity</Badge>
        <Badge variant="secondary">{under} under 40%</Badge>
        <Badge variant="outline">capacity {capacityHours}h / person</Badge>
      </div>
      <div className="space-y-1.5">
        {rows.map(([name, v]) => {
          const h = hours(v.seconds);
          const tone =
            name === "Unassigned"
              ? "warn"
              : h > capacityHours
                ? "bad"
                : h < capacityHours * 0.4
                  ? "info"
                  : "ok";
          return (
            <div key={name} className="flex items-center gap-3 text-sm">
              <span className="w-40 truncate">{name}</span>
              <Bar value={h} max={Math.max(capacityHours * 1.5, 1)} tone={tone} />
              <span className="w-24 text-right text-xs text-muted-foreground tabular-nums">
                {h}h · {v.items} items
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ReadinessList({
  tickets,
  sprintId,
  owner,
  drafted,
  onDraft,
}: {
  tickets: readonly ProjectTicket[];
  sprintId: string;
  owner: string | null;
  drafted?: ReadonlySet<string>;
  onDraft?: (id: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const stories = tickets
    .filter(
      (t) => isStory(t) && t.sprintId === sprintId && (owner === null || t.assignee === owner),
    )
    .map((t) => {
      const base = readinessOf(tickets, t);
      const r = drafted?.has(t.id)
        ? {
            ...base,
            subtasks: Math.max(3, base.subtasks),
            estimateSeconds: base.estimateSeconds || 14 * 3600,
          }
        : base;
      return { t, r };
    })
    .sort((a, b) => readinessScore(a.r) - readinessScore(b.r));
  const ready = stories.filter((s) => readinessScore(s.r) === 4).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">
          {ready} / {stories.length} ready
        </span>
        <Bar value={ready} max={stories.length} tone={ready === stories.length ? "ok" : "warn"} />
      </div>
      {stories.map(({ t, r }) => (
        <div key={t.id} className="rounded-lg border border-border bg-card">
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-2 text-left"
            onClick={() => setOpen(open === t.id ? null : t.id)}
          >
            <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
              {t.ref.displayId}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{t.ref.title}</span>
            <span className="flex shrink-0 gap-1">
              <Check ok={r.subtasks > 0} label={`${r.subtasks} subtasks`} />
              <Check
                ok={r.estimateSeconds > 0}
                label={r.estimateSeconds ? `${hours(r.estimateSeconds)}h` : "estimate"}
              />
              <Check
                ok={r.reviewer !== null}
                unknown={r.reviewer === null}
                label={r.reviewer ? r.reviewer.split(" ")[0]! : "reviewer"}
              />
              <Check ok={r.acceptanceCriteria} label="AC" />
            </span>
          </button>
          {open === t.id ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                {t.status} · owner {r.owner ?? "—"}
              </span>
              <span className="flex-1" />
              {r.subtasks === 0 || r.estimateSeconds === 0 ? (
                <Button size="xs" onClick={() => onDraft?.(t.id)}>
                  Agent: draft subtasks + hours
                </Button>
              ) : null}
              {r.reviewer === null ? (
                <Button size="xs" variant="outline">
                  Ask for a reviewer
                </Button>
              ) : null}
              {!r.acceptanceCriteria ? (
                <Button size="xs" variant="outline">
                  Draft AC
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RefinementLens({ tickets }: { tickets: readonly ProjectTicket[] }) {
  const stories = tickets.filter((t) => isStory(t) && t.sprintId === NEXT_SPRINT);
  const rs = stories.map((t) => readinessOf(tickets, t));
  const tile = (n: number, label: string, bad: boolean) => (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className={cx("text-2xl font-semibold tabular-nums", bad && "text-destructive")}>
        {n}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Gate before planning {sprintMeta(tickets, NEXT_SPRINT).name}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {tile(stories.length, "stories planned", false)}
        {tile(rs.filter((r) => r.subtasks > 0).length, "have subtasks", true)}
        {tile(rs.filter((r) => r.estimateSeconds > 0).length, "have estimates", true)}
        {tile(rs.filter((r) => !r.owner).length, "no owner", true)}
      </div>
      <ReadinessList tickets={tickets} sprintId={NEXT_SPRINT} owner={null} />
    </div>
  );
}

function TestQueueLens({ tickets }: { tickets: readonly ProjectTicket[] }) {
  const items = tickets
    .filter((t) => t.sprintId === CURRENT_SPRINT && /in test/i.test(t.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const now = Date.parse("2026-10-15T08:00:00Z");
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Badge variant="secondary">{items.length} in test</Badge>
        <Badge variant="outline">oldest first</Badge>
      </div>
      {items.map((t) => {
        const days = Math.floor((now - Date.parse(t.updatedAt)) / 864e5);
        return (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-1.5 text-sm"
          >
            <span className="w-20 font-mono text-xs text-muted-foreground">{t.ref.displayId}</span>
            <span className="min-w-0 flex-1 truncate">{t.ref.title}</span>
            <span className="text-xs text-muted-foreground">{t.assignee ?? "—"}</span>
            <Badge variant={days >= 5 ? "destructive" : "outline"}>{days}d</Badge>
          </div>
        );
      })}
    </div>
  );
}

function EpicsLens({ tickets }: { tickets: readonly ProjectTicket[] }) {
  const byEpic = new Map<string, { title: string; done: number; total: number }>();
  for (const t of tickets) {
    if (!isStory(t) || t.sprintId !== CURRENT_SPRINT) continue;
    const e = epicOf(tickets, t);
    const key = e?.id ?? "—";
    const cur = byEpic.get(key) ?? { title: e?.ref.title ?? "No epic", done: 0, total: 0 };
    cur.total += 1;
    if (isDone(t)) cur.done += 1;
    byEpic.set(key, cur);
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {[...byEpic.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([id, e]) => (
          <div key={id} className="rounded-lg border border-border bg-card p-3">
            <div className="truncate text-sm font-medium">{e.title}</div>
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Bar value={e.done} max={e.total} tone="ok" />
              {e.done}/{e.total}
            </div>
          </div>
        ))}
    </div>
  );
}

export function busiestOwner(tickets: readonly ProjectTicket[], sprintId: string): string {
  const c = new Map<string, number>();
  for (const t of tickets)
    if (isStory(t) && t.sprintId === sprintId && t.assignee)
      c.set(t.assignee, (c.get(t.assignee) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function LensBody({
  lens,
  tickets,
  me,
}: {
  lens: LensId;
  tickets: readonly ProjectTicket[];
  me: string;
}) {
  if (lens === "team-load")
    return <TeamLoadLens tickets={tickets} sprintId={NEXT_SPRINT} capacityHours={40} />;
  if (lens === "my-stories")
    return <ReadinessList tickets={tickets} sprintId={NEXT_SPRINT} owner={me} />;
  if (lens === "refinement") return <RefinementLens tickets={tickets} />;
  if (lens === "test-queue") return <TestQueueLens tickets={tickets} />;
  return <EpicsLens tickets={tickets} />;
}

function LensTabs({
  lens,
  onLens,
  defaultLens,
}: {
  lens: LensId;
  onLens: (l: LensId) => void;
  defaultLens: LensId;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-lg border border-border bg-muted/40 p-0.5">
      {LENSES.map((l) => (
        <button
          key={l.id}
          role="tab"
          type="button"
          aria-selected={lens === l.id}
          onClick={() => onLens(l.id)}
          className={cx(
            "rounded-md px-2.5 py-1 text-sm",
            lens === l.id
              ? "bg-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l.label}
          {l.id === defaultLens ? (
            <span className="ml-1 text-2xs text-primary">default</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function ProfileSelect({
  profile,
  onProfile,
}: {
  profile: ProfileId;
  onProfile: (p: ProfileId) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Profile (sets default only)
      <select
        className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
        value={profile}
        onChange={(e) => onProfile(e.target.value as ProfileId)}
      >
        {PROFILES.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Header({
  tickets,
  children,
}: {
  tickets: readonly ProjectTicket[];
  children?: ReactNode;
}) {
  const cur = sprintMeta(tickets, CURRENT_SPRINT);
  const next = sprintMeta(tickets, NEXT_SPRINT);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
      <span className="font-medium">Planning</span>
      <Badge variant="destructive">{cur.name} ended</Badge>
      <Badge variant="outline">next: {next.name}</Badge>
      <span className="flex-1" />
      {children}
    </div>
  );
}

// ——— Story 1: lens switcher ———
export function LensSwitcherPrototype({
  tickets,
  initialProfile = "engineer",
}: {
  tickets: readonly ProjectTicket[];
  initialProfile?: ProfileId;
}) {
  const [profile, setProfile] = useState<ProfileId>(initialProfile);
  const def = PROFILES.find((p) => p.id === profile)!.defaultLens;
  const [lens, setLens] = useState<LensId>(def);
  const me = useMemo(() => busiestOwner(tickets, NEXT_SPRINT), [tickets]);
  return (
    <Shell>
      <Header tickets={tickets}>
        <ProfileSelect
          profile={profile}
          onProfile={(p) => {
            setProfile(p);
            setLens(PROFILES.find((x) => x.id === p)!.defaultLens);
          }}
        />
      </Header>
      <div className="flex items-center gap-3 px-4 py-2">
        <LensTabs lens={lens} onLens={setLens} defaultLens={def} />
        <span className="text-xs text-muted-foreground">
          All lenses open to everyone · "me" = {me}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        <LensBody lens={lens} tickets={tickets} me={me} />
      </div>
    </Shell>
  );
}

// ——— Story 2: readiness ———
export function ReadinessPrototype({ tickets }: { tickets: readonly ProjectTicket[] }) {
  const owners = useMemo(
    () =>
      [
        ...new Set(
          tickets
            .filter((t) => isStory(t) && t.sprintId === NEXT_SPRINT && t.assignee)
            .map((t) => t.assignee!),
        ),
      ].sort(),
    [tickets],
  );
  const [me, setMe] = useState(() => busiestOwner(tickets, NEXT_SPRINT));
  const [drafted, setDrafted] = useState<Set<string>>(new Set());
  return (
    <Shell>
      <Header tickets={tickets}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Me
          <select
            className="rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
            value={me}
            onChange={(e) => setMe(e.target.value)}
          >
            {owners.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      </Header>
      <div className="px-4 pt-3 text-sm text-muted-foreground">
        Story readiness: subtasks · estimate · reviewer (from a review subtask) · acceptance
        criteria. Click a row.
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <ReadinessList
          tickets={tickets}
          sprintId={NEXT_SPRINT}
          owner={me}
          drafted={drafted}
          onDraft={(id) => setDrafted(new Set([...drafted, id]))}
        />
      </div>
    </Shell>
  );
}

// ——— Story 3: team load + sprint lanes with drag ———
export function TeamLoadLanesPrototype({
  tickets: initial,
}: {
  tickets: readonly ProjectTicket[];
}) {
  const [tickets, setTickets] = useState(initial);
  const [capacity, setCapacity] = useState(40);
  const [dragId, setDragId] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const move = (id: string, sprintId: string | undefined) =>
    setTickets((ts) =>
      ts.map((t) => {
        if (t.id !== id && t.parentId !== id) return t;
        const next = { ...t };
        if (sprintId) next.sprintId = sprintId;
        else delete next.sprintId;
        return next;
      }),
    );
  const lane = (
    title: string,
    sprintId: string | undefined,
    filter: (t: ProjectTicket) => boolean,
  ) => {
    const items = tickets.filter(
      (t) => isStory(t) && filter(t) && (!focus || t.assignee === focus),
    );
    return (
      <div
        className={cx(
          "flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-muted/30",
          dragId && "ring-1 ring-primary/40",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (dragId) move(dragId, sprintId);
          setDragId(null);
        }}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-medium">
          {title}
          <Badge variant="secondary">{items.length}</Badge>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
          {items.map((t) => {
            const r = readinessOf(tickets, t);
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => setDragId(t.id)}
                onDragEnd={() => setDragId(null)}
                className="cursor-grab rounded-md border border-border bg-card px-2 py-1.5 text-xs active:cursor-grabbing"
              >
                <div className="flex gap-2">
                  <span className="font-mono text-muted-foreground">{t.ref.displayId}</span>
                  <span className="flex-1" />
                  <span className="text-muted-foreground">
                    {r.estimateSeconds ? `${hours(r.estimateSeconds)}h` : "no est."}
                  </span>
                </div>
                <div className="truncate text-sm">{t.ref.title}</div>
                <div className="text-muted-foreground">
                  {t.assignee ?? "unassigned"} · {t.status}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  const rows = [...loadByPerson(tickets, NEXT_SPRINT).entries()].sort(
    (a, b) => b[1].seconds - a[1].seconds,
  );
  return (
    <Shell>
      <Header tickets={tickets}>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Capacity / person
          <input
            type="range"
            min={10}
            max={80}
            step={2}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
          <span className="w-8 tabular-nums text-foreground">{capacity}h</span>
        </label>
      </Header>
      <div className="flex min-h-0 flex-1 gap-3 p-3">
        <div className="flex w-[34%] min-h-0 flex-col">
          <div className="mb-2 text-sm font-medium">
            Next sprint load{" "}
            <span className="text-xs text-muted-foreground">(click a person to filter lanes)</span>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto">
            {rows.map(([name, v]) => {
              const h = hours(v.seconds);
              return (
                <div
                  key={name}
                  role="button"
                  tabIndex={0}
                  onClick={() => setFocus(focus === name ? null : name)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setFocus(focus === name ? null : name);
                  }}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-sm",
                    focus === name && "bg-accent",
                  )}
                >
                  <span className="w-32 truncate">{name}</span>
                  <Bar
                    value={h}
                    max={capacity * 1.5}
                    tone={
                      name === "Unassigned"
                        ? "warn"
                        : h > capacity
                          ? "bad"
                          : h < capacity * 0.4
                            ? "info"
                            : "ok"
                    }
                  />
                  <span className="w-10 text-right text-xs tabular-nums">{h}h</span>
                </div>
              );
            })}
          </div>
        </div>
        {lane(
          "Carry-over (open in ended sprint)",
          CURRENT_SPRINT,
          (t) => t.sprintId === CURRENT_SPRINT && !isDone(t),
        )}
        {lane(
          `Next: ${sprintMeta(tickets, NEXT_SPRINT).name}`,
          NEXT_SPRINT,
          (t) => t.sprintId === NEXT_SPRINT,
        )}
        {lane("Out / backlog", undefined, (t) => !t.sprintId)}
      </div>
    </Shell>
  );
}

// ——— Story 4: 3-stop zoom ladder ———
type Stop = 0 | 1 | 2;
const STOP_LABEL = ["Overview", "Sprint", "Detail"] as const;

export function ZoomLadderPrototype({ tickets }: { tickets: readonly ProjectTicket[] }) {
  const stories = useMemo(
    () => tickets.filter((t) => isStory(t) && t.sprintId === CURRENT_SPRINT),
    [tickets],
  );
  const epics = useMemo(() => {
    const m = new Map<string, { title: string; items: ProjectTicket[] }>();
    for (const s of stories) {
      const e = epicOf(tickets, s);
      const k = e?.id ?? "—";
      const cur = m.get(k) ?? { title: e?.ref.title ?? "No epic", items: [] };
      cur.items.push(s);
      m.set(k, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].items.length - a[1].items.length);
  }, [stories, tickets]);
  const order = useMemo(() => epics.flatMap(([, e]) => e.items), [epics]);
  const [stop, setStop] = useState<Stop>(0);
  const [idx, setIdx] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const wheelAcc = useRef(0);
  const cur = order[idx]!;
  const curEpic = epics.find(([, e]) => e.items.includes(cur));
  useEffect(() => root.current?.focus(), []);
  useEffect(() => {
    root.current
      ?.querySelector(`[data-sid="${cur?.id}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [cur, stop]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "1" || e.key === "2" || e.key === "3") setStop((Number(e.key) - 1) as Stop);
    else if (e.key === "ArrowRight" || e.key === "ArrowDown")
      setIdx((i) => Math.min(order.length - 1, i + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") setIdx((i) => Math.max(0, i - 1));
    else if (e.key === "Enter") setStop((s) => Math.min(2, s + 1) as Stop);
    else if (e.key === "Escape") setStop((s) => Math.max(0, s - 1) as Stop);
    else return;
    e.preventDefault();
  };
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    wheelAcc.current += e.deltaY;
    if (Math.abs(wheelAcc.current) > 120) {
      setStop((s) => Math.max(0, Math.min(2, s + (wheelAcc.current < 0 ? 1 : -1))) as Stop);
      wheelAcc.current = 0;
    }
  };
  const r = cur ? readinessOf(tickets, cur) : null;
  return (
    <Shell>
      <div
        ref={root}
        tabIndex={0}
        onKeyDown={onKey}
        onWheel={onWheel}
        className="flex h-full flex-col outline-none"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-sm">
          <nav className="flex items-center gap-1">
            <button type="button" className="hover:underline" onClick={() => setStop(0)}>
              {sprintMeta(tickets, CURRENT_SPRINT).name}
            </button>
            {stop >= 1 ? (
              <>
                <span className="text-muted-foreground">›</span>
                <button type="button" className="hover:underline" onClick={() => setStop(1)}>
                  {curEpic?.[1].title}
                </button>
              </>
            ) : null}
            {stop === 2 ? (
              <>
                <span className="text-muted-foreground">›</span>
                <span>{cur?.ref.displayId}</span>
              </>
            ) : null}
          </nav>
          <span className="flex-1" />
          <div className="flex gap-0.5 rounded-lg border border-border p-0.5">
            {STOP_LABEL.map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => setStop(i as Stop)}
                className={cx(
                  "rounded px-2 py-0.5 text-xs",
                  stop === i ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {i + 1} {l}
              </button>
            ))}
          </div>
          <span className="text-2xs text-muted-foreground">
            1/2/3 · ←→ · Enter/Esc · ctrl+wheel snaps
          </span>
        </div>
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div
            className={cx(
              "absolute inset-0 overflow-auto p-4 transition-all duration-300",
              stop === 0 ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
            )}
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
              {epics.map(([id, e]) => (
                <div
                  key={id}
                  className={cx(
                    "rounded-md border bg-card p-2",
                    e.items.includes(cur) ? "border-primary" : "border-border",
                  )}
                >
                  <div className="truncate text-xs font-medium">{e.title}</div>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {e.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        data-sid={s.id}
                        aria-label={s.ref.title}
                        onClick={() => {
                          setIdx(order.indexOf(s));
                          setStop(1);
                        }}
                        className={cx(
                          "size-3 rounded-sm",
                          isDone(s)
                            ? "bg-success"
                            : /test|review/i.test(s.status)
                              ? "bg-warning"
                              : "bg-muted-foreground/40",
                          s === cur && "ring-2 ring-primary",
                        )}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div
            className={cx(
              "absolute inset-0 flex snap-x snap-mandatory gap-3 overflow-x-auto p-4 transition-all duration-300",
              stop === 1
                ? "scale-100 opacity-100"
                : cx("pointer-events-none opacity-0", stop === 0 ? "scale-105" : "scale-95"),
            )}
          >
            {epics.map(([id, e]) => (
              <div
                key={id}
                className="flex w-72 shrink-0 snap-start flex-col rounded-lg border border-border bg-muted/30"
              >
                <div className="truncate border-b border-border px-3 py-2 text-sm font-medium">
                  {e.title}
                </div>
                <div className="space-y-1 overflow-auto p-2">
                  {e.items.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      data-sid={s.id}
                      onClick={() => {
                        setIdx(order.indexOf(s));
                        setStop(2);
                      }}
                      className={cx(
                        "block w-full rounded-md border bg-card px-2 py-1.5 text-left text-xs",
                        s === cur ? "border-primary" : "border-border",
                      )}
                    >
                      <span className="font-mono text-muted-foreground">{s.ref.displayId}</span> ·{" "}
                      {s.status}
                      <div className="line-clamp-2 text-sm">{s.ref.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div
            className={cx(
              "absolute inset-0 flex items-center justify-center gap-4 p-6 transition-all duration-300",
              stop === 2 ? "scale-100 opacity-100" : "pointer-events-none scale-105 opacity-0",
            )}
          >
            <Button variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
              ‹ prev
            </Button>
            {cur && r ? (
              <div className="w-[min(720px,70%)] rounded-xl border border-border bg-card p-5 shadow-lg">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{cur.ref.displayId}</span>
                  <Badge variant="outline">{cur.status}</Badge>
                  <span>{cur.assignee ?? "unassigned"}</span>
                  <span className="flex-1" />
                  {idx + 1}/{order.length}
                </div>
                <div className="mt-2 text-lg font-medium">{cur.ref.title}</div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Check ok={r.subtasks > 0} label={`${r.subtasks} subtasks`} />
                  <Check
                    ok={r.estimateSeconds > 0}
                    label={r.estimateSeconds ? `${hours(r.estimateSeconds)}h` : "estimate"}
                  />
                  <Check ok={!!r.reviewer} unknown={!r.reviewer} label={r.reviewer ?? "reviewer"} />
                  <Check ok={r.acceptanceCriteria} label="AC" />
                </div>
                <div className="mt-3 space-y-1">
                  {childrenOf(tickets, cur.id).map((s) => (
                    <div
                      key={s.id}
                      className="flex gap-2 rounded border border-border px-2 py-1 text-xs"
                    >
                      <span className="font-mono text-muted-foreground">{s.ref.displayId}</span>
                      <span className="flex-1 truncate">{s.ref.title}</span>
                      <span className="text-muted-foreground">
                        {s.assignee?.split(" ")[0] ?? "—"} ·{" "}
                        {hours(s.timeOriginalEstimateSeconds ?? 0)}h · {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <Button
              variant="outline"
              onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}
            >
              next ›
            </Button>
          </div>
          <div className="absolute bottom-3 right-3 w-44 rounded-md border border-border bg-background/90 p-1.5 shadow">
            <div className="mb-1 text-2xs text-muted-foreground">Minimap</div>
            <div className="flex flex-wrap gap-px">
              {order.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setIdx(i)}
                  className={cx(
                    "size-1.5",
                    i === idx
                      ? "bg-primary"
                      : isDone(s)
                        ? "bg-success/60"
                        : "bg-muted-foreground/40",
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ——— Story 5: static side agent ———
const CANNED: Record<string, { reply: string; lens: LensId }> = {};

export function SideAgentPrototype({
  tickets,
  initialProfile = "engineer",
}: {
  tickets: readonly ProjectTicket[];
  initialProfile?: ProfileId;
}) {
  const [profile, setProfile] = useState<ProfileId>(initialProfile);
  const p = PROFILES.find((x) => x.id === profile)!;
  const [lens, setLens] = useState<LensId>(p.defaultLens);
  const [prev, setPrev] = useState<LensId | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [log, setLog] = useState<Array<{ who: "me" | "agent"; text: string }>>([]);
  const me = useMemo(() => busiestOwner(tickets, NEXT_SPRINT), [tickets]);
  const lensForSuggestion = (s: string): LensId =>
    /capacity|go out|carry/i.test(s)
      ? "team-load"
      : /my /i.test(s)
        ? "my-stories"
        : /test|duplicate/i.test(s)
          ? "test-queue"
          : "refinement";
  const ask = (s: string) => {
    const target = CANNED[s]?.lens ?? lensForSuggestion(s);
    setPrev(lens);
    setLens(target);
    setPending(s);
    setLog((l) => [
      ...l,
      { who: "me", text: s },
      {
        who: "agent",
        text: `Applied to the view: ${LENSES.find((x) => x.id === target)!.label} lens. Prototype — no model was called.`,
      },
    ]);
  };
  const suggestionsByLens: Record<LensId, string[]> = {
    "team-load": PROFILES[0]!.suggestions.slice(),
    "my-stories": PROFILES[1]!.suggestions.slice(),
    refinement: PROFILES[2]!.suggestions.slice(),
    "test-queue": PROFILES[3]!.suggestions.slice(),
    epics: ["Epics at risk this sprint", "Epic progress over the last 3 sprints"],
  };
  const chips = [...new Set([...p.suggestions, ...suggestionsByLens[lens]])];
  return (
    <Shell>
      <Header tickets={tickets}>
        <ProfileSelect
          profile={profile}
          onProfile={(x) => {
            setProfile(x);
            setLens(PROFILES.find((y) => y.id === x)!.defaultLens);
          }}
        />
      </Header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 px-4 py-2">
            <LensTabs lens={lens} onLens={setLens} defaultLens={p.defaultLens} />
          </div>
          {pending ? (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-1.5 text-xs">
              <Badge>Agent view</Badge>
              <span className="truncate">{pending}</span>
              <span className="flex-1" />
              <Button size="xs" onClick={() => setPending(null)}>
                Keep
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  if (prev) setLens(prev);
                  setPending(null);
                }}
              >
                Discard
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (prev) setLens(prev);
                  setPending(null);
                }}
              >
                ↶ Undo
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
            <LensBody lens={lens} tickets={tickets} me={me} />
          </div>
        </div>
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-card">
          <div className="border-b border-border px-3 py-2 text-sm font-medium">Ask this view</div>
          <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3 text-sm">
            {log.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Suggestions follow the profile and the lens. Every suggestion works for everyone.
              </div>
            ) : null}
            {log.map((m, i) => (
              <div
                key={`${m.who}-${i}-${m.text}`}
                className={cx(
                  "rounded-lg px-2.5 py-1.5",
                  m.who === "me" ? "ml-6 bg-primary/10" : "mr-6 border border-border",
                )}
              >
                {m.text}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 border-t border-border p-2">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => ask(c)}
                className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent"
              >
                {c}
              </button>
            ))}
          </div>
          <div className="p-2">
            <div className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
              Ask or rearrange this view… (static prototype)
            </div>
          </div>
        </aside>
      </div>
    </Shell>
  );
}
