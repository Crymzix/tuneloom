'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { formatDate, interFont } from "../../lib/utils"
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import {
    Play,
    Loader2,
    CheckCircle2,
    Clock,
    AlertCircle,
    Copy,
    BrainIcon,
    Eye,
    EyeOff,
    XCircle,
    XIcon
} from 'lucide-react'
import { useModelStore } from '../../lib/store'
import { useAuth } from '../../contexts/auth-context'
import { AuthDialog } from '../auth-dialog'
import { FineTuneJob as FirestoreFineTuneJob } from '../../lib/fine-tune-jobs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../ui/empty'
import { Skeleton } from '../ui/skeleton'
import { Progress } from '../ui/progress'
import { ScrollArea } from '../ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useCheckModelName, useStartFineTune, useUserJobs, useUserModelsByBaseModel, useGetApiKey } from '../../hooks/use-fine-tune'
import { useDebounce } from '../../hooks/use-debounce'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { AnimatePresence, motion } from 'motion/react'
import { FineTuneSettings } from '../fine-tune-settings'

type JobStatus = 'running' | 'completed' | 'failed' | 'queued'

interface FineTuneJob {
    id: string
    modelName: string
    baseModel: string
    status: JobStatus
    progress: number
    createdAt: string
    completedAt?: string
}

// Convert Firestore job to component job format
function convertFirestoreJob(firestoreJob: FirestoreFineTuneJob): FineTuneJob {
    return {
        id: firestoreJob.id,
        modelName: firestoreJob.config.outputModelName,
        baseModel: firestoreJob.config.baseModel,
        status: firestoreJob.status,
        progress: firestoreJob.progress,
        createdAt: formatDate(firestoreJob.createdAt),
        completedAt: firestoreJob.completedAt ? formatDate(firestoreJob.completedAt) : undefined,
    }
}

