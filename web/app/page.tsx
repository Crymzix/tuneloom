"use client";

import { LightRays } from "../components/ui/light-rays";
import { ChatInput } from "../components/sections/chat-input";
import { TrainingDataInput } from "../components/sections/training-data-input";
import { Stepper } from "../components/ui/stepper";
import { FineTune } from "../components/sections/fine-tine";
import { Header } from "../components/header";
import { LinePath } from "../components/ui/line-path";
import { useRef } from "react";
import { useScroll } from "../contexts/scroll-context";

const steps = [
    { id: "chat-input", label: "Model" },
    { id: "training-data-input", label: "Training Data" },
    { id: "fine-tune", label: "Fine-Tune" },
];

export default function Home() {
    const { scrollProgress } = useScroll()

    return (
        <div className="relative font-sans">
            <Stepper steps={steps} />
            <main className="flex flex-col">
                <Header />
                <section className="snap-start">
                    <ChatInput />
                </section>
                <section className="snap-start">
                    <TrainingDataInput />
                </section>
                <section className="snap-start">
                    <FineTune />
                </section>
            </main>
            <div
                className="absolute inset-0 -z-20"
                style={{
                    background: 'radial-gradient(circle at 100% -20%, rgba(37, 99, 235, 0.15) 0%, rgba(59, 130, 246, 0.08) 25%, rgba(96, 165, 250, 0.03) 50%, transparent 70%)'
                }}
            />
            <LinePath
                className="absolute -right-[14%] top-10 -z-10"
                scrollYProgress={scrollProgress}
            />
            <LightRays reverse />
        </div>
    );
}
