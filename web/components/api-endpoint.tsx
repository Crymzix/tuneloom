import { CheckCircle2, Copy, Eye, EyeOff } from "lucide-react"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { useEffect, useState } from "react"
import { useModelStore } from "../lib/store"
import { useGetApiKey } from "../hooks/use-fine-tune"
import { motion } from "framer-motion"

function ApiEndpoint() {
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
    const [copiedApiKey, setCopiedApiKey] = useState<string | null>(null)
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const [pendingCopy, setPendingCopy] = useState<boolean>(false)

    const {
        selectedUserModel,
    } = useModelStore();

    const { data: apiKeyData, isFetching: isFetchingApiKey } = useGetApiKey(
        selectedUserModel?.apiKeyId,
        showApiKey && !!selectedUserModel?.apiKeyId
    )

    useEffect(() => {
        if (pendingCopy && apiKeyData?.keySecret && !isFetchingApiKey) {
            navigator.clipboard.writeText(apiKeyData.keySecret)
            setCopiedApiKey(selectedUserModel?.id || null)
            setTimeout(() => setCopiedApiKey(null), 2000)
            setPendingCopy(false)
        }
    }, [pendingCopy, apiKeyData, isFetchingApiKey, selectedUserModel?.id])

    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url)
        setCopiedUrl(url)
        setTimeout(() => setCopiedUrl(null), 2000)
    }

    const handleCopyApiKey = async () => {
        if (!selectedUserModel?.apiKeyId) {
            return
        }

        if (apiKeyData?.keySecret) {
            navigator.clipboard.writeText(apiKeyData.keySecret)
            setCopiedApiKey(selectedUserModel.id)
            setTimeout(() => setCopiedApiKey(null), 2000)
        } else {
            setPendingCopy(true)
            setShowApiKey(true)
        }
    }

    const toggleApiKeyVisibility = () => {
        setShowApiKey(!showApiKey)
    }

    const maskApiKey = (apiKey: string) => {
        if (!apiKey) {
            return ''
        }
        return `sk_${'•'.repeat(24)}`
    }

    const getApiKeyDisplay = () => {
        if (!selectedUserModel?.apiKeyId) return ''

        if (showApiKey) {
            if (isFetchingApiKey) {
                return 'Loading...'
            }
            if (apiKeyData?.keySecret) {
                return apiKeyData.keySecret
            }
            return 'Failed to load'
        }

        return maskApiKey(selectedUserModel.apiKeyId)
    }

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="space-y-4"
        >
            {/* API Endpoint */}
            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                    API Endpoint
                </p>
                <div className="flex items-center gap-2 p-2 bg-slate-800 border border-slate-700 rounded-md">
                    <code className="text-xs font-mono text-white flex-1 truncate">
                        {`${process.env.NEXT_PUBLIC_INFERENCE_URL}/v1/${selectedUserModel?.name || ''}`}
                    </code>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 hover:bg-slate-700"
                                onClick={() => handleCopyUrl(selectedUserModel?.inferenceUrl || '')}
                            >
                                {copiedUrl === selectedUserModel?.inferenceUrl ? (
                                    <CheckCircle2 className="size-3 text-green-400" />
                                ) : (
                                    <Copy className="size-3 text-slate-300" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            {copiedUrl === selectedUserModel?.inferenceUrl ? 'Copied!' : 'Copy URL'}
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {/* API Key */}
            {selectedUserModel?.apiKeyId && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                        API Key
                    </p>
                    <div className="flex items-center gap-2 p-2 bg-slate-800 border border-slate-700 rounded-md">
                        <code className="text-xs font-mono text-white flex-1 truncate">
                            {getApiKeyDisplay()}
                        </code>
                        <div className="flex gap-1">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="size-7 hover:bg-slate-700"
                                        onClick={() => toggleApiKeyVisibility()}
                                        disabled={isFetchingApiKey}
                                    >
                                        {showApiKey ? (
                                            <EyeOff className="size-3 text-slate-300" />
                                        ) : (
                                            <Eye className="size-3 text-slate-300" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    {showApiKey ? 'Hide' : 'Show'} API key
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        className="size-7 hover:bg-slate-700"
                                        onClick={() => handleCopyApiKey()}
                                        disabled={isFetchingApiKey}
                                    >
                                        {copiedApiKey === selectedUserModel?.id ? (
                                            <CheckCircle2 className="size-3 text-green-400" />
                                        ) : (
                                            <Copy className="size-3 text-slate-300" />
                                        )}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom">
                                    {copiedApiKey === selectedUserModel?.id ? 'Copied!' : 'Copy API key'}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
            )}

            <p className="text-xs text-muted-foreground">
                This model is compatible with any OpenAI SDK. Keep your API key secure.
            </p>
        </motion.div>
    )
}

export {
    ApiEndpoint
}