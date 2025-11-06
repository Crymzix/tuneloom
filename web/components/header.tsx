import { InfoIcon, LogInIcon, LogOutIcon } from "lucide-react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useAuth } from "../contexts/auth-context"
import { pacificoFont } from "../lib/utils"
import { AuthDialog } from "./auth-dialog"
import { useState } from "react"

function Header() {
    const { user, signOut } = useAuth()
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)

    return (
        <header className="fixed top-0 w-full z-40 pointer-events-none">
            <div className="flex px-6 py-4 items-center gap-2 justify-end">
                <div className="flex items-center pointer-events-auto">
                    <img src="/logo.svg" alt="tuneloom" className="size-9 mr-2 object-contain" />
                    <div className={`${pacificoFont.className} text-3xl font-medium text-blue-400`}>
                        tuneloom
                    </div>
                </div>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-blue-500 hover:bg-blue-100 pointer-events-auto">
                            <InfoIcon />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                        FAQ
                    </TooltipContent>
                </Tooltip>
                {
                    user && !user.isAnonymous && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={signOut}
                                    variant="ghost" size="icon" className="text-blue-500 hover:bg-blue-100 pointer-events-auto">
                                    <LogOutIcon />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Sign out
                            </TooltipContent>
                        </Tooltip>
                    )
                }
                {
                    (!user || user.isAnonymous) && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    onClick={() => setIsAuthDialogOpen(true)}
                                    variant="ghost" size="icon" className="text-blue-500 hover:bg-blue-100 pointer-events-auto">
                                    <LogInIcon />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Sign In
                            </TooltipContent>
                        </Tooltip>
                    )
                }
            </div>
            <AuthDialog
                open={isAuthDialogOpen}
                onOpenChange={setIsAuthDialogOpen}
            />
        </header>
    )
}

export {
    Header
}