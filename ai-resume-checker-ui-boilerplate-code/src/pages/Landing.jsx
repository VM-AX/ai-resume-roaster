import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { DashboardPreviewSection } from "@/components/landing/DashboardPreviewSection";
import { BenefitsSection } from "@/components/landing/BenefitsSection";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/Footer";

export default function Landing() {
  return (
    <div className="landing-page min-h-screen bg-[var(--bg)] text-[var(--ink)] overflow-x-hidden">
      <Navbar />
      <main style={{ background: "white" }}>
        <HeroSection />
        <FeaturesSection />
        <HowItWorks />
        <DashboardPreviewSection />
        <BenefitsSection />
        <TestimonialsSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
