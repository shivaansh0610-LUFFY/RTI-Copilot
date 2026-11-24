import type { ReactNode } from "react";

// A white sheet held down with tape, as the application, a pasted draft or the PIO's reply.
// `label` names it in small capitals at its top-left corner (pass a <label> to name a text box).
export function Sheet({ label, className = "", children }: { label?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={"paper-sheet " + className}>
      <span aria-hidden="true" className="paper-tape" />
      {label && <div className="paper-label absolute left-5 top-4 sm:left-6">{label}</div>}
      {children}
    </div>
  );
}

// A rubber stamp: a small line over a big one, like PIO-PROOF over 10/10. With `label` it is
// read out as that; without, screen readers skip it (the same fact is said in words nearby).
export function Stamp({
  top,
  main,
  large = false,
  label,
  className = "",
}: {
  top: string;
  main: string;
  large?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={"stamp shrink-0 " + (large ? "stamp-lg " : "") + className}
    >
      <span className="stamp-top">{top}</span>
      <span className="stamp-main">{main}</span>
    </span>
  );
}

// A card on the paper with a Khand title, as in the side panels.
export function PaperCard({
  title,
  tone = "plain",
  className = "",
  children,
}: {
  title?: ReactNode;
  tone?: "plain" | "blue" | "green" | "red";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    plain: "border-edge bg-card",
    blue: "border-[#c9d3ec] bg-ink-blue-wash",
    green: "border-[#9fd5ae] bg-leaf-wash",
    red: "border-[#f2b8b0] bg-[#fff7f5]",
  };
  const titleTones = { plain: "text-ink", blue: "text-ink-blue", green: "text-leaf", red: "text-stamp" };
  return (
    <section className={"rounded-lg border p-5 " + tones[tone] + " " + className}>
      {title && (
        <h3 className={"mb-2.5 font-title text-2xl font-bold uppercase leading-none " + titleTones[tone]}>{title}</h3>
      )}
      {children}
    </section>
  );
}
