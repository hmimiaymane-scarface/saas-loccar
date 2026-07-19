import { SectionHeader } from "@/components/domain/section-header"
import { Card, CardContent } from "@/components/ui/card"
import { ConfidenceIndicator } from "@/components/domain/intelligence/confidence-indicator"
import { ScoreIndicator } from "@/components/domain/intelligence/score-indicator"
import { AiRecommendationCard } from "@/components/domain/intelligence/ai-recommendation-card"
import { InsightFeedItem } from "@/components/domain/intelligence/insight-feed-item"
import { EntityTimeline } from "@/components/domain/intelligence/entity-timeline"
import { DocumentConfidenceRow } from "@/components/domain/intelligence/document-confidence-row"
import { DarkPreview } from "./dark-preview"
import type { ActivityItem } from "@/types/rental"

// Internal engineering tool: a static preview of the "intelligence"
// component vocabulary (roadmap phase 02) with mock data, so later
// phases (vehicle/customer intelligence, the AI Operations Feed, the
// Command Center) can compose these instead of each inventing its own
// version. Not linked from any navigation — reachable by URL only,
// which combined with this route already sitting behind the normal
// dashboard auth gate is the right amount of "gated" for a mock-data
// preview page.

const timelineItems: ActivityItem[] = [
  {
    id: "1",
    type: "vehicle_picked_up",
    title: "Rental activated",
    description: "Picked up by Karim Idrissi",
    timestamp: "2026-07-14T09:12:00.000Z",
    actor: "Sara Amrani",
  },
  {
    id: "2",
    type: "inspection_completed",
    title: "Pickup inspection completed",
    description: "Pickup inspection completed",
    timestamp: "2026-07-14T09:05:00.000Z",
    actor: "Sara Amrani",
  },
  {
    id: "3",
    type: "maintenance_completed",
    title: "Oil change completed",
    description: "Oil change completed",
    timestamp: "2026-07-10T14:30:00.000Z",
    actor: "Youssef El Amrani",
  },
  {
    id: "4",
    type: "damage_recorded",
    title: "Damage recorded: rear bumper",
    description: "Damage recorded: rear bumper",
    timestamp: "2026-07-08T11:00:00.000Z",
    actor: "Karim Idrissi",
  },
  {
    id: "5",
    type: "document_uploaded",
    title: "Document uploaded",
    description: "Insurance certificate uploaded",
    timestamp: "2026-07-01T08:45:00.000Z",
    actor: "Sara Amrani",
  },
]

function DemoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-sm font-medium text-muted-foreground">{title}</h2>
      <Card>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </section>
  )
}

export default function IntelligenceComponentsDemoPage() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Intelligence components"
        description="Mock-data preview of the shared AI/intelligence component vocabulary — not linked from navigation."
      />
      <DarkPreview>
        <div className="flex flex-col gap-8">
          <DemoSection title="Confidence indicator">
            <div className="flex flex-col gap-2">
              <ConfidenceIndicator percent={97} />
              <ConfidenceIndicator percent={82} />
              <ConfidenceIndicator percent={58} />
            </div>
          </DemoSection>

          <DemoSection title="Score indicator">
            <div className="grid gap-6 sm:grid-cols-3">
              <ScoreIndicator label="Fleet Health" value={86} />
              <ScoreIndicator label="Trust Score" value={55} />
              <ScoreIndicator label="Profitability" value={28} />
            </div>
          </DemoSection>

          <DemoSection title="AI recommendation card">
            <AiRecommendationCard
              observation="The Toyota Corolla (12345-A-6) has remained idle for 11 days."
              reasoning="Comparable economy vehicles average 4.2 rental days per week this month; this vehicle has had zero bookings in the last 11 days."
              suggestedAction="Reduce the daily rate to 280 MAD for the next two weeks."
              confidence={82}
            />
          </DemoSection>

          <DemoSection title="Insight feed item">
            <div className="flex flex-col divide-y divide-border">
              <InsightFeedItem
                priority="critical"
                title="Insurance expires in 3 days"
                description="Toyota Corolla — 12345-A-6"
                actionLabel="Renew"
              />
              <InsightFeedItem
                priority="important"
                title="Weekend demand is unusually high"
                description="SUV category is 96% booked for Friday–Sunday"
                actionLabel="Review pricing"
              />
              <InsightFeedItem
                priority="informational"
                title="Customer Sofia Bennani completed five rentals without incident"
                description="Eligible for VIP status"
              />
            </div>
          </DemoSection>

          <DemoSection title="Entity timeline">
            <EntityTimeline items={timelineItems} />
          </DemoSection>

          <DemoSection title="Document confidence review row">
            <div className="flex flex-col divide-y divide-border">
              <DocumentConfidenceRow label="Full name" value="Aicha Bennani" confidence={99} />
              <DocumentConfidenceRow label="Licence number" value="MA-4471829" confidence={91} />
              <DocumentConfidenceRow label="Expiry date" value="2027-03-12" confidence={68} />
            </div>
          </DemoSection>
        </div>
      </DarkPreview>
    </div>
  )
}
