"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pacificoFont } from "../lib/utils";

const TUTORIAL_STEPS = [
    {
        title: <span className="flex items-center gap-2">
            Welcome to <span className={`${pacificoFont.className} text-2xl font-medium text-blue-400`}>
                tuneloom
            </span></span>,
        description: "Select your base model to fine-tune and explore the model playground.",
        videoUrl: "https://swjsmi9jbkwkt8fl.public.blob.vercel-storage.com/tuneloom-tutorial-1b.mp4",
    },
    {
        title: "Add training data",
        description: "Create and manage your training data. Generate training data for your model quickly.",
        videoUrl: "https://swjsmi9jbkwkt8fl.public.blob.vercel-storage.com/tuneloom-tutorial-2b.mp4",
    },
    {
        title: "Fine-tune your model",
        description: "Easily fine-tune your model with just a few clicks and monitor the training process.",
        videoUrl: "https://swjsmi9jbkwkt8fl.public.blob.vercel-storage.com/tuneloom-tutorial-3b.mp4",
    },
    {
        title: "Model Playground",
        description: "Test and interact with your fine-tuned model in the model playground. Copy the API endpoint to integrate it into your applications.",
        videoUrl: "https://swjsmi9jbkwkt8fl.public.blob.vercel-storage.com/tuneloom-tutorial-4a.mp4",
    }
];

const TUTORIAL_STORAGE_KEY = "tutorial_completed";

function Tutorial() {
    const [open, setOpen] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const tutorialCompleted = localStorage.getItem(TUTORIAL_STORAGE_KEY);
        // Preload all tutorial videos in the background
        if (!tutorialCompleted) {
            TUTORIAL_STEPS.forEach((step) => {
                const video = document.createElement('video');
                video.src = step.videoUrl;
                video.preload = 'auto';
                video.muted = true;
                video.load();
            });
        }
    }, []);

    useEffect(() => {
        // Check if tutorial has been completed before
        const tutorialCompleted = localStorage.getItem(TUTORIAL_STORAGE_KEY);

        if (!tutorialCompleted) {
            // Show tutorial on first visit
            setOpen(true);
        }
    }, []);

    const handleNext = () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleComplete();
        }
    };

    const handlePrevious = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSkip = () => {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
        setOpen(false);
        setCurrentStep(0);
    };

    const handleComplete = () => {
        localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
        setOpen(false);
        setCurrentStep(0);
    };

    const handleStepClick = (stepIndex: number) => {
        setCurrentStep(stepIndex);
    };

    const currentStepData = TUTORIAL_STEPS[currentStep];
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="border-none" showCloseButton={false}>
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center">
                            <img src="/logo.svg" alt="tuneloom" className="size-9 mr-2 object-contain" />
                            {currentStepData.title}
                        </div>
                    </DialogTitle>
                    <DialogDescription className="text-black">
                        {currentStepData.description}
                    </DialogDescription>
                </DialogHeader>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="relative aspect-video w-full max-w-md mx-auto overflow-hidden rounded-lg bg-muted"
                    >
                        <video
                            src={currentStepData.videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="h-full w-full object-cover"
                        >
                            Your browser does not support the video tag.
                        </video>
                    </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-center gap-2 py-2">
                    {TUTORIAL_STEPS.map((_, index) => (
                        <button
                            key={index}
                            onClick={() => handleStepClick(index)}
                            className={`h-2 w-2 rounded-full transition-all hover:scale-125 cursor-pointer ${index === currentStep
                                ? "bg-primary w-4"
                                : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                                }`}
                            aria-label={`Go to step ${index + 1}`}
                        />
                    ))}
                </div>

                <DialogFooter className="sm:justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSkip}
                        className="text-muted-foreground"
                    >
                        Skip Tutorial
                    </Button>
                    <div className="flex gap-2">
                        {!isFirstStep && (
                            <Button
                                variant="outline"
                                size="sm"
                                className='border-none'
                                onClick={handlePrevious}
                            >
                                Previous
                            </Button>
                        )}
                        <Button
                            onClick={handleNext}
                            size="sm"
                            className='bg-blue-100 text-black hover:bg-blue-200 border-none'
                        >
                            {isLastStep ? "Get Started" : "Next"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export { Tutorial };