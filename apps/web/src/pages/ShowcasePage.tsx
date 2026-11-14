import React, { useState } from "react";
import { UserPreferences, DEFAULT_PREFERENCES, AgentStatus, GameScoreRecord } from "@waitplay/shared";
import { SiteHeader } from "../components/showcase/SiteHeader";
import { HeroSection } from "../components/showcase/HeroSection";
import { LogoCloud } from "../components/showcase/LogoCloud";
import { SpeedComparison } from "../components/showcase/SpeedComparison";
import { HowItWorks } from "../components/showcase/HowItWorks";
import { PersonalizationSection } from "../components/showcase/PersonalizationSection";
import { PrivacySection } from "../components/showcase/PrivacySection";
import { TestimonialsSection } from "../components/showcase/TestimonialsSection";
import { FAQSection } from "../components/showcase/FAQSection";
import { FinalCTA } from "../components/showcase/FinalCTA";
import { SiteFooter } from "../components/showcase/SiteFooter";
import { FullScreenGameModal, CompanionExperienceTab } from "../components/game/FullScreenGameModal";
import { recordScore } from "../store/gameHistory";

export interface ShowcasePageProps {
  onOpenDashboard: () => void;
  preferences?: UserPreferences;
  onUpdatePreferences?: (updated: UserPreferences) => void;
}

export const ShowcasePage: React.FC<ShowcasePageProps> = ({
  onOpenDashboard,
  preferences = DEFAULT_PREFERENCES,
  onUpdatePreferences,
}) => {
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [gameModalTab, setGameModalTab] = useState<CompanionExperienceTab>("games");

  const handleOpenGame = (tab: CompanionExperienceTab = "games") => {
    setGameModalTab(tab);
    setIsGameModalOpen(true);
  };

  const handleGameComplete = (score: GameScoreRecord) => {
    recordScore(score);
  };

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans selection:bg-forest selection:text-canvas transition-colors">
      {/* Sticky Editorial Header */}
      <SiteHeader
        onOpenDashboard={onOpenDashboard}
        onOpenGame={() => handleOpenGame("games")}
        isDashboardActive={false}
      />

      {/* Main Showcase Flow */}
      <main className="flex flex-col w-full">
        {/* Section 9.1: Hero Section */}
        <HeroSection
          onPlayGame={() => handleOpenGame("games")}
          onOpenDashboard={onOpenDashboard}
        />

        {/* Section 9.2: Logo Cloud Ecosystems */}
        <LogoCloud />

        {/* Section 9.3: Speed Comparison (Deep Forest Green Section) */}
        <SpeedComparison />

        {/* Section 9.4: How It Works Chapters */}
        <HowItWorks />

        {/* Section 9.5: Micro-Game Sandbox & Wispr Flow Floating Widget Demo */}
        <PersonalizationSection />

        {/* Section 9.6: Privacy & Localhost Architecture */}
        <PrivacySection />

        {/* Section 9.7: Testimonials & Developer Proof */}
        <TestimonialsSection />

        {/* Section 9.8: Frequently Asked Questions Accordion */}
        <FAQSection />

        {/* Section 9.9: Final Call to Action */}
        <FinalCTA onOpenDashboard={onOpenDashboard} />
      </main>

      {/* Section 9.10: Site Footer */}
      <SiteFooter />

      {/* Interactive Micro-Game Modal launched directly from Showcase */}
      {isGameModalOpen && (
        <FullScreenGameModal
          isOpen={isGameModalOpen}
          agentStatus="WORKING"
          taskElapsedSeconds={18}
          preferences={preferences}
          isPaused={false}
          initialTab={gameModalTab}
          onExitFullscreen={() => setIsGameModalOpen(false)}
          onClose={() => setIsGameModalOpen(false)}
          onGameComplete={handleGameComplete}
        />
      )}
    </div>
  );
};

export default ShowcasePage;
