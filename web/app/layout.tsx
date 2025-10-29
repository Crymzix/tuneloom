import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ScrollProvider } from "@/contexts/scroll-context";
import { ScrollAreaWrapper } from "@/components/scroll-area-wrapper";
import { AuthProvider } from "@/contexts/auth-context";
import { QueryProvider } from "@/contexts/query-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "Tuneloom",
    description: "Quickly fine-tune language models with your own data.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
            >
                <QueryProvider>
                    <AuthProvider>
                        <ScrollProvider>
                            <ScrollAreaWrapper className="h-screen w-screen">
                                {children}
                            </ScrollAreaWrapper>
                        </ScrollProvider>
                    </AuthProvider>
                </QueryProvider>
                <Toaster />
            </body>
        </html>
    );
}
