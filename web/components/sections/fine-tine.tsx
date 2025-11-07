'use client'

import { useState, useMemo } from 'react'
import { interFont } from "../../lib/utils"
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
    Play,
    Loader2,
    CheckCircle2,
    AlertCircle,
    XCircle,
    XIcon
} from 'lucide-react'
import { useModelStore } from '../../lib/store'
import { useAuth } from '../../contexts/auth-context'
import { AuthDialog } from '../auth-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useCheckModelName, useStartFineTune, useUserJobs, useUserModelsByBaseModel } from '../../hooks/use-fine-tune'
import { useDebounce } from '../../hooks/use-debounce'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { AnimatePresence } from 'motion/react'
import { FineTuneSettings } from '../fine-tune-settings'
import SlidingTabs from '../ui/sliding-tab'
import { FineTuneJobs } from '../fine-tune-jobs'
import { Versions } from '../versions'
import { useRecaptcha } from '../../contexts/recaptcha-context'
import { toast } from 'sonner'
import { Footer } from '../footer'
import { ApiEndpoint } from '../api-endpoint'

const fineTuneTabs = [
    { id: 'fine-tune-jobs', label: 'Fine-tune Jobs' },
    { id: 'versions', label: 'Versions' },
]

interface FineTuneConfig {
    epochs: number;
    learningRate: number;
    loraRank: number;
    loraAlpha: number;
    loraDropout: number;
    batchSize: number;
}

