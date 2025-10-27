'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
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
    Code2,
    Eye,
    EyeOff,
    XCircle
} from 'lucide-react'
import { useModelStore } from '../../lib/store'
import { useAuth } from '../../contexts/auth-context'
import { AuthDialog } from '../auth-dialog'
import { subscribeToUserJobs, FineTuneJob as FirestoreFineTuneJob } from '../../lib/fine-tune-jobs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '../ui/empty'
import { toast } from 'sonner'
import { Skeleton } from '../ui/skeleton'
import { Progress } from '../ui/progress'
import { ScrollArea } from '../ui/scroll-area'

type JobStatus = 'running' | 'completed' | 'failed' | 'queued'

interface FineTuneJob {
    id: string
    modelName: string
    baseModel: string
    status: JobStatus
    progress: number
    createdAt: string
    completedAt?: string
    inferenceUrl?: string
    apiKey?: string
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
        inferenceUrl: firestoreJob.inferenceUrl,
        apiKey: undefined, // API keys are not stored in Firestore for security
    }
}

type ModelNameStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'

function FineTune() {
    const { user } = useAuth()
    const [modelName, setModelName] = useState('')
    const [modelNameStatus, setModelNameStatus] = useState<ModelNameStatus>('idle')
    const [modelNameError, setModelNameError] = useState<string>('')
    const [jobs, setJobs] = useState<FineTuneJob[]>([])
    const [loadingJobs, setLoadingJobs] = useState(true)
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
    const [copiedApiKey, setCopiedApiKey] = useState<string | null>(null)
    const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
    const [showCodeExample, setShowCodeExample] = useState<Record<string, boolean>>({})
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
    const [isStarting, setIsStarting] = useState(false)
    const { selectedModel, getSelectedModelCompany, _hasHydrated } = useModelStore();

    const selectedModelCompany = getSelectedModelCompany()

    const hasQueuedJobs = useMemo(() => {
        return jobs.some(job => job.status === 'queued')
    }, [jobs]);

    const hasRunningJobs = useMemo(() => {
        return jobs.some(job => job.status === 'running')
    }, [jobs]);

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

    const checkModelNameAvailability = useCallback(async (name: string) => {
        if (!name) {
            setModelNameStatus('idle')
            setModelNameError('')
            return
        }

        const formatValidation = validateModelNameFormat(name)
        if (!formatValidation.valid) {
            setModelNameStatus('invalid')
            setModelNameError(formatValidation.error || '')
            return
        }

        setModelNameStatus('checking')
        setModelNameError('')

        try {
            const token = await user?.getIdToken()
            const response = await fetch(`/api/check-model-name?name=${encodeURIComponent(name)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            })

            const data = await response.json()

            if (!response.ok) {
                setModelNameStatus('invalid')
                setModelNameError(data.error || 'Failed to check availability')
                return
            }

            if (data.available) {
                setModelNameStatus('available')
                setModelNameError('')
            } else {
                setModelNameStatus('unavailable')
                setModelNameError('This model name is already taken')
            }
        } catch (error) {
            console.error('Error checking model name:', error)
            setModelNameStatus('invalid')
            setModelNameError('Failed to check availability')
        }
    }, [user])

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (modelName) {
                checkModelNameAvailability(modelName)
            } else {
                setModelNameStatus('idle')
                setModelNameError('')
            }
        }, 500) // 500ms debounce

        return () => clearTimeout(timeoutId)
    }, [modelName, checkModelNameAvailability])

    useEffect(() => {
        if (!user || user.isAnonymous) {
            setJobs([])
            setLoadingJobs(false)
            return
        }

        const unsubscribe = subscribeToUserJobs(
            user.uid,
            (firestoreJobs) => {
                const convertedJobs = firestoreJobs.map(convertFirestoreJob)
                setJobs(convertedJobs)
                setLoadingJobs(false)
            },
            (error) => {
                console.error('Error loading fine-tune jobs:', error)
                setLoadingJobs(false)
            }
        )

        return () => unsubscribe()
    }, [user])

    useEffect(() => {
        const hasActiveJob = jobs.some(job => job.status === 'queued' || job.status === 'running');
        setIsStarting(hasActiveJob);
    }, [jobs]);

    const handleCopyUrl = (url: string, jobId: string) => {
        navigator.clipboard.writeText(url)
        setCopiedUrl(jobId)
        setTimeout(() => setCopiedUrl(null), 2000)
    }

    const handleCopyApiKey = (apiKey: string, jobId: string) => {
        navigator.clipboard.writeText(apiKey)
        setCopiedApiKey(jobId)
        setTimeout(() => setCopiedApiKey(null), 2000)
    }

    const toggleApiKeyVisibility = (jobId: string) => {
        setShowApiKey(prev => ({ ...prev, [jobId]: !prev[jobId] }))
    }

    const toggleCodeExample = (jobId: string) => {
        setShowCodeExample(prev => ({ ...prev, [jobId]: !prev[jobId] }))
    }

    const maskApiKey = (apiKey: string) => {
        if (!apiKey) {
            return ''
        }
        return `${apiKey.slice(0, 8)}${'•'.repeat(24)}${apiKey.slice(-4)}`
    }

    const handleStartFineTune = () => {
        if (user?.isAnonymous) {
            // Prompt user to sign up or sign in before starting fine-tuning.
            setIsAuthDialogOpen(true)
            return;
        }

        startFineTune()
    }

    const startFineTune = async () => {
        if (!user || !selectedModel) {
            return;
        }

        setIsStarting(true);

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/fine-tune/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    modelName,
                    baseModel: selectedModel.hf_id,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                console.error('Error starting fine-tune:', data.error || data.message);
                toast.error('Failed to start fine-tune job', {
                    description: data.error || data.message || 'Please try again later.'
                });
                // Reset isStarting on error since no job was created
                setIsStarting(false);
                return;
            }

            setModelName('');
            toast.success('Fine-tune job started', {
                description: `Your model "${modelName}" is now queued for training`
            });
            // Note: isStarting will remain true and be managed by the useEffect
            // that monitors job statuses (queued/running jobs keep it true)
        } catch (error) {
            console.error('Error starting fine-tune:', error);
            toast.error('Failed to start fine-tune job', {
                description: 'An unexpected error occurred. Please try again.'
            });
            // Reset isStarting on error since no job was created
            setIsStarting(false);
        }
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
                                    <label className="text-sm font-medium">Model Name</label>
                                    <div className="relative">
                                        <Input
                                            placeholder="e.g., customer-support-v1"
                                            value={modelName}
                                            onChange={(e) => setModelName(e.target.value.toLowerCase())}
                                            className={`shadow-none bg-blue-50 focus-visible:border-blue-200 border-none pr-10 ${modelNameStatus === 'invalid' || modelNameStatus === 'unavailable'
                                                ? 'border-red-300 focus-visible:border-red-300'
                                                : modelNameStatus === 'available'
                                                    ? 'border-green-300 focus-visible:border-green-300'
                                                    : ''
                                                }`}
                                            maxLength={26}
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

                                {/* Start Button */}
                                <div className="flex justify-end pt-2">
                                    <Button
                                        size="sm"
                                        className='bg-green-500 text-white hover:bg-green-400 border-none'
                                        onClick={handleStartFineTune}
                                        disabled={modelNameStatus !== 'available' || !modelName || isStarting}
                                    >
                                        {isStarting ? (
                                            <>
                                                <Loader2 className="size-4 animate-spin" />
                                                {
                                                    hasRunningJobs ? 'Fine-tune in progress...' : (
                                                        hasQueuedJobs ? 'Job queued...' : 'Starting...'
                                                    )
                                                }
                                            </>
                                        ) : (
                                            <>
                                                <Play className="size-4" />
                                                Start Fine-tuning
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg bg-background shadow-sm overflow-hidden">
                            <div className="p-6 border-b">
                                <div className="flex items-center gap-2">
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

                                                    {/* Model URL and API Key for completed jobs */}
                                                    {job.status === 'completed' && job.inferenceUrl && (
                                                        <div className="space-y-4">
                                                            {/* API Endpoint */}
                                                            <div className="space-y-2">
                                                                <p className="text-xs font-medium text-muted-foreground">
                                                                    API Endpoint
                                                                </p>
                                                                <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                                                                    <code className="text-xs font-mono text-white flex-1 truncate">
                                                                        {job.inferenceUrl}
                                                                    </code>
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon-sm"
                                                                                className="size-7 hover:bg-slate-700"
                                                                                onClick={() => handleCopyUrl(job.inferenceUrl!, job.id)}
                                                                            >
                                                                                {copiedUrl === job.id ? (
                                                                                    <CheckCircle2 className="size-3 text-green-400" />
                                                                                ) : (
                                                                                    <Copy className="size-3 text-slate-300" />
                                                                                )}
                                                                            </Button>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent side="bottom">
                                                                            {copiedUrl === job.id ? 'Copied!' : 'Copy URL'}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </div>
                                                            </div>

                                                            {/* API Key */}
                                                            {job.apiKey && (
                                                                <div className="space-y-2">
                                                                    <p className="text-xs font-medium text-muted-foreground">
                                                                        API Key
                                                                    </p>
                                                                    <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                                                                        <code className="text-xs font-mono text-white flex-1 truncate">
                                                                            {showApiKey[job.id] ? job.apiKey : maskApiKey(job.apiKey)}
                                                                        </code>
                                                                        <div className="flex gap-1">
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon-sm"
                                                                                        className="size-7 hover:bg-slate-700"
                                                                                        onClick={() => toggleApiKeyVisibility(job.id)}
                                                                                    >
                                                                                        {showApiKey[job.id] ? (
                                                                                            <EyeOff className="size-3 text-slate-300" />
                                                                                        ) : (
                                                                                            <Eye className="size-3 text-slate-300" />
                                                                                        )}
                                                                                    </Button>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="bottom">
                                                                                    {showApiKey[job.id] ? 'Hide' : 'Show'} API key
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="icon-sm"
                                                                                        className="size-7 hover:bg-slate-700"
                                                                                        onClick={() => handleCopyApiKey(job.apiKey!, job.id)}
                                                                                    >
                                                                                        {copiedApiKey === job.id ? (
                                                                                            <CheckCircle2 className="size-3 text-green-400" />
                                                                                        ) : (
                                                                                            <Copy className="size-3 text-slate-300" />
                                                                                        )}
                                                                                    </Button>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent side="bottom">
                                                                                    {copiedApiKey === job.id ? 'Copied!' : 'Copy API key'}
                                                                                </TooltipContent>
                                                                            </Tooltip>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Usage Example */}
                                                            <div className="space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <p className="text-xs font-medium text-muted-foreground">
                                                                        OpenAI SDK Usage Example
                                                                    </p>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="h-6 px-2 text-xs"
                                                                        onClick={() => toggleCodeExample(job.id)}
                                                                    >
                                                                        <Code2 className="size-3 mr-1" />
                                                                        {showCodeExample[job.id] ? 'Hide' : 'Show'} Example
                                                                    </Button>
                                                                </div>

                                                                {showCodeExample[job.id] && (
                                                                    <div className="relative">
                                                                        <pre className="p-4 bg-slate-900 border border-slate-700 rounded-md overflow-x-auto text-xs">
                                                                            <code className="text-slate-200 font-mono">{`from openai import OpenAI

# Initialize the client with your fine-tuned model
client = OpenAI(
    base_url="${job.inferenceUrl}",
    api_key="${job.apiKey ? maskApiKey(job.apiKey) : 'your-api-key'}"
)

# Make a request to your fine-tuned model
response = client.chat.completions.create(
    model="${job.id}",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`}</code>
                                                                        </pre>
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button
                                                                                    variant="ghost"
                                                                                    size="icon-sm"
                                                                                    className="absolute top-2 right-2 size-7 hover:bg-slate-700"
                                                                                    onClick={() => {
                                                                                        const code = `from openai import OpenAI

# Initialize the client with your fine-tuned model
client = OpenAI(
    base_url="${job.inferenceUrl}",
    api_key="${job.apiKey || 'your-api-key'}"
)

# Make a request to your fine-tuned model
response = client.chat.completions.create(
    model="${job.id}",
    messages=[
        {"role": "user", "content": "Hello!"}
    ]
)

print(response.choices[0].message.content)`
                                                                                        navigator.clipboard.writeText(code)
                                                                                    }}
                                                                                >
                                                                                    <Copy className="size-3 text-slate-300" />
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent side="bottom">
                                                                                Copy code
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <p className="text-xs text-muted-foreground">
                                                                This model is compatible with any OpenAI SDK. Keep your API key secure.
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Timestamps */}
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
                                                <div key={i} className="p-6 border-t">
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