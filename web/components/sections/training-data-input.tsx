
'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useCompletion } from '@ai-sdk/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, UploadIcon, SparklesIcon, Loader2, DownloadIcon, CheckCircle2, CloudUpload } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Textarea } from '../ui/textarea'
import { interFont } from '../../lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useModelStore } from '@/lib/store/model-store'
import { Badge } from '../ui/badge'
import { useTrainingData, useSaveTrainingData, TrainingDataRow } from '@/hooks/use-training-data'
import { useDebounce } from '@/hooks/use-debounce'
import { useRecaptcha } from '@/contexts/recaptcha-context'

function TrainingDataInput() {
    const { selectedModel } = useModelStore()

    const { data: loadedData = [], isLoading: isLoadingData } = useTrainingData()
    const saveTrainingDataMutation = useSaveTrainingData()

    const [rows, setRows] = useState<TrainingDataRow[]>([
        { input: '', output: '' },
        { input: '', output: '' },
        { input: '', output: '' },
    ])
    const [isGeneratePromptDialogOpen, setIsGeneratePromptDialogOpen] = useState(false)
    const [generationPrompt, setGenerationPrompt] = useState('')

    const fileInputRef = useRef<HTMLInputElement>(null)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const hasInitializedRef = useRef(false)
    const { executeRecaptcha } = useRecaptcha()

    const { complete, completion, isLoading } = useCompletion({
        api: '/api/generate-training-data',
    })

    const debouncedRows = useDebounce(rows, 1000)

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollAreaRef.current,
        estimateSize: () => 56, // Estimated height of each row in pixels
        overscan: 5, // Number of items to render outside of the visible area
    })

    const dataCount = useMemo(() => {
        return rows.filter(row => row.input.trim() !== '' || row.output.trim() !== '').length
    }, [rows])

    const saveStatus = useMemo(() => {
        if (saveTrainingDataMutation.isPending) {
            return 'saving'
        }
        if (saveTrainingDataMutation.isSuccess && !saveTrainingDataMutation.isPending) {
            return 'saved'
        }
        return 'idle'
    }, [saveTrainingDataMutation.isPending, saveTrainingDataMutation.isSuccess])

    useEffect(() => {
        if (!isLoadingData && loadedData.length > 0) {
            setRows(loadedData)
            hasInitializedRef.current = true
        } else if (!isLoadingData && loadedData.length === 0 && !hasInitializedRef.current) {
            // Only reset to empty if we've never initialized
            setRows([
                { input: '', output: '' },
                { input: '', output: '' },
                { input: '', output: '' },
            ])
            hasInitializedRef.current = true
        }
    }, [loadedData, isLoadingData])

    useEffect(() => {
        hasInitializedRef.current = false
    }, [selectedModel?.hf_id])

    useEffect(() => {
        if (hasInitializedRef.current && !isLoadingData) {
            saveTrainingDataMutation.mutate(debouncedRows)
        }
    }, [debouncedRows])

    useEffect(() => {
        if (saveStatus === 'saved') {
            const timeout = setTimeout(() => {
                saveTrainingDataMutation.reset()
            }, 2000)
            return () => clearTimeout(timeout)
        }
    }, [saveStatus])

    useEffect(() => {
        if (!isLoading && completion) {
            setGeneratedData()
        }
    }, [completion, isLoading])

    const setGeneratedData = () => {
        try {
            const generatedData = JSON.parse(completion)
            // Validate and transform the data
            if (Array.isArray(generatedData)) {
                const newRows: TrainingDataRow[] = generatedData.map((item) => ({
                    input: item.input || '',
                    output: item.output || ''
                }))

                // Clear existing rows if they are empty
                const hasEmptyRows = rows.every(row => !row.input && !row.output)
                if (hasEmptyRows) {
                    setRows(newRows)
                } else {
                    setRows([...rows, ...newRows])
                }
                setIsGeneratePromptDialogOpen(false)
                toast.success('Training data generated', {
                    description: `Successfully generated ${newRows.length} training examples`
                })
            }
        } catch (parseError) {
            // No-op: Invalid JSON
        }
    }

    const handleInputChange = (index: number, field: 'input' | 'output', value: string) => {
        setRows(rows.map((row, i) =>
            i === index ? { ...row, [field]: value } : row
        ))
    }

    const handleAddRow = () => {
        setRows([...rows, { input: '', output: '' }])

        // Scroll to the bottom after adding the row
        setTimeout(() => {
            rowVirtualizer.scrollToIndex(rows.length, {
                align: 'end',
                behavior: 'smooth'
            })
        }, 50)
    }

    const handleDeleteRow = (index: number) => {
        if (rows.length > 1) {
            setRows(rows.filter((row, i) => i !== index))
        }
    }

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) {
            return
        }

        const reader = new FileReader()
        reader.onload = (e) => {
            const text = e.target?.result as string
            try {
                let parsedData: TrainingDataRow[] = []

                if (file.name.endsWith('.json')) {
                    const jsonData = JSON.parse(text)
                    parsedData = Array.isArray(jsonData)
                        ? jsonData.map((item, idx) => ({
                            id: (idx + 1).toString(),
                            input: item.input || item.prompt || '',
                            output: item.output || item.completion || ''
                        }))
                        : []
                } else if (file.name.endsWith('.csv')) {
                    const lines = text.split('\n').filter(line => line.trim())
                    const hasHeader = lines[0].toLowerCase().includes('input') ||
                        lines[0].toLowerCase().includes('prompt')
                    const dataLines = hasHeader ? lines.slice(1) : lines

                    parsedData = dataLines.map((line, idx) => {
                        const [input, output] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
                        return {
                            id: (idx + 1).toString(),
                            input: input || '',
                            output: output || ''
                        }
                    })
                }

                if (parsedData.length > 0) {
                    setRows(parsedData)
                    toast.success('File uploaded successfully', {
                        description: `Loaded ${parsedData.length} training examples`
                    })
                }
            } catch (error) {
                console.error('Error parsing file:', error)
                toast.error('Error parsing file', {
                    description: 'Please check the file format and try again.'
                })
            }
        }
        reader.readAsText(file)
    }

    const handleGeneratePrompt = async () => {
        if (!generationPrompt.trim()) {
            toast.error('Missing description', {
                description: 'Please provide a description for the training data generation.'
            })
            return
        }

        const recaptchaToken = await executeRecaptcha();
        if (!recaptchaToken) {
            toast.error('reCAPTCHA verification failed', {
                description: 'Please try again.'
            });
            return;
        }

        try {
            await complete(generationPrompt, {
                body: {
                    recaptchaToken,
                }
            })
        } catch (error) {
            console.error('Error generating training data:', error)
            toast.error('Generation failed', {
                description: 'Error generating training data. Please try again.'
            })
        }
    }

    const handleDownloadCSV = () => {
        // Filter out empty rows
        const nonEmptyRows = rows.filter(row => row.input.trim() !== '' || row.output.trim() !== '')

        if (nonEmptyRows.length === 0) {
            toast.error('No data to download', {
                description: 'Please add some training data before downloading.'
            })
            return
        }

        // Create CSV content
        const csvHeader = 'input,output\n'
        const csvRows = nonEmptyRows.map(row => {
            // Escape quotes and wrap fields in quotes to handle commas and newlines
            const escapedInput = `"${row.input.replace(/"/g, '""')}"`
            const escapedOutput = `"${row.output.replace(/"/g, '""')}"`
            return `${escapedInput},${escapedOutput}`
        }).join('\n')

        const csvContent = csvHeader + csvRows

        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)

        link.setAttribute('href', url)
        link.setAttribute('download', `training-data-${selectedModel?.hf_id || 'export'}-${new Date().toISOString().split('T')[0]}.csv`)
        link.style.visibility = 'hidden'

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        URL.revokeObjectURL(url)

        toast.success('CSV downloaded', {
            description: `Downloaded ${nonEmptyRows.length} training examples`
        })
    }

    return (
        <div id="training-data-input" className="h-screen w-screen flex flex-col relative">
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
            <div className="absolute top-0 z-10 w-full bg-transparent">
                <div className={`${interFont.className} px-6 py-4`}>
                    <h2 className="text-2xl font-semibold">Training Data</h2>
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center relative">
                <div className="w-full max-w-4xl px-6 flex flex-col max-h-screen z-20 py-8">
                    <div className="mb-6 flex items-center flex-shrink-0">
                        <div className="flex items-center gap-3">
                            {
                                dataCount > 0 &&
                                <Badge
                                    className='rounded-lg flex gap-1 bg-blue-400 text-white'
                                    variant='secondary'
                                >
                                    {dataCount}
                                    <div>
                                        {dataCount === 1 ? 'example' : 'examples'}
                                    </div>
                                </Badge>
                            }
                            {saveStatus !== 'idle' && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    {saveStatus === 'saving' && (
                                        <>
                                            <CloudUpload className="h-4 w-4 animate-pulse" />
                                            <span>Saving...</span>
                                        </>
                                    )}
                                    {saveStatus === 'saved' && (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                                            <span className="text-green-600">Saved</span>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2 ml-auto">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.json"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className='relative'>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className='border-none'
                                            onClick={() => setIsGeneratePromptDialogOpen(true)}
                                        >
                                            <SparklesIcon />
                                            Generate
                                        </Button>
                                        {
                                            generationPrompt && completion && <div className='absolute size-3 -right-[1px] -top-[1px] bg-red-500 border-white border-1 rounded-full'></div>
                                        }
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className='w-xs'>
                                    <p>
                                        Generate training data using AI. This will create sample input-output pairs to help you get started.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => fileInputRef.current?.click()}
                                        className='border-none'
                                    >
                                        <UploadIcon />
                                        Upload CSV/JSON
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className='w-sm'>
                                    <p>
                                        Upload a CSV or JSON file containing training data. Ensure your CSV only has 2 columns: Input and Output. For JSON, use an array of objects with "input" and "output" fields.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleDownloadCSV}
                                        className='border-none'
                                    >
                                        <DownloadIcon />
                                        Download CSV
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className='w-xs'>
                                    <p>
                                        Download your training data as a CSV file. Only non-empty rows will be included in the export.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleAddRow}
                                className='bg-blue-100 text-black hover:bg-blue-200 border-none'
                            >
                                <Plus />
                                Add Row
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg bg-background shadow-sm overflow-hidden flex flex-col min-h-0 flex-1">
                        <div className="bg-muted/50 border-b flex-shrink-0">
                            <div className="w-full">
                                <div className="flex">
                                    <div className="w-[45%] p-2 px-2 text-left align-middle font-medium text-sm h-10 flex items-center">Input</div>
                                    <div className="w-[45%] p-2 px-2 text-left align-middle font-medium text-sm h-10 flex items-center">Output</div>
                                    <div className="w-[10%] p-2 px-2 text-center align-middle font-medium text-sm h-10 flex items-center justify-center">
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0">
                            <ScrollArea className="h-full" viewportRef={scrollAreaRef}>
                                <div
                                    style={{
                                        height: `${rowVirtualizer.getTotalSize()}px`,
                                        width: '100%',
                                        position: 'relative',
                                    }}
                                >
                                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                        const row = rows[virtualRow.index]
                                        return (
                                            <div
                                                key={virtualRow.index}
                                                className="flex border-b hover:bg-accent/30"
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    width: '100%',
                                                    height: `${virtualRow.size}px`,
                                                    transform: `translateY(${virtualRow.start}px)`,
                                                }}
                                            >
                                                <div className="w-[45%] p-2">
                                                    <Input
                                                        value={row.input}
                                                        onChange={(e) => handleInputChange(virtualRow.index, 'input', e.target.value)}
                                                        placeholder="Enter input text..."
                                                        className="w-full shadow-none bg-blue-50 border-none"
                                                    />
                                                </div>
                                                <div className="w-[45%] p-2">
                                                    <Input
                                                        value={row.output}
                                                        onChange={(e) => handleInputChange(virtualRow.index, 'output', e.target.value)}
                                                        placeholder="Enter expected output..."
                                                        className="w-full shadow-none bg-blue-50 border-none"
                                                    />
                                                </div>
                                                <div className="w-[10%] p-2 flex items-center justify-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-sm"
                                                        onClick={() => handleDeleteRow(virtualRow.index)}
                                                        disabled={rows.length === 1}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </div>
            </div>
            {
                isGeneratePromptDialogOpen && (
                    <Dialog
                        onOpenChange={setIsGeneratePromptDialogOpen}
                        open={isGeneratePromptDialogOpen}
                    >
                        <DialogContent className="sm:max-w-[425px] shadow-none border-none">
                            <DialogHeader>
                                <DialogTitle>Generate Training Data</DialogTitle>
                                <DialogDescription className='text-xs'>
                                    Describe the type of prompts and completions you want to generate for your training data.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4">
                                <Textarea
                                    className="bg-blue-50 resize-none py-3 focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] shadow-none"
                                    placeholder="Describe the type of prompts and completions you want to generate to fine-tune your model..."
                                    value={generationPrompt}
                                    onChange={(e) => setGenerationPrompt(e.target.value)}
                                    disabled={isLoading}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleGeneratePrompt();
                                        }
                                    }}
                                />
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className='border-none'
                                    >
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button
                                    type="submit"
                                    size="sm"
                                    className='bg-blue-100 text-black hover:bg-blue-200 border-none'
                                    onClick={handleGeneratePrompt}
                                    disabled={isLoading}
                                >
                                    {isLoading && <Loader2 className='animate-spin mr-2' />}
                                    {isLoading ? 'Generating...' : rows.length > 0 && completion ? 'Generate More' : 'Generate'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                )
            }
        </div>
    )
}

export {
    TrainingDataInput
}