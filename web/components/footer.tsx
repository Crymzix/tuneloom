import Link from "next/link";

export function Footer() {
    return (
        <footer className="bg-blue-50/80 backdrop-blur-sm py-3 px-6 z-50">
            <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                    <span>&copy; {new Date().getFullYear()} tuneloom.</span>
                    <span className="hidden sm:inline">All rights reserved.</span>
                </div>
                <div className="flex items-center space-x-2">
                    <Link
                        href="/privacy-policy"
                        className="hover:text-white hover:bg-blue-200 rounded-xl px-2.5 py-1 transition-colors"
                    >
                        Privacy Policy
                    </Link>
                    <span className="text-gray-300">|</span>
                    <Link
                        href="/terms-of-service"
                        className="hover:text-white hover:bg-blue-200 rounded-xl px-2.5 py-1 transition-colors"
                    >
                        Terms of Service
                    </Link>
                </div>
            </div>
        </footer>
    )
}
