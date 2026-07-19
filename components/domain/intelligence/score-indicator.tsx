import { AnimatedNumber } from "@/components/domain/animated-number"
import { Progress } from "@/components/ui/progress"
import { scoreBand, toneClasses } from "@/lib/tone"
import { cn } from "@/lib/utils"

interface ScoreIndicatorProps {
  /** What this score measures — e.g. "Fleet Health", "Trust Score",
   * "Profitability". This component doesn't know which kind it is. */
  label: string
  /** 0-100 */
  value: number
  className?: string
}

/** One shared visual for health/trust/profitability scores (bible
 * Chapter 5 §9-10, §16 and Chapter 3 §5) — a label, an animated
 * percentage, a bar, and the bible's own Healthy / Needs Attention /
 * Critical vocabulary. */
function ScoreIndicator({ label, value, className }: ScoreIndicatorProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const { tone, label: bandLabel } = scoreBand(clamped)

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn("font-medium", toneClasses[tone].text)}>
          <AnimatedNumber value={clamped} formatter="percent" />
        </span>
      </div>
      <Progress value={clamped} indicatorClassName={toneClasses[tone].fill} />
      <span className={cn("w-fit rounded-full px-2 py-0.5 text-xs font-medium", toneClasses[tone].badge)}>
        {bandLabel}
      </span>
    </div>
  )
}

export { ScoreIndicator }
