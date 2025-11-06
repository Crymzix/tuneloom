import Link from "next/link";
import { Metadata } from "next";
import { Footer } from "@/components/footer";
import { ArrowLeftIcon } from "lucide-react";

export const metadata: Metadata = {
    title: "Privacy Policy - tuneloom",
    description: "Privacy policy for tuneloom",
};

export default function PrivacyPolicy() {
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
                    Privacy Policy
                </h1>
                <p className="text-gray-600 mb-8">
                    Last Updated: {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>

                <div className="prose prose-blue max-w-none space-y-8">
                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            1. Introduction
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Welcome to tuneloom. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you use our platform to fine-tune and host custom language models.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            2. Information We Collect
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            2.1 Account Information
                        </h3>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            When you create an account, we collect:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Email address</li>
                            <li>Username or display name</li>
                            <li>Password (encrypted)</li>
                            <li>Account preferences and settings</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            2.2 Training Data and Models
                        </h3>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            When you use our service to fine-tune models, we process:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Training datasets you upload</li>
                            <li>Model configurations and parameters</li>
                            <li>Fine-tuned model weights and artifacts</li>
                            <li>API usage logs and inference requests</li>
                        </ul>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            2.3 Usage Information
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            We automatically collect technical information including IP addresses, browser type, device information, and usage patterns to improve our service and ensure security.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            3. How We Use Your Information
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            We use the collected information to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Provide and maintain our fine-tuning and hosting services</li>
                            <li>Process your model training requests</li>
                            <li>Store and serve your fine-tuned models</li>
                            <li>Communicate with you about service updates and support</li>
                            <li>Improve our platform and develop new features</li>
                            <li>Detect and prevent fraud or abuse</li>
                            <li>Comply with legal obligations</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            4. Data Storage and Security
                        </h2>
                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            4.1 Your Training Data
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            Your training data and fine-tuned models are stored securely and isolated from other users. We implement industry-standard encryption and security measures to protect your data.
                        </p>

                        <h3 className="text-xl font-semibold text-gray-800 mb-3 mt-4">
                            4.2 Data Retention
                        </h3>
                        <p className="text-gray-700 leading-relaxed">
                            We retain your data for as long as your account is active or as needed to provide services. You may delete your models and training data at any time through your account dashboard.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            5. Data Sharing and Disclosure
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            We do not sell your personal information. We may share information only in the following circumstances:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>With your explicit consent</li>
                            <li>With service providers who assist in operating our platform (under strict confidentiality agreements)</li>
                            <li>To comply with legal obligations or protect our rights</li>
                            <li>In connection with a business transfer or acquisition</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            6. Your Rights and Choices
                        </h2>
                        <p className="text-gray-700 leading-relaxed mb-3">
                            You have the right to:
                        </p>
                        <ul className="list-disc pl-6 text-gray-700 space-y-2">
                            <li>Access, update, or delete your personal information</li>
                            <li>Export your training data and models</li>
                            <li>Opt out of marketing communications</li>
                            <li>Request information about data we have collected</li>
                            <li>Lodge a complaint with a supervisory authority</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            7. Cookies and Tracking
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            We use cookies and similar technologies to maintain sessions, remember preferences, and analyze platform usage. You can control cookie preferences through your browser settings.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            8. Third-Party Services
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Our platform may integrate with third-party services for hosting infrastructure, analytics, and payment processing. These services have their own privacy policies, and we encourage you to review them.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            9. International Data Transfers
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your data in accordance with applicable laws.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            10. Children&apos;s Privacy
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            Our service is not intended for users under 18 years of age. We do not knowingly collect personal information from children.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            11. Changes to This Policy
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the &quot;Last Updated&quot; date.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                            12. Contact Us
                        </h2>
                        <p className="text-gray-700 leading-relaxed">
                            If you have questions about this privacy policy or our data practices, please contact us at:
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