function FineTune() {
    const { user } = useAuth()
    const [modelName, setModelName] = useState('')
    const [selectedUserModel, setSelectedUserModel] = useState<string>('')
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
    const [copiedApiKey, setCopiedApiKey] = useState<string | null>(null)
    const [showApiKey, setShowApiKey] = useState<boolean>(false)
    const [pendingCopy, setPendingCopy] = useState<boolean>(false)
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
    const { selectedModel, getSelectedModelCompany, _hasHydrated } = useModelStore();

    const selectedModelCompany = getSelectedModelCompany()
    const debouncedModelName = useDebounce(modelName, 500)

    const { data: userModels = [], isLoading: loadingUserModels } = useUserModelsByBaseModel(
        selectedModel?.hf_id || ''
    )

    const userModel = useMemo(() => {
        return userModels.find(model => model.id === selectedUserModel)
    }, [userModels, selectedUserModel])

    const { data: apiKeyData, isFetching: isFetchingApiKey } = useGetApiKey(
        userModel?.apiKeyId,
        showApiKey && !!userModel?.apiKeyId
    )

    const startFineTuneMutation = useStartFineTune()
    const {
        data: modelNameCheck,
        isLoading: isCheckingModelName,
        error: modelNameCheckError,
    } = useCheckModelName(debouncedModelName, debouncedModelName.length > 0)

    const { data: firestoreJobs = [], isLoading: loadingJobs } = useUserJobs()

    const jobs = useMemo(() => {
        return firestoreJobs.map(convertFirestoreJob)
    }, [firestoreJobs])

    const hasQueuedJobs = useMemo(() => {
        return jobs.some(job => job.status === 'queued')
    }, [jobs]);

    const hasRunningJobs = useMemo(() => {
        return jobs.some(job => job.status === 'running')
    }, [jobs]);

    const isStarting = startFineTuneMutation.isPending || hasQueuedJobs || hasRunningJobs

    const validateModelNameFormat = (name: string): { valid: boolean; error?: string } => {
        if (!name || name.length === 0) {
            return { valid: false, error: '' } // Empty is valid for initial state
        }

        if (name.length > 26) {
            return { valid: false, error: 'Model name must be 26 characters or less' }
        }

        // Check if starts or ends with hyphen
        if (name.startsWith('-') || name.endsWith('-')) {
            return { valid: false, error: 'Cannot start or end with a hyphen' }
        }

        // Check for consecutive hyphens
        if (name.includes('--')) {
            return { valid: false, error: 'Cannot contain consecutive hyphens' }
        }

        // Check if lowercase, alphanumeric, and hyphens only
        const validPattern = /^[a-z0-9-]+$/
        if (!validPattern.test(name)) {
            return { valid: false, error: 'Only lowercase letters, numbers, and hyphens allowed' }
        }

        return { valid: true }
    }

    const { modelNameStatus, modelNameError } = useMemo(() => {
        if (!modelName) {
            return { modelNameStatus: 'idle' as const, modelNameError: '' }
        }

        const formatValidation = validateModelNameFormat(modelName)
        if (!formatValidation.valid) {
            return {
                modelNameStatus: 'invalid' as const,
                modelNameError: formatValidation.error || '',
            }
        }

        if (debouncedModelName !== modelName) {
            return { modelNameStatus: 'checking' as const, modelNameError: '' }
        }

        if (isCheckingModelName) {
            return { modelNameStatus: 'checking' as const, modelNameError: '' }
        }

        if (modelNameCheckError) {
            return {
                modelNameStatus: 'invalid' as const,
                modelNameError: 'Failed to check availability',
            }
        }

        if (modelNameCheck) {
            if (modelNameCheck.available) {
                return { modelNameStatus: 'available' as const, modelNameError: '' }
            } else {
                return {
                    modelNameStatus: 'unavailable' as const,
                    modelNameError: 'This model name is already taken',
                }
            }
        }

        return { modelNameStatus: 'idle' as const, modelNameError: '' }
    }, [modelName, debouncedModelName, isCheckingModelName, modelNameCheck, modelNameCheckError])

    useEffect(() => {
        if (pendingCopy && apiKeyData?.keySecret && !isFetchingApiKey) {
            navigator.clipboard.writeText(apiKeyData.keySecret)
            setCopiedApiKey(userModel?.id || null)
            setTimeout(() => setCopiedApiKey(null), 2000)
            setPendingCopy(false)
        }
    }, [pendingCopy, apiKeyData, isFetchingApiKey, userModel?.id])

    const handleCopyUrl = (url: string) => {
        navigator.clipboard.writeText(url)
        setCopiedUrl(url)
        setTimeout(() => setCopiedUrl(null), 2000)
    }

    const handleCopyApiKey = async () => {
        if (!userModel?.apiKeyId) {
            return
        }

        if (apiKeyData?.keySecret) {
            navigator.clipboard.writeText(apiKeyData.keySecret)
            setCopiedApiKey(userModel.id)
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
        if (!userModel?.apiKeyId) return ''

        if (showApiKey) {
            if (isFetchingApiKey) {
                return 'Loading...'
            }
            if (apiKeyData?.keySecret) {
                return apiKeyData.keySecret
            }
            return 'Failed to load'
        }

        return maskApiKey(userModel.apiKeyId)
    }

    const handleStartFineTune = () => {
        if (user?.isAnonymous) {
            // Prompt user to sign up or sign in before starting fine-tuning.
            setIsAuthDialogOpen(true)
            return;
        }

        startFineTune()
    }

    const startFineTune = () => {
        if (!user || !selectedModel) {
            return;
        }

        startFineTuneMutation.mutate(
            {
                modelName: selectedUserModel ? undefined : modelName,
                modelId: selectedUserModel ? selectedUserModel : undefined,
                baseModel: selectedModel.hf_id,
            },
            {
                onSuccess: () => {
                    setModelName('');
                },
            }
        );
    }

    const getStatusIcon = (status: JobStatus) => {
        switch (status) {
            case 'completed':
                return <CheckCircle2 className="size-4 text-green-600" />
            case 'running':
                return <Loader2 className="size-4 text-blue-600 animate-spin" />
            case 'failed':
                return <AlertCircle className="size-4 text-red-600" />
            case 'queued':
                return <Clock className="size-4 text-gray-500" />
        }
    }

    const getStatusBadge = (status: JobStatus) => {
        const baseClasses = "text-xs font-medium px-2 py-1 rounded-md"
        switch (status) {
            case 'completed':
                return <span className={`${baseClasses} bg-green-100 text-green-700`}>Completed</span>
            case 'running':
                return <span className={`${baseClasses} bg-blue-100 text-blue-700`}>Running</span>
            case 'failed':
                return <span className={`${baseClasses} bg-red-100 text-red-700`}>Failed</span>
            case 'queued':
                return <span className={`${baseClasses} bg-gray-100 text-gray-700`}>Queued</span>
        }
    }

    return (
        <div id="fine-tune" className="min-h-screen w-screen flex flex-col relative">
            <div className="sticky top-0 z-30">
                <div className={`${interFont.className} px-6 py-4`}>
                    <h2 className="text-2xl font-semibold">Start Fine-tuning</h2>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div className="w-full max-w-5xl px-6 py-8 z-20">
                    <div className="space-y-8 pr-4">
                        {/* Start New Fine-tune Section */}
                        <div className="rounded-lg bg-background shadow-sm p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <h3 className="text-lg font-semibold">Fine-tune on</h3>
                                {
                                    _hasHydrated && (
                                        <div className="flex items-center text-lg font-semibold">
                                            <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-5 mr-1 object-contain rounded" />
                                            {selectedModel.name}
                                        </div>
                                    )
                                }
                            </div>

                            <div className="space-y-4">
                                {/* Model Name */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Create Model</label>
                                    <div className="relative">
                                        <Input
                                            placeholder="Enter a unique model name e.g., customer-support-v1"
                                            value={modelName}
                                            onChange={(e) => setModelName(e.target.value.toLowerCase())}
                                            className={`shadow-none bg-blue-50 focus-visible:border-blue-200 border-none pr-10 ${modelNameStatus === 'invalid' || modelNameStatus === 'unavailable'
                                                ? 'border-red-300 focus-visible:border-red-300'
                                                : modelNameStatus === 'available'
                                                    ? 'border-green-300 focus-visible:border-green-300'
                                                    : ''
                                                }`}
                                            maxLength={26}
                                            disabled={!!selectedUserModel}
                                        />
                                        {/* Status Icon */}
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            {modelNameStatus === 'checking' && (
                                                <Loader2 className="size-4 text-blue-500 animate-spin" />
                                            )}
                                            {modelNameStatus === 'available' && (
                                                <CheckCircle2 className="size-4 text-green-600" />
                                            )}
                                            {(modelNameStatus === 'invalid' || modelNameStatus === 'unavailable') && (
                                                <XCircle className="size-4 text-red-600" />
                                            )}
                                        </div>
                                    </div>
                                    {modelNameError && (
                                        <p className="text-xs text-red-600 flex items-center gap-1">
                                            <AlertCircle className="size-3" />
                                            {modelNameError}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                        Lowercase letters, numbers, and hyphens only (max 26 characters)
                                    </p>
                                </div>

                                {/* Models Selector */}
                                {userModels.length > 0 && (
                                    <>
                                        <div className='flex items-center w-full gap-6'>
                                            <div className='flex-1 w-full h-[1px] bg-border' />
                                            <div className='text-sm font-semibold'>OR</div>
                                            <div className='flex-1 w-full h-[1px] bg-border' />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium">Select a Model</label>
                                            <div className='flex gap-2 items-center'>
                                                <Select value={selectedUserModel} onValueChange={setSelectedUserModel}>
                                                    <SelectTrigger className="min-w-52 shadow-none border-none focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-blue-50 focus-visible:border-blue-200 hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none">
                                                        <SelectValue placeholder="Select your model" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-72 border-none">
                                                        {userModels.map((model) => (
                                                            <SelectItem key={model.id} value={model.id}>
                                                                <span className="font-medium">{model.name}</span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {
                                                    selectedUserModel && (
                                                        <Button
                                                            variant="secondary"
                                                            size='icon-sm'
                                                            onClick={() => setSelectedUserModel('')}
                                                        >
                                                            <XIcon />
                                                        </Button>
                                                    )
                                                }
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Select one of your completed models to continue fine-tuning
                                            </p>
                                        </div>
                                        {/* Model URL and API Key */}
                                        <AnimatePresence>
                                            {userModel?.inferenceUrl && (
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
                                                        <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                                                            <code className="text-xs font-mono text-white flex-1 truncate">
                                                                {userModel?.inferenceUrl}
                                                            </code>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon-sm"
                                                                        className="size-7 hover:bg-slate-700"
                                                                        onClick={() => handleCopyUrl(userModel?.inferenceUrl || '')}
                                                                    >
                                                                        {copiedUrl === userModel?.inferenceUrl ? (
                                                                            <CheckCircle2 className="size-3 text-green-400" />
                                                                        ) : (
                                                                            <Copy className="size-3 text-slate-300" />
                                                                        )}
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="bottom">
                                                                    {copiedUrl === userModel?.inferenceUrl ? 'Copied!' : 'Copy URL'}
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </div>
                                                    </div>

                                                    {/* API Key */}
                                                    {userModel?.apiKeyId && (
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                API Key
                                                            </p>
                                                            <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
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
                                                                                {copiedApiKey === userModel?.id ? (
                                                                                    <CheckCircle2 className="size-3 text-green-400" />
                                                                                ) : (
                                                                                    <Copy className="size-3 text-slate-300" />
                                                                                )}
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="bottom">
                                                                            {copiedApiKey === userModel?.id ? 'Copied!' : 'Copy API key'}
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
                                            )}
                                        </AnimatePresence>
                                    </>
                                )}

                                <AnimatePresence>
                                    {
                                        (userModel || modelName) && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                transition={{ duration: 0.3, ease: 'easeInOut' }}
                                            >
                                                <FineTuneSettings />
                                            </motion.div>
                                        )
                                    }
                                </AnimatePresence>

                                {/* Start Button */}
                                <div className="flex justify-end pt-2">
                                    {
                                        isStarting ?
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        size="sm"
                                                        className='bg-green-500 text-white hover:bg-green-400 border-none'
                                                    >
                                                        <Loader2 className="size-4 animate-spin" />
                                                        {
                                                            hasRunningJobs ? 'Fine-tune in progress...' : (
                                                                hasQueuedJobs ? 'Job queued...' : 'Starting...'
                                                            )
                                                        }
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className='border-none' align='end'>
                                                    <div className="max-w-xs">
                                                        <h4 className="font-semibold mb-2 text-sm">Fine-tuning in progress</h4>
                                                        <p className="text-xs text-muted-foreground">
                                                            You have an ongoing fine-tuning job. Please wait for it to complete before starting a new one. This can take a while depending on the size of your dataset and the model.
                                                        </p>
                                                    </div>
                                                </PopoverContent>
                                            </Popover> :
                                            <Button
                                                size="sm"
                                                className='bg-green-500 text-white hover:bg-green-400 border-none'
                                                onClick={handleStartFineTune}
                                                disabled={modelNameStatus !== 'available' || !modelName || isStarting}
                                            >
                                                <Play className="size-4" />
                                                Start Fine-tuning
                                            </Button>
                                    }
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg bg-background shadow-sm overflow-hidden">
                            <div className="p-6 border-b flex items-center justify-between">
                                <div className="flex gap-2">
                                    <h3 className="text-lg font-semibold">Your Fine-tune Jobs</h3>
                                </div>
                            </div>

                            {/* Jobs List */}
                            <ScrollArea className="h-[calc(100vh-274px)]">
                                <div className="space-y-0">
                                    {jobs.map((job, index) => (
                                        <div
                                            key={job.id}
                                            className={`p-6 first:border-none border-t hover:bg-muted/30 transition-colors ${index === jobs.length - 1 ? '' : ''
                                                }`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                {/* Left side - Job info */}
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex items-center gap-3">
                                                        <div>
                                                            <h4 className="font-semibold text-sm">
                                                                {job.modelName}
                                                            </h4>
                                                            <p className="text-xs text-muted-foreground">
                                                                Based on {job.baseModel}
                                                            </p>
                                                        </div>
                                                        <div className='flex items-center gap-2 ml-auto'>
                                                            {getStatusIcon(job.status)}
                                                            {getStatusBadge(job.status)}
                                                        </div>
                                                    </div>

                                                    {/* Progress bar for running jobs */}
                                                    {job.status === 'running' && (
                                                        <div className="space-y-1">
                                                            <Progress value={job.progress * 100} />
                                                            <p className="text-xs text-muted-foreground">
                                                                {Math.round(job.progress * 100)}% complete
                                                            </p>
                                                        </div>
                                                    )}

                                                    <div className="flex gap-4 text-xs text-muted-foreground">
                                                        <span>Started: {job.createdAt}</span>
                                                        {job.completedAt && (
                                                            <span>Completed: {job.completedAt}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Loading state */}
                                    {loadingJobs && (
                                        <>
                                            {[1, 2, 3].map((i) => (
                                                <div key={i} className="p-6 border-t first:border-none">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 space-y-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className="space-y-2">
                                                                    <Skeleton className="h-4 w-32" />
                                                                    <Skeleton className="h-3 w-48" />
                                                                </div>
                                                                <div className="flex items-center gap-2 ml-auto">
                                                                    <Skeleton className="h-4 w-4 rounded-full" />
                                                                    <Skeleton className="h-6 w-20 rounded-md" />
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-4">
                                                                <Skeleton className="h-3 w-40" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </>
                                    )}

                                    {/* Empty state */}
                                    {!loadingJobs && jobs.length === 0 && (
                                        <Empty>
                                            <EmptyHeader>
                                                <EmptyMedia variant="icon">
                                                    <BrainIcon />
                                                </EmptyMedia>
                                                <EmptyTitle>No fine-tune jobs yet</EmptyTitle>
                                                <EmptyDescription>
                                                    Start your first fine-tuning job above to create a custom model trained on your data
                                                </EmptyDescription>
                                            </EmptyHeader>
                                        </Empty>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </div>
            </div>

            <AuthDialog
                open={isAuthDialogOpen}
                onOpenChange={setIsAuthDialogOpen}
                onSignInSuccess={startFineTune}
            />
        </div>
    )
}

export {
    FineTune
}