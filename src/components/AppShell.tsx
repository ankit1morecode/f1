import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { toggleTheme, useTheme } from "@/lib/theme";
import { engine } from "@/lib/telemetry/engine";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import { cn } from "@/lib/utils";
import { PROTOCOL_VERSION } from "@/lib/telemetry/types";
import { DriverBadge } from "@/components/race/DriverSwitch";
import teamLogo from "@/assets/team-logo.svg.asset.json";

const NAV = [
  { to: "/live", label: "Live Race" },
  { to: "/track", label: "Track" },
  { to: "/telemetry", label: "Telemetry" },
  { to: "/strategy", label: "Pit Strategy" },
  { to: "/replay", label: "Session" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState({ select: (s) => ({ location: s.location }) });
  const { running, connection, session, latest, driver } = useTelemetry(4);
  const theme = useTheme();

  // No hardware attached: bring the simulated telemetry link up on first mount.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!engine.running && !engine.latest) engine.start();
    }, 250);
    return () => window.clearTimeout(timer);
  }, []);


  const statusText =
    connection.status === "CONNECTED"
      ? "Live"
      : connection.status === "DEGRADED"
        ? "Unsteady signal"
        : "Not receiving data";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3.5">
          <Link to="/" className="group flex items-center gap-2.5" title="Back to the start page">
            <img src={teamLogo.url} alt="Team logo" width={36} height={33} className="h-9 w-auto" />
            <span className="font-display text-base font-semibold tracking-tight">
              SlipStream<span className="text-primary">-X</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1" aria-label="Race engineering views">
            {NAV.map((n) => {
              const active =
                n.to === "/" ? location.pathname === "/" : location.pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={cn(
                    "story-link relative rounded-full px-3.5 py-2 text-sm text-muted-foreground",
                    active && "bg-secondary text-primary",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <DriverBadge driver={driver} />
              <Indicator
                label={statusText}
                tone={
                  connection.status === "CONNECTED"
                    ? "ok"
                    : connection.status === "DEGRADED"
                      ? "warn"
                      : "crit"
                }
              />
              <span
                className="num text-xs text-muted-foreground"
                title="Updates per second, data lost, and delay"
              >
                {connection.packetRate} Hz · {connection.lossPct.toFixed(2)}% lost ·{" "}
                {connection.latencyMs.toFixed(0)} ms delay
              </span>
              <span className="num text-xs text-muted-foreground" title="Current run and its length">
                {session.id} · {((latest?.t ?? 0) / 1000).toFixed(1)} s
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to the light look" : "Switch to the dark look"}
                aria-label={theme === "dark" ? "Switch to the light look" : "Switch to the dark look"}
                className="flex size-9 items-center justify-center rounded-full border border-border text-muted-foreground"
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>
              <button
                onClick={() => (running ? engine.pause() : engine.start())}
                title={running ? "Stop updating the screens" : "Start receiving data again"}
                className="whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                {running ? "Pause" : "Start"}
              </button>
              <button
                onClick={() => engine.saveSession()}
                title="Keep this run so you can replay it later"
                className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm text-foreground/90"
              >
                Save run
              </button>
              <button
                onClick={() => engine.reset()}
                title="Clear the current run and begin a fresh one"
                className="whitespace-nowrap rounded-full border border-border px-4 py-2 text-sm text-muted-foreground"
              >
                Start over
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-7">{children}</main>

      <footer className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-5 pb-8 pt-4 text-sm text-muted-foreground">
        <span>SlipStream-X · Protocol v{PROTOCOL_VERSION}</span>
        <Link to="/health" className="story-link">System health</Link>
        <Link to="/settings" className="story-link">Settings</Link>
        <Link to="/requirements" className="story-link">Dossier traceability</Link>
        <span className="ml-auto text-xs text-muted-foreground/70">Designed and developed by Ankit Kumar</span>
      </footer>
    </div>
  );
}

function Indicator({ label, tone }: { label: string; tone: "ok" | "warn" | "crit" }) {
  const dot = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : "bg-crit";
  return (
    <span className="flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1.5">
      <span className={cn("size-2 rounded-full", dot)} />
      <span className="text-sm text-foreground/85">{label}</span>
    </span>
  );
}