function FineTune() {
    const { user } = useAuth()
    const [modelName, setModelName] = useState('')
    const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false)
    const [activeTab, setActiveTab] = useState<string>('fine-tune-jobs')
    const [fineTuneConfig, setFineTuneConfig] = useState<FineTuneConfig>({
        epochs: 3,
        learningRate: 5e-5,
        loraRank: 8,
        loraAlpha: 16,
        loraDropout: 0.05,
        batchSize: 4
    })
    const { executeRecaptcha } = useRecaptcha()
    const {
        selectedModel,
        getSelectedModelCompany,
        selectedUserModel,
        setSelectedUserModel,
        _hasHydrated
    } = useModelStore();

    const selectedModelCompany = getSelectedModelCompany()
    const debouncedModelName = useDebounce(modelName, 500)

    const { data: userModels = [] } = useUserModelsByBaseModel(
        selectedModel?.hf_id || ''
    )

    const startFineTuneMutation = useStartFineTune()
    const {
        data: modelNameCheck,
        isLoading: isCheckingModelName,
        error: modelNameCheckError,
    } = useCheckModelName(debouncedModelName, debouncedModelName.length > 0)

    const { data: jobs = [] } = useUserJobs()

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

    const canStartFineTune = () => {
        if (selectedUserModel) {
            return true
        }

        if (modelNameStatus === 'available' && modelName) {
            return true
        }

        return false;
    }

    const handleStartFineTune = async () => {
        if (user?.isAnonymous) {
            // Prompt user to sign up or sign in before starting fine-tuning.
            setIsAuthDialogOpen(true)
            return;
        }

        await startFineTune()
    }

    const startFineTune = async () => {
        if (!user || !selectedModel) {
            return;
        }

        const recaptchaToken = await executeRecaptcha();
        if (!recaptchaToken) {
            toast.error('reCAPTCHA verification failed', {
                description: 'Please try again.'
            });
            return;
        }

        startFineTuneMutation.mutate(
            {
                modelName: selectedUserModel ? undefined : modelName,
                modelId: selectedUserModel ? selectedUserModel.id : undefined,
                baseModel: selectedModel.hf_id,
                settings: {
                    epochs: fineTuneConfig.epochs,
                    learningRate: fineTuneConfig.learningRate,
                    loraRank: fineTuneConfig.loraRank,
                    loraAlpha: fineTuneConfig.loraAlpha,
                    loraDropout: fineTuneConfig.loraDropout,
                },
                recaptchaToken,
            },
            {
                onSuccess: () => {
                    setModelName('');
                },
            }
        );
    }

    return (
        <div id="fine-tune" className="min-h-screen w-screen flex flex-col relative">
            <div className="sticky top-0 z-30 bg-gradient-to-b from-blue-50">
                <div className={`${interFont.className} px-6 py-4`}>
                    <h2 className="text-lg sm:text-2xl font-semibold">Start Fine-tuning</h2>
                </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex items-center justify-center overflow-hidden">
                <div className="w-full max-w-5xl px-6 py-8 z-20">
                    <div className="space-y-8">
                        {/* Start New Fine-tune Section */}
                        <div className="rounded-lg bg-background shadow-sm p-4 sm:p-6">
                            <div className="flex items-center gap-2 mb-6">
                                <h3 className="text-sm sm:text-lg font-semibold">Fine-tune on</h3>
                                {
                                    _hasHydrated && (
                                        <div className="flex items-center text-sm sm:text-lg font-semibold">
                                            <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-4 sm:size-5 mr-1 object-contain rounded" />
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
                                                <Select
                                                    value={selectedUserModel?.id || ''}
                                                    onValueChange={(value) => {
                                                        const model = userModels.find(m => m.id === value)
                                                        if (model) {
                                                            setSelectedUserModel(model);
                                                        } else {
                                                            setSelectedUserModel(null);
                                                        }
                                                    }}
                                                >
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
                                                            onClick={() => setSelectedUserModel(null)}
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
                                            {selectedUserModel?.inferenceUrl && (
                                                <ApiEndpoint />
                                            )}
                                        </AnimatePresence>
                                    </>
                                )}

                                <AnimatePresence>
                                    {
                                        (selectedUserModel || modelName) && (
                                            <FineTuneSettings config={fineTuneConfig} setConfig={setFineTuneConfig} />
                                        )
                                    }
                                </AnimatePresence>

                                {/* Start Button */}
                                <div className="flex justify-end pt-2">
                                    {
                                        hasRunningJobs || hasQueuedJobs ?
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        size="sm"
                                                        className='relative bg-green-500 text-white hover:bg-green-400 border-none overflow-hidden'
                                                    >
                                                        <div
                                                            className='animate-aurora absolute bg-[length:200%_auto] w-64 h-24'
                                                            style={{
                                                                backgroundImage: `linear-gradient(135deg, ${["#bfdbfe", "#2863caff", "#0070F3", "#38bdf8"].join(", ")}, ${"#bfdbfe"
                                                                    })`,
                                                                animationDuration: `10s`,
                                                            }}
                                                        >
                                                        </div>
                                                        <Loader2 className="size-4 animate-spin z-10" />
                                                        <div className='z-10'>
                                                            {
                                                                hasRunningJobs ? 'Fine-tune in progress...' : (
                                                                    hasQueuedJobs ? 'Job queued...' : 'Starting...'
                                                                )
                                                            }
                                                        </div>
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
                                                className='bg-green-500 relative text-white hover:bg-green-400 border-none overflow-hidden'
                                                onClick={handleStartFineTune}
                                                disabled={!canStartFineTune() || isStarting}
                                            >
                                                {
                                                    isStarting && (
                                                        <Loader2 className="size-4 animate-spin mr-2" />
                                                    )
                                                }
                                                <Play className="size-4" />
                                                Start Fine-tuning
                                            </Button>
                                    }
                                </div>
                            </div>
                        </div>

                        <div className="rounded-lg bg-background shadow-sm overflow-hidden">
                            <div className="p-4 sm:p-6 border-b flex items-center justify-between">
                                <SlidingTabs
                                    tabs={fineTuneTabs}
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                />
                            </div>
                            {activeTab === 'fine-tune-jobs' && <FineTuneJobs />}
                            {activeTab === 'versions' && <Versions modelId={selectedUserModel?.id} />}
                        </div>
                    </div>
                </div>
            </div>

            <AuthDialog
                open={isAuthDialogOpen}
                onOpenChange={setIsAuthDialogOpen}
                onSignInSuccess={startFineTune}
            />
            <Footer />
        </div>
    )
}

export {
    FineTune
}