import Link from "next/link";
import { Metadata } from "next";
import { Footer } from "@/components/footer";
import { ArrowLeftIcon } from "lucide-react";

export const metadata: Metadata = {
    title: "Terms of Service - Tuneloom",
    description: "Terms of service for Tuneloom",
};

export default function TermsOfService() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-12">
                <Link
                    href="/"
                    className="inline-flex text-sm items-center text-blue-400 hover:text-white hover:bg-blue-200 rounded-xl px-3 py-2 mb-8 transition-colors"
                >
                    <ArrowLeftIcon className="mr-2 size-4" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                    Terms of Service
                </h1>
                <p className="text-gray-600 mb-8">
                    Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>

                <div className="prose prose-blue max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            1. Acceptance of Terms
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            By accessing or using Tuneloom ("Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, please do not use our Service. These Terms constitute a legally binding agreement between you and Tuneloom.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            2. Description of Service
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Tuneloom provides a platform for users to fine-tune large language models with custom training data and host these models for inference. Our Service includes tools for data upload, model configuration, training execution, and API-based model hosting.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            3. Account Registration and Eligibility
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            3.1 Eligibility
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            You must be at least 18 years old to use this Service. By creating an account, you represent that you meet this age requirement and have the legal capacity to enter into these Terms.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            3.2 Account Security
                        </h3>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            You are responsible for:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Maintaining the confidentiality of your account credentials</li>
                            <li>All activities that occur under your account</li>
                            <li>Notifying us immediately of any unauthorized access</li>
                            <li>Providing accurate and complete registration information</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            4. Acceptable Use Policy
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            You agree NOT to use the Service to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Violate any applicable laws or regulations</li>
                            <li>Infringe upon intellectual property rights of others</li>
                            <li>Upload malicious code, viruses, or harmful software</li>
                            <li>Generate or distribute spam, harmful, or illegal content</li>
                            <li>Train models for harassment, discrimination, or illegal activities</li>
                            <li>Attempt to gain unauthorized access to our systems</li>
                            <li>Reverse engineer or circumvent security measures</li>
                            <li>Use the Service to compete with or replicate our offerings</li>
                            <li>Share account credentials or resell access to the Service</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            5. Your Content and Data
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            5.1 Ownership
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            You retain all ownership rights to your training data and fine-tuned models. You grant us a limited license to process and store your content solely to provide the Service.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            5.2 Content Responsibility
                        </h3>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            You represent and warrant that:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>You own or have the necessary rights to the training data you upload</li>
                            <li>Your content does not violate any third-party rights</li>
                            <li>Your content complies with all applicable laws</li>
                            <li>You have obtained necessary permissions for any personal data in your training sets</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            5.3 Content Moderation
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            We reserve the right to review, remove, or refuse to process content that violates these Terms or our policies, without prior notice.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            6. Payment and Billing
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            6.1 Fees
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            You agree to pay all fees associated with your use of the Service, including compute resources for training and hosting. Pricing details are available on our website.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            6.2 Billing
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Fees are billed according to your selected payment plan. You authorize us to charge your payment method for all applicable fees. All fees are non-refundable unless otherwise stated.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            6.3 Price Changes
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            We may change our pricing with 30 days notice. Continued use of the Service after price changes constitutes acceptance of the new pricing.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            7. Service Availability and Support
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            7.1 Uptime
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            While we strive for high availability, we do not guarantee uninterrupted access to the Service. We may perform maintenance, updates, or experience unexpected downtime.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            7.2 Resource Limits
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Your account may be subject to usage limits based on your plan. We may throttle or suspend access if you exceed these limits.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            8. Intellectual Property
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            8.1 Our IP
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            The Service, including its software, design, branding, and documentation, is owned by Tuneloom and protected by intellectual property laws. You may not copy, modify, or create derivative works without our permission.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            8.2 Feedback
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            If you provide feedback or suggestions, we may use them without obligation or compensation to you.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            9. Privacy and Data Protection
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Your use of the Service is also governed by our Privacy Policy. We implement security measures to protect your data but cannot guarantee absolute security. You are responsible for complying with data protection laws applicable to your use.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            10. Termination
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            10.1 By You
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            You may terminate your account at any time through your account settings or by contacting support.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            10.2 By Us
                        </h3>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            We may suspend or terminate your account if:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>You violate these Terms</li>
                            <li>You fail to pay applicable fees</li>
                            <li>Your use poses security or legal risks</li>
                            <li>We discontinue the Service (with reasonable notice)</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            10.3 Effect of Termination
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Upon termination, your right to use the Service ceases immediately. We may delete your data after a reasonable grace period. You remain liable for any outstanding fees.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            11. Disclaimers and Warranties
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Merchantability and fitness for a particular purpose</li>
                            <li>Accuracy, reliability, or quality of results</li>
                            <li>Uninterrupted or error-free operation</li>
                            <li>Security or freedom from viruses</li>
                        </ul>
                        <p className="text-gray-700 leading-relaxed mt-3">
                            You use the Service at your own risk. We are not responsible for the output or behavior of models you create.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            12. Limitation of Liability
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            TO THE MAXIMUM EXTENT PERMITTED BY LAW, TUNELOOM SHALL NOT BE LIABLE FOR:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Indirect, incidental, consequential, or punitive damages</li>
                            <li>Loss of profits, data, or business opportunities</li>
                            <li>Damages arising from your use or inability to use the Service</li>
                            <li>Content or conduct of third parties</li>
                        </ul>
                        <p className="text-gray-700 leading-relaxed mt-3">
                            Our total liability to you shall not exceed the fees you paid in the 12 months preceding the claim.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            13. Indemnification
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            You agree to indemnify and hold Tuneloom harmless from any claims, damages, or expenses arising from: (a) your use of the Service, (b) your content or training data, (c) your violation of these Terms, or (d) your violation of any third-party rights.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            14. Dispute Resolution
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            14.1 Governing Law
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            These Terms are governed by the laws of the jurisdiction in which Tuneloom is established, without regard to conflict of law principles.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            14.2 Arbitration
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Any disputes shall be resolved through binding arbitration rather than in court, except where prohibited by law. You waive any right to participate in class actions.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            15. Changes to Terms
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            We may modify these Terms at any time. We will notify you of material changes via email or through the Service. Continued use after changes constitutes acceptance of the modified Terms.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            16. General Provisions
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            16.1 Entire Agreement
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            These Terms, together with our Privacy Policy, constitute the entire agreement between you and Tuneloom.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            16.2 Severability
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            If any provision is found unenforceable, the remaining provisions remain in effect.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            16.3 Assignment
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            You may not assign these Terms without our consent. We may assign our rights and obligations without restriction.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            16.4 Waiver
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Our failure to enforce any provision does not constitute a waiver of that provision.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            17. Contact Information
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            For questions about these Terms, please contact us at:
                        </p>
                        <div className="bg-blue-50 p-4 rounded-lg mt-4">
                            <p className="text-gray-700">
                                <strong>Email:</strong> crymsongamer@gmail.com
                            </p>
                        </div>
                    </section>
                </div>
            </div>
            <Footer />
        </div>
    );
}
