export function Footer() {
    return (
        <footer className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-sm border-t border-gray-200 py-3 px-6 z-50">
            <div className="max-w-7xl mx-auto">
                <p className="text-xs text-gray-600 text-center">
                    This site is protected by reCAPTCHA and the Google{' '}
                    <a
                        href="https://policies.google.com/privacy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                    >
                        Privacy Policy
                    </a>{' '}
                    and{' '}
                    <a
                        href="https://policies.google.com/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 underline"
                    >
                        Terms of Service
                    </a>{' '}
                    apply.
                </p>
            </div>
        </footer>
    )
}
