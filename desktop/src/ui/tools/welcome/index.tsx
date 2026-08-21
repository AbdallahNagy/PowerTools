import type { ReactElement } from "react";
import { desktopBridge } from "../../platform/desktopBridge";

const features: {
  icon: ReactElement;
  title: string;
  description: string;
  highlight?: boolean;
}[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
        />
      </svg>
    ),
    title: "Modern UI",
    description:
      "A clean desktop experience for Dataverse work, built to feel clear, focused, and comfortable for daily developer workflows.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 6.75h12M8.25 12h12M8.25 17.25h12M3.75 6.75h.008v.008H3.75V6.75ZM3.75 12h.008v.008H3.75V12ZM3.75 17.25h.008v.008H3.75v-.008Z"
        />
      </svg>
    ),
    title: "Friendly UX",
    description:
      "Tools are designed to be easy to discover, understand, and use without digging through confusing old dialogs.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75A11.959 11.959 0 0 1 12 2.714Z"
        />
      </svg>
    ),
    title: "Local and secure",
    description:
      "PowerTools runs on your machine and connects directly to Dataverse. Your data never leaves your machine.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17.25 6.75 21 12m0 0-3.75 5.25M21 12H3m3.75-5.25L3 12m0 0 3.75 5.25"
        />
      </svg>
    ),
    title: "Open source",
    description:
      "Built in the open so developers can inspect how it works, suggest improvements, and shape the toolkit over time.",
  },
];

const tools: {
  title: string;
  description: string;
}[] = [
  {
    title: "Data Migration",
    description:
      "Move data between Dataverse environments with a guided, developer-friendly workflow that is easier to understand and control.",
  },
  {
    title: "FetchXML Builder",
    description: "Build, test, and refine FetchXML queries in a cleaner workspace built for fast iteration.",
  },
];

export default function WelcomeTab() {
  return (
    <div className="h-full overflow-y-auto bg-(--color-bg-dark) text-(--color-text-white)">
      {/* Hero */}
      <div className="relative flex flex-col items-center justify-center px-6 py-16 text-center overflow-hidden">
        {/* Decorative glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,122,204,0.18) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-5 max-w-2xl mx-auto">
          {/* Badge */}
          <span
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase"
            style={{
              background: "rgba(0,122,204,0.15)",
              border: "1px solid rgba(0,122,204,0.4)",
              color: "var(--color-primary)",
            }}
          >
            <span
              className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: "var(--color-primary)" }}
            />
            Open-source desktop toolkit
          </span>

          <h1
            className="text-5xl sm:text-6xl font-bold leading-tight tracking-tight"
            style={{
              background: "linear-gradient(135deg, #fff 40%, var(--color-primary) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            PowerTools
          </h1>

          <p className="text-base sm:text-lg leading-relaxed max-w-xl" style={{ color: "var(--color-text-gray)" }}>
            A modern open-source desktop toolkit for everyday Dataverse work, with a friendly UI, secure local workflow,
            and tools that are easy to figure out and use.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <button
              className="px-5 py-2.5 rounded-md text-sm font-medium transition-opacity hover:opacity-90 active:opacity-75"
              style={{
                background: "var(--color-primary)",
                color: "#fff",
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
                background: "var(--color-bg-light)",
                color: "var(--color-text-gray)",
                border: "1px solid rgba(255,255,255,0.08)",
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
          borderColor: "rgba(255,255,255,0.06)",
          background: "var(--color-bg-darker)",
        }}
      >
        <div className="flex justify-center divide-x divide-white/5 max-w-3xl mx-auto">
          {[
            // { value: "100%", label: "Local & private" },
            { value: "∞", label: "Environments" },
            { value: "Open", label: "Source" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-5 px-4 gap-1">
              <span
                className="text-2xl font-bold"
                style={{ color: "var(--color-primary)" }}
              >
                {stat.value}
              </span>
              <span
                className="text-xs tracking-wide"
                style={{ color: "var(--color-text-dark-gray)" }}
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
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ color: "var(--color-text-white)" }}>
            Built for Dataverse developers
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dark-gray)" }}>
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
                      background: "linear-gradient(135deg, rgba(0,122,204,0.18) 0%, rgba(0,122,204,0.06) 100%)",
                      border: "1px solid rgba(0,122,204,0.45)",
                      boxShadow: "0 0 24px rgba(0,122,204,0.12)",
                    }
                  : {
                      background: "var(--color-bg-darker)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }
              }
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,122,204,0.45)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px rgba(0,122,204,0.1)";
              }}
              onMouseLeave={(e) => {
                if (feature.highlight) {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,122,204,0.45)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 24px rgba(0,122,204,0.12)";
                } else {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-11 h-11 rounded-md shrink-0"
                  style={{
                    background: feature.highlight ? "rgba(0,122,204,0.2)" : "rgba(0,122,204,0.12)",
                    color: "var(--color-primary)",
                  }}
                >
                  {feature.icon}
                </div>
                {feature.highlight && (
                  <span
                    className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wider uppercase"
                    style={{
                      background: "rgba(0,122,204,0.2)",
                      color: "var(--color-primary)",
                      border: "1px solid rgba(0,122,204,0.35)",
                    }}
                  >
                    New
                  </span>
                )}
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--color-text-white)" }}>
                  {feature.title}
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-dark-gray)" }}>
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
          <h2 className="text-2xl sm:text-3xl font-semibold mb-3" style={{ color: "var(--color-text-white)" }}>
            Current tools
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dark-gray)" }}>
            PowerTools is a toolkit, starting with the workflows developers need often.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tools.map((tool) => (
            <div
              key={tool.title}
              className="rounded-lg p-5"
              style={{
                background: "var(--color-bg-darker)",
                border: "1px solid rgba(0,122,204,0.22)",
              }}
            >
              <h3 className="text-base font-semibold mt-4 mb-2" style={{ color: "var(--color-text-white)" }}>
                {tool.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--color-text-dark-gray)" }}>
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
          background: "linear-gradient(135deg, rgba(0,122,204,0.12) 0%, rgba(0,122,204,0.04) 100%)",
          border: "1px solid rgba(0,122,204,0.2)",
        }}
      >
        <div className="text-center sm:text-left">
          <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--color-text-white)" }}>
            Ready to start building?
          </h3>
          <p className="text-sm" style={{ color: "var(--color-text-dark-gray)" }}>
            Open a Dataverse connection, then pick a tool from the activity bar on the left.
          </p>
        </div>
        <div
          className="text-xs px-4 py-2 rounded-md font-mono shrink-0"
          style={{
            background: "var(--color-bg-dark)",
            color: "var(--color-primary)",
            border: "1px solid rgba(0,122,204,0.3)",
          }}
        >
          Connect → Select tool → Go
        </div>
      </div>
    </div>
  );
}
