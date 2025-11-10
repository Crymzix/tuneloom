import Link from "next/link";
import { Metadata } from "next";
import { Footer } from "@/components/footer";
import { ArrowLeftIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata: Metadata = {
    title: "FAQ - tuneloom",
    description: "Frequently asked questions about tuneloom",
};

export default function FAQ() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-12 min-h-screen">
                <Link
                    href="/"
                    className="inline-flex text-sm items-center text-blue-400 hover:text-white hover:bg-blue-200 rounded-xl px-3 py-2 mb-8 transition-colors"
                >
                    <ArrowLeftIcon className="mr-2 size-4" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                    Frequently Asked Questions
                </h1>
                <p className="text-gray-600 mb-8">
                    Find answers to common questions about tuneloom
                </p>

                <div className="bg-white rounded-lg shadow-sm p-6">
                    <Accordion type="single" collapsible className="w-full">
                        <AccordionItem value="item-1">
                            <AccordionTrigger>
                                What is tuneloom?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    tuneloom is a platform that allows you to fine-tune and host custom language models.
                                    You can upload your own training data, customize model parameters, and deploy your fine-tuned
                                    models through our API infrastructure.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-2">
                            <AccordionTrigger>
                                How do I get started with fine-tuning a model?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed mb-3">
                                    Getting started is simple:
                                </p>
                                <ol className="list-decimal pl-6 text-gray-700 space-y-2">
                                    <li>Select a base model from our model playground</li>
                                    <li>Upload your training data in the supported format</li>
                                    <li>Configure your fine-tuning parameters (temperature, top-p, etc.)</li>
                                    <li>Start the fine-tuning process and monitor progress</li>
                                    <li>Deploy your model when training is complete</li>
                                </ol>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-3">
                            <AccordionTrigger>
                                What formats are supported for training data?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    We support various data formats including JSON, JSONL, and CSV. Your training data should
                                    be structured with prompt-completion pairs or conversation formats depending on your use case.
                                    Refer to our documentation for specific format requirements and best practices.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-4">
                            <AccordionTrigger>
                                How long does fine-tuning take?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    Fine-tuning duration varies based on several factors including the size of your training dataset,
                                    the base model you selected, and the complexity of your use case. Typical fine-tuning jobs can
                                    take anywhere from a few minutes to several hours. You&apos;ll receive notifications when your
                                    model is ready.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-7">
                            <AccordionTrigger>
                                Is my training data secure?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    Yes, we take security seriously. Your training data and fine-tuned models are stored securely
                                    with industry-standard encryption. Each user&apos;s data is isolated, and we never use your data
                                    to train other models or share it with third parties. You can delete your data at any time
                                    through your account dashboard.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-8">
                            <AccordionTrigger>
                                How do I access my fine-tuned model?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    Once your model is fine-tuned, you can access it through our API endpoints or directly through
                                    the model playground. We provide REST API access with authentication, and you can integrate
                                    your fine-tuned model into your applications using any OpenAI API compatible SDK.
                                </p>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-9">
                            <AccordionTrigger>
                                Can I test models before fine-tuning?
                            </AccordionTrigger>
                            <AccordionContent>
                                <p className="text-gray-700 leading-relaxed">
                                    Absolutely! Our model playground allows you to test base models with both chat and completion
                                    modes before committing to fine-tuning. You can experiment with different prompts and parameter
                                    settings to understand how the model behaves and determine if it&apos;s the right fit for your use case.
                                </p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </div>

                <div className="mt-8 p-6 bg-blue-50 rounded-lg">
                    <h2 className="text-md font-semibold text-gray-900 mb-2">
                        Still have questions?
                    </h2>
                    <p className="text-gray-700 mb-4 text-sm">
                        Can&apos;t find the answer you&apos;re looking for? Please contact our support team.
                    </p>
                    <Link
                        href="mailto:crymsongamer@gmail.com"
                        className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium text-sm"
                    >
                        Contact Support
                    </Link>
                </div>
            </div>
            <Footer />
        </div>
    );
}
