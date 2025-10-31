import { CSSProperties, useMemo, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./ui/accordion"
import { CheckIcon, HelpCircle, SettingsIcon, SpoolIcon, TargetIcon, TimerIcon, ZapIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Slider } from "./ui/slider";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { useModelStore } from "../lib/store";
import { useTrainingData } from "@/hooks/use-training-data";

interface FineTuneConfig {
    epochs: number;
    learningRate: number;
    loraRank: number;
    loraAlpha: number;
    loraDropout: number;
    batchSize: number;
    maxSeqLength?: number;
}

type PresetKey = 'quick' | 'balanced' | 'custom';

interface PresetData {
    name: string;
    icon: React.ReactNode;
    epochs: number | string;
    time: string;
    description: string;
    features: string[];
    style: CSSProperties
}

type Presets = Record<PresetKey, PresetData>;

const presets: Presets = {
    quick: {
        name: 'Quick & Fast',
        icon: <ZapIcon className="size-6" />,
        epochs: 3,
        time: '~10 min',
        description: 'Best for testing and prototypes',
        features: ['Fast iteration', 'Lower GPU cost', 'Good for experiments'],
        style: {
            background: `
                radial-gradient(circle at 20% 20%, rgba(100, 150, 255, 0.8) 0%, transparent 50%),
                radial-gradient(circle at 80% 80%, rgba(120, 180, 255, 0.6) 0%, transparent 50%),
                radial-gradient(circle at 40% 60%, rgba(140, 190, 255, 0.5) 0%, transparent 50%),
                linear-gradient(135deg, rgba(90, 150, 255, 0.7), rgba(130, 180, 255, 0.7))
              `
        }
    },
    balanced: {
        name: 'Balanced',
        icon: <TargetIcon className="size-6" />,
        epochs: 5,
        time: '~20 min',
        description: 'Best for production use',
        features: ['Optimized quality', 'Reliable results', 'Recommended for most'],
        style: {
            background: `
                radial-gradient(circle at 30% 30%, rgba(120, 180, 255, 0.8) 0%, transparent 50%),
                radial-gradient(circle at 70% 70%, rgba(150, 200, 255, 0.6) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, rgba(140, 190, 255, 0.5) 0%, transparent 60%),
                linear-gradient(135deg, rgba(110, 170, 255, 0.8), rgba(150, 200, 255, 0.8))
              `
        }
    },
    custom: {
        name: 'Precise Control',
        icon: <SettingsIcon className="size-6" />,
        epochs: 'Custom',
        time: 'Varies',
        description: 'Best for advanced users',
        features: ['Full customization', 'Fine-grained control', 'Expert settings'],
        style: {
            background: `
                radial-gradient(circle at 40% 40%, rgba(150, 174, 255, 0.7) 0%, transparent 50%),
                radial-gradient(circle at 60% 60%, rgba(180, 200, 255, 0.6) 0%, transparent 50%),
                linear-gradient(135deg, rgba(170, 183, 255, 0.8), rgba(190, 204, 255, 0.8))
              `
        }
    }
}

type ModelSize = '270M' | '600M' | '1B' | '1.5B' | '3B' | '4B' | '7B' | '8B';

const MODEL_SPEEDS: Record<ModelSize, {
    speedWith4bit: number;
    baseSpeed: number;
    memory4bit: number;
    memoryNoQuant: number
}> = {
    '270M': { baseSpeed: 0.35, speedWith4bit: 0.30, memoryNoQuant: 4, memory4bit: 3 },
    '600M': { baseSpeed: 0.65, speedWith4bit: 0.55, memoryNoQuant: 6, memory4bit: 4 },
    '1B': { baseSpeed: 0.85, speedWith4bit: 0.70, memoryNoQuant: 9, memory4bit: 5 },
    '1.5B': { baseSpeed: 1.15, speedWith4bit: 0.95, memoryNoQuant: 12, memory4bit: 7 },
    '3B': { baseSpeed: 1.85, speedWith4bit: 1.50, memoryNoQuant: 20, memory4bit: 11 },
    '4B': { baseSpeed: 2.35, speedWith4bit: 1.90, memoryNoQuant: 26, memory4bit: 14 },
    '7B': { baseSpeed: 3.80, speedWith4bit: 3.10, memoryNoQuant: 45, memory4bit: 20 },
    '8B': { baseSpeed: 4.20, speedWith4bit: 3.45, memoryNoQuant: 52, memory4bit: 22 }
}

function FineTuneSettings() {
    const { selectedModel } = useModelStore()
    const { data: trainingData = [], isLoading: isLoadingTrainingData } = useTrainingData()

    const [selectedPreset, setSelectedPreset] = useState<PresetKey>('quick');
    const [config, setConfig] = useState<FineTuneConfig>({
        epochs: 3,
        learningRate: 5e-5,
        loraRank: 8,
        loraAlpha: 16,
        loraDropout: 0.05,
        batchSize: 4
    });

    const trainingStats = useMemo(() => {
        const nonEmptyRows = trainingData.filter(
            row => row.input.trim() !== '' || row.output.trim() !== ''
        )

        const numExamples = nonEmptyRows.length

        if (numExamples === 0) {
            return {
                numExamples: 0,
                maxSeqLength: 512,
                avgSequenceLength: 256
            }
        }

        // Calculate sequence lengths for all examples
        // Using character-based approximation: ~4 characters per token
        const sequenceLengths = nonEmptyRows.map(row => {
            const inputTokens = Math.ceil(row.input.length / 4)
            const outputTokens = Math.ceil(row.output.length / 4)
            return inputTokens + outputTokens
        })

        const maxSeqLength = Math.max(...sequenceLengths)
        const totalLength = sequenceLengths.reduce((sum, len) => sum + len, 0)
        const avgSequenceLength = Math.round(totalLength / numExamples)

        return {
            numExamples,
            maxSeqLength,
            avgSequenceLength
        }
    }, [trainingData])

    const estimate = useMemo(() => {
        // Return default values if no training data or no model selected
        if (trainingStats.numExamples === 0 || !selectedModel || !selectedModel.params) {
            return {
                durationMinutes: 0,
                totalSteps: 0,
                stepsPerEpoch: 0,
                cost: 0,
                memoryEstimate: 0,
                memoryFits: true,
                secondsPerStep: 0,
            };
        }

        const modelSpec = MODEL_SPEEDS[selectedModel.params as ModelSize];
        const gradientAccumulation = 4
        const effectiveBatchSize = config.batchSize * gradientAccumulation;
        const stepsPerEpoch = Math.ceil(trainingStats.numExamples / effectiveBatchSize);
        const totalSteps = stepsPerEpoch * config.epochs;

        // Use configured max seq length, or average from data, with minimum of 256 tokens
        const seqLength = Math.max(config.maxSeqLength || trainingStats.avgSequenceLength, 256);
        const seqLengthFactor = seqLength / 256;
        const secondsPerStep = modelSpec.speedWith4bit * seqLengthFactor;

        const totalSeconds = totalSteps * secondsPerStep;
        const durationMinutes = Math.round(totalSeconds / 60);
        const cost = parseFloat(((totalSeconds / 3600) * 1.29).toFixed(2));

        const memoryEstimate = modelSpec.memory4bit + (effectiveBatchSize * seqLength * 4) / 1024 / 1024 / 1024;
        const memoryFits = memoryEstimate <= 24;

        return {
            durationMinutes,
            totalSteps,
            stepsPerEpoch,
            cost,
            memoryEstimate: parseFloat(memoryEstimate.toFixed(1)),
            memoryFits,
            secondsPerStep: parseFloat(secondsPerStep.toFixed(3)),
        };
    }, [config, selectedModel, trainingStats]);

    const handlePresetSelect = (preset: PresetKey) => {
        setSelectedPreset(preset);
        if (preset === 'quick') {
            setConfig({
                ...config,
                epochs: 3,
                learningRate: 5e-5,
                loraRank: 8,
                loraAlpha: 16,
                loraDropout: 0.05
            });
        } else if (preset === 'balanced') {
            setConfig({
                ...config,
                epochs: 5,
                learningRate: 2e-5,
                loraRank: 16,
                loraAlpha: 32,
                loraDropout: 0.05
            });
        }
    }

    return (
        <Accordion type="single" collapsible>
            <AccordionItem value="item-1">
                <AccordionTrigger className="group">
                    <div className="flex items-center gap-2 w-full">
                        <SpoolIcon className="size-4" />
                        <div className="group-hover:underline">Fine-tune Settings</div>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge
                                    className='rounded-lg flex gap-1 bg-blue-400 text-white ml-auto'
                                    variant='secondary'
                                >
                                    <TimerIcon />
                                    Estimated Duration:
                                    <div>{estimate.durationMinutes} minutes</div>
                                </Badge>
                            </TooltipTrigger>
                            <TooltipContent
                                arrowClassName="bg-white fill-white"
                                className="w-64 bg-white shadow-lg text-black"
                            >
                                Estimated based on your model size, number of training examples, and epochs selected. Larger models and more training data will take longer to fine-tune.
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </AccordionTrigger>
                <AccordionContent>
                    <div className="flex flex-col gap-1 mt-1">
                        <div className="grid grid-cols-3 gap-4">
                            {(Object.entries(presets) as [PresetKey, PresetData][]).map(([key, preset]) => (
                                <div
                                    key={key}
                                    onClick={() => handlePresetSelect(key)}
                                    className={`cursor-pointer rounded-lg p-3 transition-all border-2 box-border ${key === selectedPreset ? 'border-blue-400' : 'border-white'}`}
                                    style={preset.style}
                                >
                                    <div className="flex items-center mb-2 gap-2">
                                        <div className='text-white'>
                                            {preset.icon}
                                        </div>
                                        <h3 className="font-semibold text-white">
                                            {preset.name}
                                        </h3>
                                        {selectedPreset === key && (
                                            <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full ml-auto">
                                                Selected
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-white mb-2">
                                        <div>{preset.epochs} epochs</div>
                                        <div className="font-medium">{preset.time}</div>
                                    </div>
                                    <p className="text-sm text-white mb-2">
                                        {preset.description}
                                    </p>
                                    <ul className="space-y-1">
                                        {preset.features.map((feature, idx) => (
                                            <li key={idx} className="text-xs text-white flex items-center gap-1">
                                                <CheckIcon className="mr-1 size-4 p-1 rounded-full bg-blue-500" />
                                                {feature}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                        <AnimatePresence>
                            {selectedPreset === 'custom' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                                    className="flex flex-col gap-4 mt-4"
                                >
                                    <label className="text-sm font-medium">Advanced Settings</label>
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                                Training Epochs
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <HelpCircle className="size-3.5 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="max-w-xs">
                                                        The number of times the AI will study your training data. More epochs = better learning but takes longer. Think of it like studying for a test multiple times.
                                                    </TooltipContent>
                                                </Tooltip>
                                            </label>
                                            <Badge
                                                className='rounded-lg flex gap-1 bg-blue-400 text-white'
                                                variant='secondary'
                                            >
                                                {config.epochs}
                                            </Badge>
                                        </div>
                                        <div className="px-2 flex flex-col gap-2">
                                            <Slider
                                                min={1}
                                                max={10}
                                                step={1}
                                                value={[config.epochs]}
                                                onValueChange={(values: number[]) => {
                                                    setConfig({ ...config, epochs: values[0] })
                                                }}
                                            />
                                            <div className="relative text-xs text-gray-500 mt-2 h-4 mx-2">
                                                <span className="absolute" style={{ left: '0%', transform: 'translateX(0%)' }}>1 - Fast</span>
                                                <span className="absolute" style={{ left: '44.44%', transform: 'translateX(-50%)' }}>5 - Balanced</span>
                                                <span className="absolute" style={{ left: '100%', transform: 'translateX(-100%)', whiteSpace: 'nowrap' }}>10 - Thorough</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* LoRA Settings */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                LoRA Rank
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <HelpCircle className="size-3.5 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="w-64">
                                                        Controls how much of the model gets fine-tuned. Higher rank = model learns more details but needs more memory and time. Start with 16 for most cases.
                                                    </TooltipContent>
                                                </Tooltip>
                                            </label>
                                            <Select
                                                value={config.loraRank.toString()}
                                                onValueChange={(value) =>
                                                    setConfig({ ...config, loraRank: parseInt(value) })
                                                }
                                            >
                                                <SelectTrigger className="w-full shadow-none border-none focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-blue-50 focus-visible:border-blue-200 hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="border-none">
                                                    <SelectItem value="8">8 - Light</SelectItem>
                                                    <SelectItem value="16">16 - Balanced</SelectItem>
                                                    <SelectItem value="32">32 - High capacity</SelectItem>
                                                    <SelectItem value="64">64 - Maximum</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                LoRA Alpha
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <HelpCircle className="size-3.5 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="w-64">
                                                        Controls how strongly the fine-tuning affects the model. Usually set to 2x the rank value. Higher = more influence from your training data.
                                                    </TooltipContent>
                                                </Tooltip>
                                            </label>
                                            <Select
                                                value={config.loraAlpha.toString()}
                                                onValueChange={(value) =>
                                                    setConfig({ ...config, loraAlpha: parseInt(value) })
                                                }
                                            >
                                                <SelectTrigger className="w-full shadow-none border-none focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-blue-50 focus-visible:border-blue-200 hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="border-none">
                                                    <SelectItem value="16">16</SelectItem>
                                                    <SelectItem value="32">32 - Recommended</SelectItem>
                                                    <SelectItem value="64">64</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                                Dropout Rate
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <HelpCircle className="size-3.5 cursor-help" />
                                                    </TooltipTrigger>
                                                    <TooltipContent className="w-64">
                                                        Randomly "forgets" some learning during training to prevent over-memorization. Like practicing with distractions to build resilience. 0.05 is usually good.
                                                    </TooltipContent>
                                                </Tooltip>
                                            </label>
                                            <Select
                                                value={config.loraDropout.toString()}
                                                onValueChange={(value) =>
                                                    setConfig({ ...config, loraDropout: parseFloat(value) })
                                                }
                                            >
                                                <SelectTrigger className="w-full shadow-none border-none focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-blue-50 focus-visible:border-blue-200 hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="border-none">
                                                    <SelectItem value="0">0.0 - No dropout</SelectItem>
                                                    <SelectItem value="0.05">0.05 - Light</SelectItem>
                                                    <SelectItem value="0.1">0.1 - Medium</SelectItem>
                                                    <SelectItem value="0.2">0.2 - High</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </AccordionContent>
            </AccordionItem>
        </Accordion >
    )
}

export {
    FineTuneSettings
}