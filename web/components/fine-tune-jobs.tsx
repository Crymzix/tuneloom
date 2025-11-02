import { AlertCircle, BrainIcon, CheckCircle2, Clock, Loader2 } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty"
import { Progress } from "./ui/progress"
import { ScrollArea } from "./ui/scroll-area"
import { Skeleton } from "./ui/skeleton"
import { useUserJobs } from "../hooks/use-fine-tune"
import { formatDate } from "../lib/utils"
import { FineTuneJobStatus } from "../lib/fine-tune-jobs"
import { useModelStore } from "../lib/store"

function FineTuneJobs() {
    const {
        selectedUserModel,
    } = useModelStore();
    const { data: jobs = [], isLoading: loadingJobs } = useUserJobs({
        selectedUserModelName: selectedUserModel?.name
    })

    const getStatusIcon = (status: FineTuneJobStatus) => {
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

    const getStatusBadge = (status: FineTuneJobStatus) => {
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
                                            {job.config.outputModelName}
                                        </h4>
                                        <p className="text-xs text-muted-foreground">
                                            Based on {job.config.baseModel}
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
                                    <span>Started: {formatDate(job.createdAt)}</span>
                                    {job.completedAt && (
                                        <span>Completed: {formatDate(job.completedAt)}</span>
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
    )
}

export {
    FineTuneJobs
}