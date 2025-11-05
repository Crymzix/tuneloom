"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
    User,
    onAuthStateChanged,
    signInAnonymously,
    signOut as firebaseSignOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useModelStore } from "../lib/store";
import { modelGroups } from "../lib/models";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const { setSelectedModel, setSelectedUserModel } = useModelStore()

    useEffect(() => {
        // Only run on client side
        if (typeof window === "undefined") {
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // User is already signed in
                setUser(currentUser);
                setLoading(false);
            } else {
                // No user signed in - sign in anonymously
                try {
                    const userCredential = await signInAnonymously(auth);
                    setUser(userCredential.user);
                } catch (error) {
                    console.error("Error signing in anonymously:", error);
                    setUser(null);
                } finally {
                    setLoading(false);
                }
            }
        });

        // Cleanup subscription
        return () => unsubscribe();
    }, []);

    const signOut = async () => {
        try {
            await firebaseSignOut(auth);
            setUser(null);
            setSelectedModel(modelGroups[0].models[0]);
            setSelectedUserModel(null);
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                loading,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
