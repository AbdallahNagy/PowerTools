import { ArrowLeftRight, List, ShieldCheck, Sparkles } from "lucide-react";
import type { ReactElement } from "react";
import { desktopBridge } from "../../platform/desktopBridge";
import { PUBLIC_TOOLS } from "../publicCatalog";

const features: {
  icon: ReactElement;
  title: string;
  description: string;
  highlight?: boolean;
}[] = [
  {
    icon: (
      <Sparkles size={28} strokeWidth={1.5} aria-hidden="true" />
    ),
    title: "Modern UI",
    description:
      "A clean desktop experience for Dataverse work, built to feel clear, focused, and comfortable for daily developer workflows.",
  },
  {
    icon: (
      <List size={28} strokeWidth={1.5} aria-hidden="true" />
    ),
    title: "Friendly UX",
    description:
      "Tools are designed to be easy to discover, understand, and use without digging through confusing old dialogs.",
  },
  {
    icon: (
      <ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" />
    ),
    title: "Local and secure",
    description:
      "PowerTools runs on your machine and connects directly to Dataverse. Your data never leaves your machine.",
  },
  {
    icon: (
      <ArrowLeftRight size={28} strokeWidth={1.5} aria-hidden="true" />
    ),
    title: "Open source",
    description:
      "Built in the open so developers can inspect how it works, suggest improvements, and shape the toolkit over time.",
  },
];

export default function WelcomeTab() {
  return (
    <div className="h-full overflow-y-auto bg-canvas text-fg-strong">
      {/* Hero */}
      <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center overflow-hidden">
        {/* Decorative glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, var(--color-accent-text) 18%, transparent) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-5 max-w-2xl mx-auto">
          {/* Badge */}
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{
              background: "color-mix(in srgb, var(--color-accent-text) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-accent-text) 40%, transparent)",
              color: "var(--color-accent-text)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--color-accent)" }}
            />
            Open-source desktop toolkit
          </span>

          <h1
            className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight"
            style={{
              background: "linear-gradient(135deg, var(--color-fg-strong) 40%, var(--color-accent-text) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            PowerTools
          </h1>

          <p className="text-base sm:text-lg leading-relaxed max-w-xl" style={{ color: "var(--color-fg)" }}>
            A modern open-source desktop toolkit for everyday Dataverse work, with a friendly UI, secure local workflow,
            and tools that are easy to figure out and use.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <button
              className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90 active:opacity-75"
              style={{
                background: "var(--color-accent)",
                color: "var(--color-accent-fg)",
              }}
              onClick={() => {
                const el = document.getElementById("pt-features");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Explore toolkit
            </button>
            <a
              href="https://github.com/AbdallahNagy/PowerTools"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: "var(--color-raised)",
                color: "var(--color-fg)",
                border: "1px solid var(--color-line)",
              }}
              onClick={(event) => {
                event.preventDefault();
                void desktopBridge.openExternalUrl(
                  "https://github.com/AbdallahNagy/PowerTools"
                );
              }}
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Stats strip */}
      {/* <div
        className="border-y"
        style={{
          borderColor: "var(--color-line)",
          background: "var(--color-surface)",
        }}
      >
        <div className="flex justify-center divide-x divide-line max-w-3xl mx-auto">
          {[
            // { value: "100%", label: "Local & private" },
            { value: "∞", label: "Environments" },
            { value: "Open", label: "Source" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-5 px-4 gap-1">
              <span
                className="text-2xl font-bold"
                style={{ color: "var(--color-accent-text)" }}
              >
                {stat.value}
              </span>
              <span
                className="text-xs tracking-wide"
                style={{ color: "var(--color-fg-muted)" }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div> */}

      {/* Features grid */}
      <div id="pt-features" className="px-6 py-14 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ color: "var(--color-fg-strong)" }}>
            Built for Dataverse developers
          </h2>
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            A focused desktop workspace for developer flow: clear screens, discoverable actions, and less friction
            around repeatable work.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-3 rounded-lg p-5 transition-all duration-200"
              style={
                feature.highlight
                  ? {
                      background: "linear-gradient(135deg, color-mix(in srgb, var(--color-accent-text) 18%, transparent) 0%, color-mix(in srgb, var(--color-accent-text) 6%, transparent) 100%)",
                      border: "1px solid color-mix(in srgb, var(--color-accent-text) 45%, transparent)",
                      boxShadow: "0 0 24px color-mix(in srgb, var(--color-accent-text) 12%, transparent)",
                    }
                  : {
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-line)",
                    }
              }
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "color-mix(in srgb, var(--color-accent-text) 45%, transparent)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px color-mix(in srgb, var(--color-accent-text) 10%, transparent)";
              }}
              onMouseLeave={(e) => {
                if (feature.highlight) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "color-mix(in srgb, var(--color-accent-text) 45%, transparent)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 24px color-mix(in srgb, var(--color-accent-text) 12%, transparent)";
                } else {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "var(--color-line)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-11 h-11 rounded-md shrink-0"
                  style={{
                    background: feature.highlight ? "color-mix(in srgb, var(--color-accent-text) 20%, transparent)" : "color-mix(in srgb, var(--color-accent-text) 12%, transparent)",
                    color: "var(--color-accent-text)",
                  }}
                >
                  {feature.icon}
                </div>
                {feature.highlight && (
                  <span
                    className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wider uppercase"
                    style={{
                      background: "color-mix(in srgb, var(--color-accent-text) 20%, transparent)",
                      color: "var(--color-accent-text)",
                      border: "1px solid color-mix(in srgb, var(--color-accent-text) 35%, transparent)",
                    }}
                  >
                    New
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-fg-strong)" }}>
                  {feature.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Current tools */}
      <div className="px-6 pb-14 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ color: "var(--color-fg-strong)" }}>
            Current tools
          </h2>
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            PowerTools is a toolkit, starting with the workflows developers need often.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PUBLIC_TOOLS.map((tool) => (
            <div
              key={tool.title}
              className="rounded-lg p-5"
              style={{
                background: "var(--color-surface)",
                border: "1px solid color-mix(in srgb, var(--color-accent-text) 22%, transparent)",
              }}
            >
              <h3 className="text-base font-semibold mt-4 mb-2" style={{ color: "var(--color-fg-strong)" }}>
                {tool.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-fg-muted)" }}>
                {tool.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA footer */}
      <div
        className="mx-6 mb-12 rounded-xl p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 max-w-5xl lg:mx-auto"
        style={{
          background: "linear-gradient(135deg, color-mix(in srgb, var(--color-accent-text) 12%, transparent) 0%, color-mix(in srgb, var(--color-accent-text) 4%, transparent) 100%)",
          border: "1px solid color-mix(in srgb, var(--color-accent-text) 20%, transparent)",
        }}
      >
        <div className="text-center sm:text-left">
          <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--color-fg-strong)" }}>
            Ready to start building?
          </h3>
          <p className="text-sm" style={{ color: "var(--color-fg-muted)" }}>
            Open a Dataverse connection, then pick a tool from the activity bar on the left.
          </p>
        </div>
        <div
          className="text-xs px-4 py-2 rounded-md font-mono shrink-0"
          style={{
            background: "var(--color-canvas)",
            color: "var(--color-accent-text)",
            border: "1px solid color-mix(in srgb, var(--color-accent-text) 30%, transparent)",
          }}
        >
          Connect → Select tool → Go
        </div>
      </div>
    </div>
  );
}
