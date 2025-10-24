"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GoogleAuthProvider, linkWithPopup, signInWithCredential, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/auth-context";
import { useModelStore } from "../lib/store";

interface AuthDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSignInSuccess?: () => void;
}

export function AuthDialog({ open, onOpenChange, onSignInSuccess }: AuthDialogProps) {
    const { selectedModel, getSelectedModelCompany, _hasHydrated } = useModelStore();
    const selectedModelCompany = getSelectedModelCompany()
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const provider = new GoogleAuthProvider();
            if (user?.isAnonymous) {
                try {
                    // Try to link the anonymous account with Google credentials
                    await linkWithPopup(user, provider);
                    console.log("Successfully linked anonymous account with Google");
                } catch (linkError: unknown) {
                    const error = linkError as { code?: string; credential?: any };

                    // If the credential is already in use, sign in with that existing account
                    if (error.code === "auth/credential-already-in-use") {
                        console.log("Account already exists, signing in with existing account");

                        const credential = GoogleAuthProvider.credentialFromError(error as any);
                        if (credential) {
                            await signInWithCredential(auth, credential);
                        } else {
                            await signInWithPopup(auth, provider);
                        }
                    } else if (error.code === "auth/email-already-in-use") {
                        console.log("Email already in use, signing in with existing account");
                        await signInWithPopup(auth, provider);
                    } else {
                        // Re-throw other errors
                        throw linkError;
                    }
                }
            } else {
                // Regular Google sign-in (not anonymous)
                await signInWithPopup(auth, provider);
            }

            onSignInSuccess?.();
            onOpenChange(false);
        } catch (err: unknown) {
            console.error("Error signing in with Google:", err);

            // Handle specific Firebase errors
            const error = err as { code?: string };
            if (error.code === "auth/popup-closed-by-user") {
                setError("Sign-in popup was closed. Please try again.");
            } else if (error.code === "auth/popup-blocked") {
                setError("Popup was blocked by your browser. Please enable popups and try again.");
            } else if (error.code === "auth/cancelled-popup-request") {
                // User cancelled, don't show error
                setError(null);
            } else if (error.code === "auth/provider-already-linked") {
                setError("This account is already linked with Google.");
            } else {
                setError("Failed to sign in with Google. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:min-w-md shadow-none border-none">
                <DialogHeader>
                    <DialogTitle>
                        <div className="flex items-center gap-2 mb-6">
                            <h3 className="text-lg font-semibold">Sign in to start fine-tuning</h3>
                            {
                                _hasHydrated && (
                                    <div className="flex items-center text-lg font-semibold">
                                        <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-5 mr-1 object-contain rounded" />
                                        {selectedModel.name}
                                    </div>
                                )
                            }
                        </div>
                    </DialogTitle>
                    <DialogDescription>
                        Sign in with your Google account to save your progress and access your data across devices.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4 py-4">
                    <Button
                        onClick={handleGoogleSignIn}
                        disabled={isLoading}
                        variant="outline"
                        className="max-w-md self-center border-none shadow-md"
                    >
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        {isLoading ? "Signing in..." : "Continue with Google"}
                    </Button>

                    {error && (
                        <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-md">
                            {error}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
