import React from "react";
import { SiteHeader } from "./components/layout/SiteHeader";
import { SiteFooter } from "./components/layout/SiteFooter";
import { HeroSection } from "./components/sections/HeroSection";
import { LogoCloud } from "./components/sections/LogoCloud";
import { SpeedComparison } from "./components/sections/SpeedComparison";
import { HowItWorks } from "./components/sections/HowItWorks";
import { PersonalizationSection } from "./components/sections/PersonalizationSection";
import { PrivacySection } from "./components/sections/PrivacySection";
import { TestimonialsSection } from "./components/sections/TestimonialsSection";
import { FAQSection } from "./components/sections/FAQSection";
import { FinalCTA } from "./components/sections/FinalCTA";

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FFFFEB] text-[#1A1A1A] font-sans antialiased selection:bg-[#F0D7FF] selection:text-[#1A1A1A] flex flex-col justify-between">
      {/* Sticky Floating Header */}
      <SiteHeader />

      {/* Main Content Sections following design.md 11-step Information Architecture */}
      <main className="flex-1 w-full">
        {/* 1. Hero with headline, CTA, and Interactive Product Demo */}
        <HeroSection />

        {/* 2. Supported Agents & Integration Logos */}
        <LogoCloud />

        {/* 3. Speed & Focus Comparison in Deep Forest Green */}
        <SpeedComparison />

        {/* 4. How It Works (Three Feature Chapters) */}
        <HowItWorks />

        {/* 5. Personalization & Settings */}
        <PersonalizationSection />

        {/* 6. Privacy & Zero-Telemetry Model in Deep Forest Green */}
        <PrivacySection />

        {/* 7. Testimonials & Case Studies */}
        <TestimonialsSection />

        {/* 8. Frequently Asked Questions Accordion */}
        <FAQSection />

        {/* 9. Final Call to Action */}
        <FinalCTA />
      </main>

      {/* Editorial Footer */}
      <SiteFooter />
    </div>
  );
};

export default App;
