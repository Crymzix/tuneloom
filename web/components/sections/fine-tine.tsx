'use client'

import { useState } from 'react'
import { interFont } from "../../lib/utils"
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
    EyeOff
} from 'lucide-react'
import { useModelStore } from '../../lib/store'
import { auth } from '../../lib/firebase'
import { useAuth } from '../../contexts/auth-context'
import { AuthDialog } from '../auth-dialog'

// Mock data for fine-tune jobs
type JobStatus = 'running' | 'completed' | 'failed' | 'queued'

interface FineTuneJob {
    id: string
    modelName: string
    baseModel: string
    status: JobStatus
    progress: number
    createdAt: string
    completedAt?: string
    modelUrl?: string
    apiKey?: string
}

const MOCK_JOBS: FineTuneJob[] = [
    {
        id: 'ft-abc123',
        modelName: 'customer-support-v1',
        baseModel: 'Llama 3.1 8B',
        status: 'completed',
        progress: 100,
        createdAt: '2025-10-21 10:30 AM',
        completedAt: '2025-10-21 11:45 AM',
        modelUrl: 'https://api.modelsmith.ai/v1/models/ft-abc123',
        apiKey: 'ms_sk_abc123def456ghi789jkl012mno345'
    },
    {
        id: 'ft-def456',
        modelName: 'code-assistant-v2',
        baseModel: 'Mistral 7B',
        status: 'running',
        progress: 67,
        createdAt: '2025-10-22 09:15 AM'
    },
    {
        id: 'ft-ghi789',
        modelName: 'sentiment-analyzer',
        baseModel: 'Phi-3 Mini',
        status: 'queued',
        progress: 0,
        createdAt: '2025-10-22 10:00 AM'
    }
]

function FineTune() {
    const { user } = useAuth()
    const [modelName, setModelName] = useState('')
    const [jobs] = useState<FineTuneJob[]>(MOCK_JOBS)
    const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
    const [copiedApiKey, setCopiedApiKey] = useState<string | null>(null)
    const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({})
    const [showCodeExample, setShowCodeExample] = useState<Record<string, boolean>>({})
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
    const { selectedModel, getSelectedModelCompany, _hasHydrated } = useModelStore();

    const selectedModelCompany = getSelectedModelCompany()

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
        // Check if user is signed in.
        if (user?.isAnonymous) {
            // Prompt user to sign up or sign in before starting fine-tuning.
            setIsAuthDialogOpen(true)
            return;
        }

        // User is signed in, proceed with starting fine-tuning.
        startFineTune()
    }

    const startFineTune = () => {

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
                        <div className="border rounded-lg bg-background shadow-xs p-6">
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
                                    <Input
                                        placeholder="e.g., customer-support-v1"
                                        value={modelName}
                                        onChange={(e) => setModelName(e.target.value)}
                                        className="bg-blue-50 focus-visible:border-blue-200 border-none"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Give your fine-tuned model a unique identifier
                                    </p>
                                </div>

                                {/* Start Button */}
                                <div className="flex justify-end pt-2">
                                    <Button
                                        size="sm"
                                        className='bg-green-500 text-white hover:bg-green-400 border-none'
                                        onClick={handleStartFineTune}
                                    >
                                        <Play className="size-4" />
                                        Start Fine-tuning
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Fine-tune Jobs Section */}
                        <div className="border rounded-lg bg-background shadow-xs overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold">Your Fine-tune Jobs</h3>
                                </div>
                            </div>

                            {/* Jobs List */}
                            <div className="space-y-0">
                                {jobs.map((job, index) => (
                                    <div
                                        key={job.id}
                                        className={`p-6 border-t hover:bg-muted/30 transition-colors ${index === jobs.length - 1 ? '' : ''
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
                                                        <div className="w-full bg-gray-200 rounded-full h-2">
                                                            <div
                                                                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                                                style={{ width: `${job.progress}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-xs text-muted-foreground">
                                                            {job.progress}% complete
                                                        </p>
                                                    </div>
                                                )}

                                                {/* Model URL and API Key for completed jobs */}
                                                {job.status === 'completed' && job.modelUrl && (
                                                    <div className="space-y-4">
                                                        {/* API Endpoint */}
                                                        <div className="space-y-2">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                API Endpoint
                                                            </p>
                                                            <div className="flex items-center gap-2 p-3 bg-slate-800 border border-slate-700 rounded-md">
                                                                <code className="text-xs font-mono text-white flex-1 truncate">
                                                                    {job.modelUrl}
                                                                </code>
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon-sm"
                                                                            className="size-7 hover:bg-slate-700"
                                                                            onClick={() => handleCopyUrl(job.modelUrl!, job.id)}
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
    base_url="${job.modelUrl}",
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
    base_url="${job.modelUrl}",
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

                                {jobs.length === 0 && (
                                    <div className="p-12 text-center text-muted-foreground">
                                        <BrainIcon className="size-12 mx-auto mb-4 opacity-20" />
                                        <p>No fine-tune jobs yet</p>
                                        <p className="text-sm">Start your first fine-tune above</p>
                                    </div>
                                )}
                            </div>
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