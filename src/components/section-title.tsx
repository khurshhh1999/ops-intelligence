import { CardTitle } from "@/components/ui/card";

export function SectionTitle({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-baseline gap-2.5 font-semibold tracking-tight">
      <span className="font-mono text-[11px] font-normal text-muted-foreground">{n}</span>
      {children}
    </CardTitle>
  );
}
