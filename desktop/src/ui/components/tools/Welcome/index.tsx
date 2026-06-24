import type { ReactElement } from "react";

const features: {
  icon: ReactElement;
  title: string;
  description: string;
  highlight?: boolean;
}[] = [
    {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
      </svg>
    ),
    title: "Beautiful Modern UI",
    description:
      "A sleek, dark-theme interface with smooth interactions, crisp typography, and a VS Code-inspired layout that feels instantly familiar and delightful to use every day.",
    // highlight: true,
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
    title: "Data Migration",
    description:
      "Move records between Dataverse environments with field mapping, filter conditions, and real-time progress tracking.",
  },
  // {
  //   icon: (
  //     <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
  //       <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
  //     </svg>
  //   ),
  //   title: "Secure by Design",
  //   description:
  //     "OAuth 2.0 / Azure AD authentication",
  // },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5M9 11.25v1.5M12 9v3.75m3-6.75v6.75" />
      </svg>
    ),
    title: "Multi-Environment",
    description:
      "Connect to multiple Dynamics 365 / Dataverse environments at once and switch between them instantly.",
  },
  // {
  //   icon: (
  //     <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7" stroke="currentColor" strokeWidth={1.5}>
  //       <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 6.087c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.036-1.007-1.875-2.25-1.875c-1.243 0-2.25.84-2.25 1.875 0 .369.128.713.349 1.003.215.283.401.604.401.959v0a.64.64 0 0 1-.657.643 48.39 48.39 0 0 1-4.163-.3c.186 1.613.293 3.25.315 4.907a.656.656 0 0 1-.658.663v0c-.355 0-.676-.186-.959-.401a1.647 1.647 0 0 0-1.003-.349c-1.036 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401v0c.31 0 .555.26.532.57a48.039 48.039 0 0 1-.642 5.056c1.518.19 3.058.309 4.616.354a.64.64 0 0 0 .657-.643v0c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.036 1.007-1.875 2.25-1.875 1.243 0 2.25.84 2.25 1.875 0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959v0c0 .333.277.599.61.58a48.1 48.1 0 0 0 5.427-.63 48.05 48.05 0 0 0 .582-4.717.532.532 0 0 0-.533-.57v0c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.036 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.369 0 .713.128 1.003.349.283.215.604.401.959.401v0c.317 0 .573-.262.55-.578a48.192 48.192 0 0 0-.642-5.056c-1.457.18-2.935.297-4.432.34a.644.644 0 0 1-.658-.643v0Z" />
  //     </svg>
  //   ),
  //   title: "Extensible Toolbox",
  //   description:
  //     "A growing suite of Power Platform admin tools — all in one place, with a VS Code-inspired interface you already know.",
  // },
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
            background:
              "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(0,122,204,0.18) 0%, transparent 70%)",
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
            Power Platform · Next Generation
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
            Power Tools
          </h1>

          <p
            className="text-base sm:text-lg leading-relaxed max-w-xl"
            style={{ color: "var(--color-text-gray)" }}
          >
            The modern, open-source desktop toolbox for Microsoft Dynamics 365
            and Dataverse — built for developers
            who demand speed and precision.
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
              Explore features
            </button>
            {/* <a
              href="https://github.com/PowerTools"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 rounded-md text-sm font-medium transition-colors"
              style={{
                background: "var(--color-bg-light)",
                color: "var(--color-text-gray)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              View on GitHub
            </a> */}
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
          <h2
            className="text-2xl sm:text-3xl font-semibold mb-3"
            style={{ color: "var(--color-text-white)" }}
          >
            Everything you need
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text-dark-gray)" }}>
            A growing suite of tools designed around real-world Power Platform workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-3 rounded-lg p-5 transition-all duration-200"
              style={
                feature.highlight
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(0,122,204,0.18) 0%, rgba(0,122,204,0.06) 100%)",
                      border: "1px solid rgba(0,122,204,0.45)",
                      boxShadow: "0 0 24px rgba(0,122,204,0.12)",
                    }
                  : {
                      background: "var(--color-bg-darker)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }
              }
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor =
                  "rgba(0,122,204,0.45)";
                (e.currentTarget as HTMLDivElement).style.boxShadow =
                  "0 0 20px rgba(0,122,204,0.1)";
              }}
              onMouseLeave={(e) => {
                if (feature.highlight) {
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "rgba(0,122,204,0.45)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    "0 0 24px rgba(0,122,204,0.12)";
                } else {
                  (e.currentTarget as HTMLDivElement).style.borderColor =
                    "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                }
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex items-center justify-center w-11 h-11 rounded-md shrink-0"
                  style={{
                    background: feature.highlight
                      ? "rgba(0,122,204,0.2)"
                      : "rgba(0,122,204,0.12)",
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
                <h3
                  className="text-sm font-semibold mb-1"
                  style={{ color: "var(--color-text-white)" }}
                >
                  {feature.title}
                </h3>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--color-text-dark-gray)" }}
                >
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA footer */}
      <div
        className="mx-6 mb-12 rounded-xl p-8 sm:p-10 flex flex-col sm:flex-row items-center justify-between gap-6 max-w-5xl lg:mx-auto"
        style={{
          background:
            "linear-gradient(135deg, rgba(0,122,204,0.12) 0%, rgba(0,122,204,0.04) 100%)",
          border: "1px solid rgba(0,122,204,0.2)",
        }}
      >
        <div className="text-center sm:text-left">
          <h3
            className="text-lg font-semibold mb-1"
            style={{ color: "var(--color-text-white)" }}
          >
            Ready to get started?
          </h3>
          <p
            className="text-sm"
            style={{ color: "var(--color-text-dark-gray)" }}
          >
            Open a connection from the status bar, then pick a tool from the
            activity bar on the left.
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
