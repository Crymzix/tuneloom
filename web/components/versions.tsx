import { AlertCircle, CheckCircle2, Loader2, PackageIcon, StarIcon } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty"
import { ScrollArea } from "./ui/scroll-area"
import { Skeleton } from "./ui/skeleton"
import { useModelVersions, useUserModelsByBaseModel, useActivateVersion } from "../hooks/use-fine-tune"
import { formatDate } from "../lib/utils"
import { ModelVersionStatus } from "../lib/fine-tune-jobs"
import { useModelStore } from "../lib/store"
import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"

interface VersionsProps {
    modelId?: string
}

function Versions({ modelId }: VersionsProps) {
    const { selectedModel } = useModelStore()
    const { data: userModels = [], isLoading: loadingUserModels } = useUserModelsByBaseModel(selectedModel?.hf_id || '')
    const { data: versions = [], isLoading: loadingVersions } = useModelVersions(modelId)
    const activateVersion = useActivateVersion()

    const currentModel = useMemo(() => {
        return userModels.find(model => model.id === modelId)
    }, [userModels, modelId])

    const handleActivateVersion = (versionId: string) => {
        if (!modelId) {
            return
        }
        activateVersion.mutate({ modelId, versionId })
    }

    const getStatusIcon = (status: ModelVersionStatus) => {
        switch (status) {
            case 'ready':
                return <CheckCircle2 className="size-4 text-green-600" />
            case 'building':
                return <Loader2 className="size-4 text-blue-600 animate-spin" />
            case 'failed':
                return <AlertCircle className="size-4 text-red-600" />
        }
    }

    const getStatusBadge = (status: ModelVersionStatus) => {
        const baseClasses = "text-xs font-medium px-2 py-1 rounded-md"
        switch (status) {
            case 'ready':
                return <span className={`${baseClasses} bg-green-100 text-green-700`}>Ready</span>
            case 'building':
                return <span className={`${baseClasses} bg-blue-100 text-blue-700`}>Building</span>
            case 'failed':
                return <span className={`${baseClasses} bg-red-100 text-red-700`}>Failed</span>
        }
    }

    return (
        <ScrollArea className="h-[calc(100vh-274px)]">
            <div className="space-y-0">
                {versions.map((version, index) => (
                    <div
                        key={version.id}
                        className={`group p-6 first:border-none border-t hover:bg-muted/30 transition-colors ${index === versions.length - 1 ? '' : ''
                            }`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            {/* Left side - Version info */}
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div>
                                        <h4 className="text-sm">
                                            Version {version.versionNumber} of <span className="font-bold">{version.modelName}</span>
                                        </h4>
                                        <p className="text-xs text-muted-foreground">
                                            Based on {version.baseModel}
                                        </p>
                                    </div>
                                    <div className="ml-auto flex flex-col gap-2 h-full">
                                        <div className='flex items-center gap-2'>
                                            {getStatusIcon(version.status)}
                                            {getStatusBadge(version.status)}
                                        </div>
                                    </div>
                                </div>

                                {/* Metrics for ready versions */}
                                {version.status === 'ready' && version.metrics && (
                                    <div className="flex gap-4 text-xs text-muted-foreground">
                                        {version.metrics.finalLoss !== undefined && (
                                            <span>Loss: {version.metrics.finalLoss.toFixed(4)}</span>
                                        )}
                                        {version.metrics.trainRuntime !== undefined && (
                                            <span>Runtime: {Math.round(version.metrics.trainRuntime)}s</span>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-4 text-xs text-muted-foreground items-center h-[24px]">
                                    <span>Created: {formatDate(version.createdAt)}</span>
                                    {version.readyAt && (
                                        <span>Ready: {formatDate(version.readyAt)}</span>
                                    )}
                                    {
                                        currentModel?.activeVersionId === version.id ?
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-md bg-sky-100 text-sky-700 text-center ml-auto">
                                                        <StarIcon className="size-3" />
                                                        Active
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    This version is currently deployed
                                                </TooltipContent>
                                            </Tooltip> :
                                            version.status === 'ready' && (
                                                <button
                                                    onClick={() => handleActivateVersion(version.id)}
                                                    disabled={activateVersion.isPending}
                                                    className="cursor-pointer invisible group-hover:visible flex items-center gap-2 text-xs font-medium px-2 py-1 rounded-md bg-sky-100 hover:bg-sky-200 text-sky-700 text-center ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {activateVersion.isPending ? (
                                                        <Loader2 className="size-3 animate-spin" />
                                                    ) : (
                                                        <StarIcon className="size-3" />
                                                    )}
                                                    Activate
                                                </button>
                                            )
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Loading state */}
                {loadingVersions && (
                    <>
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="p-6 border-t first:border-none">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 space-y-3">
                                        <div className="flex items-center gap-3">
                                            <div className="space-y-2">
                                                <Skeleton className="h-4 w-16" />
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

                {/* Empty state - no model selected */}
                {!loadingVersions && !modelId && (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <PackageIcon />
                            </EmptyMedia>
                            <EmptyTitle>No model selected</EmptyTitle>
                            <EmptyDescription>
                                Select a model above to view its versions
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}

                {/* Empty state - no versions yet */}
                {!loadingVersions && modelId && versions.length === 0 && (
                    <Empty>
                        <EmptyHeader>
                            <EmptyMedia variant="icon">
                                <PackageIcon />
                            </EmptyMedia>
                            <EmptyTitle>No versions yet</EmptyTitle>
                            <EmptyDescription>
                                This model doesn't have any versions yet. Create a fine-tune job to generate the first version.
                            </EmptyDescription>
                        </EmptyHeader>
                    </Empty>
                )}
            </div>
        </ScrollArea>
    )
}

export {
    Versions
}