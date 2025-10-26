import { InfoIcon, LogOutIcon } from "lucide-react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useAuth } from "../contexts/auth-context"

function Header() {
    const { user, signOut } = useAuth()

    return (
        <header className="fixed top-0 w-full z-40 pointer-events-none">
            <div className="w-full flex px-6 py-4 flex items-center gap-2 justify-end pointer-events-auto">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="text-blue-500 hover:bg-blue-100">
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
                                    variant="ghost" size="icon" className="text-blue-500 hover:bg-blue-100">
                                    <LogOutIcon />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                Sign out
                            </TooltipContent>
                        </Tooltip>
                    )
                }
            </div>
        </header>
    )
}

export {
    Header
}