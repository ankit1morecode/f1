import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Gauge, Radio, TimerReset } from "lucide-react";
import { DriverSwitch } from "@/components/race/DriverSwitch";
import { useTelemetry } from "@/lib/telemetry/useTelemetry";
import teamLogo from "@/assets/team-logo.svg.asset.json";

export const Route = createFileRoute("/")({ head: () => ({ meta: [
  { title: "SlipStream-X — Live Race Engineering" }, { name: "description", content: "An interactive four-tire race-engineering simulation with live telemetry, pit strategy and synchronized track state." },
  { property: "og:title", content: "SlipStream-X — Live Race Engineering" }, { property: "og:description", content: "Decode grip. Understand behaviour. Make the pit decision." },
] }), component: Landing });

function Landing() { const { driver } = useTelemetry(4); return <div className="-mx-5 -my-7">
  <section className="relative min-h-[78vh] overflow-hidden bg-carbon px-6 py-16 text-background md:px-12">
    <div className="race-stage absolute inset-0 opacity-30" aria-hidden />
    <div className="relative mx-auto flex max-w-[1400px] flex-col justify-between gap-16">
      <div className="flex items-center gap-4"><img src={teamLogo.url} alt="Team logo" width={56} height={51} className="h-14 w-auto" /><span className="h-1 w-14 bg-primary"/><span className="font-display text-sm font-semibold">RACE ENGINEERING DEMONSTRATION</span></div>
      <div className="max-w-5xl"><p className="font-display text-xl font-semibold text-primary">SLIPSTREAM-X</p><h1 className="mt-4 max-w-4xl font-display text-5xl font-bold leading-[1.04] md:text-7xl">Decode grip.<br/>Understand behaviour.<br/><span className="text-primary">Make the pit decision.</span></h1><p className="mt-7 max-w-2xl text-lg text-background/70">One car, four tires and thirty-two physical channels working as one live race session—from the first lap to the next tire set.</p>
        <div className="mt-9 max-w-xl rounded-3xl border border-background/20 bg-background/5 p-5">
          <span className="label-xs text-primary">Who is driving</span>
          <div className="mt-3"><DriverSwitch active={driver} tone="dark" /></div>
          <p className="mt-3 text-sm text-background/65">{driver.name} · Car #{driver.carNumber} · {driver.carName}. {driver.style}</p>
        </div>
        <div className="mt-7 flex flex-wrap gap-3"><Link to="/live" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground">Enter Live Race <ArrowRight /></Link><Link to="/strategy" className="rounded-md border border-background/30 px-6 py-3 font-semibold">Open Pit Strategy</Link></div></div>
      <div className="grid max-w-4xl gap-5 border-t border-background/20 pt-7 sm:grid-cols-3"><Fact icon={<Radio/>} value="20 Hz" label="Shared live session"/><Fact icon={<Gauge/>} value="32" label="Physical channels"/><Fact icon={<TimerReset/>} value="10 s" label="Pit transition"/></div>
    </div>
  </section>
  <section className="mx-auto max-w-[1400px] px-6 py-16"><div className="grid gap-10 lg:grid-cols-[.7fr_1.3fr]"><div><span className="label-xs text-primary">The complete lap</span><h2 className="mt-2 font-display text-3xl font-bold">Every screen reads the same car.</h2><p className="mt-4 text-muted-foreground">Tire state, circuit position, telemetry, pit history and strategy remain synchronized. A pit stop changes the tire set—not the story of the race.</p></div><div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2"><Stage n="01" title="Watch the four corners" text="Inspect live grip, temperature, pressure and degradation for FL, FR, RL and RR."/><Stage n="02" title="Read all nine groups" text="Follow steering, ride height, tires, pedals, brakes, air pressure, axle load and speed."/><Stage n="03" title="Make the call" text="Use a live-linked pit window, tire recommendation, reasoning and confidence."/><Stage n="04" title="Keep the race history" text="Review old stints, pit events and telemetry after the new set is active."/></div></div></section>
</div>; }
function Fact({icon,value,label}:{icon:React.ReactNode;value:string;label:string}) { return <div className="flex items-center gap-3 text-background/75">{icon}<div><strong className="num block text-xl text-background">{value}</strong><span className="text-sm">{label}</span></div></div>; }
function Stage({n,title,text}:{n:string;title:string;text:string}) { return <div className="bg-card p-6"><span className="num text-sm text-primary">{n}</span><h3 className="mt-2 font-display text-lg font-semibold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{text}</p></div>; }