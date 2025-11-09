"use client"

import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { ArrowDownIcon, InfoIcon, Loader2Icon, RotateCcwIcon, SendIcon, Settings2Icon, TrashIcon, User2Icon, XCircleIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useChat, useCompletion } from '../../hooks/use-ai-sdk';
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
import { ShimmeringText } from "../ui/shadcn-io/shimmering-text"
import { interFont } from "../../lib/utils"
import { useModelStore } from "../../lib/store/model-store"
import { useAuth } from "../../contexts/auth-context"
import { ModelSelector } from "../model-selector"
import { useGetApiKey } from "../../hooks/use-fine-tune"
import SlidingTabs from "../ui/sliding-tab"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Slider } from "../ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip"

const playgroundTabs = [
    { id: 'chat', label: 'Chat' },
    { id: 'completion', label: 'Completion' },
]

const DEFAULT_MODEL_SETTINGS = {
    temperature: 1.0,
    topP: 1.0,
    topK: 50,
    maxTokens: 1024,
    frequencyPenalty: 0,
    presencePenalty: 0,
}

function ModelPlayground() {
    const { user } = useAuth()
    const [chatInput, setChatInput] = useState("")
    const [completionInput, setCompletionInput] = useState("")
    const {
        selectedModel,
        getSelectedModelCompany,
        selectedUserModel,
        setSelectedUserModel,
        _hasHydrated
    } = useModelStore();
    const { messages, setMessages, sendMessage, status: chatStatus, error: chatError } = useChat();
    const { completion, complete, setCompletion, isLoading: isCompleting, error: completionError } = useCompletion();
    const isLoading = chatStatus === 'streaming' || chatStatus === 'submitted' || isCompleting;

    const [isAtBottom, setIsAtBottom] = useState(true);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('chat')
    const scrollViewportRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLDivElement>(null);
    const [chatInputHeight, setChatInputHeight] = useState(0);

    const [temperature, setTemperature] = useState(DEFAULT_MODEL_SETTINGS.temperature);
    const [topP, setTopP] = useState(DEFAULT_MODEL_SETTINGS.topP);
    const [topK, setTopK] = useState(DEFAULT_MODEL_SETTINGS.topK);
    const [maxTokens, setMaxTokens] = useState(DEFAULT_MODEL_SETTINGS.maxTokens);
    const [frequencyPenalty, setFrequencyPenalty] = useState(DEFAULT_MODEL_SETTINGS.frequencyPenalty);
    const [presencePenalty, setPresencePenalty] = useState(DEFAULT_MODEL_SETTINGS.presencePenalty);

    const resetToDefaults = () => {
        setTemperature(DEFAULT_MODEL_SETTINGS.temperature);
        setTopP(DEFAULT_MODEL_SETTINGS.topP);
        setTopK(DEFAULT_MODEL_SETTINGS.topK);
        setMaxTokens(DEFAULT_MODEL_SETTINGS.maxTokens);
        setFrequencyPenalty(DEFAULT_MODEL_SETTINGS.frequencyPenalty);
        setPresencePenalty(DEFAULT_MODEL_SETTINGS.presencePenalty);
    };

    const selectedModelCompany = getSelectedModelCompany()

    const { data: apiKeyData, isFetching: isFetchingApiKey } = useGetApiKey(
        selectedUserModel?.apiKeyId,
        !!selectedUserModel?.apiKeyId
    )

    useEffect(() => {
        if (isAtBottom && messages.length > 0) {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [messages, isAtBottom]);

    useEffect(() => {
        const chatInputElement = chatInputRef.current;
        if (!chatInputElement) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setChatInputHeight(entry.contentRect.height);
            }
        });

        resizeObserver.observe(chatInputElement);

        // Set initial height
        setChatInputHeight(chatInputElement.offsetHeight);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    const handleSendMessage = async () => {
        if (isLoading) {
            return;
        }

        const token = await user?.getIdToken();

        const modelSettings = {
            temperature,
            topP,
            topK,
            maxTokens,
            frequencyPenalty,
            presencePenalty,
        };

        if (activeTab === 'chat') {
            chatPrompt(token, modelSettings)
            setChatInput('');
        } else {
            completePrompt(token, modelSettings)
        }
    }

    const chatPrompt = (
        token: string | undefined,
        modelSettings: {
            temperature: number,
            topP: number,
            topK: number,
            maxTokens: number,
            frequencyPenalty: number,
            presencePenalty: number,
        }
    ) => {
        if (selectedUserModel) {
            sendMessage({
                text: chatInput,
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: {
                    modelId: selectedUserModel.name,
                    apiKey: apiKeyData?.keySecret || '',
                    settings: modelSettings,
                }
            });
        } else {
            sendMessage({
                text: chatInput,
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: {
                    modelId: selectedModel.hf_id,
                    settings: modelSettings,
                }
            });
        }
    }

    const completePrompt = async (
        token: string | undefined,
        modelSettings: {
            temperature: number,
            topP: number,
            topK: number,
            maxTokens: number,
            frequencyPenalty: number,
            presencePenalty: number,
        }
    ) => {
        if (selectedUserModel) {
            complete(completionInput, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: {
                    modelId: selectedUserModel.name,
                    apiKey: apiKeyData?.keySecret || '',
                    settings: modelSettings,
                }
            })
        } else {
            complete(completionInput, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: {
                    modelId: selectedModel.hf_id,
                    settings: modelSettings,
                }
            })
        }
    }

    const handleScrollChange = ({ scrollTop, scrollHeight, clientHeight }: {
        scrollTop: number;
        scrollHeight: number;
        clientHeight: number;
    }) => {
        const threshold = 50;
        const isBottom = scrollHeight - scrollTop - clientHeight < threshold;
        setIsAtBottom(isBottom);
        setShowScrollButton(!isBottom);
    };

    const scrollToBottom = () => {
        const viewport = scrollViewportRef.current;
        if (viewport) {
            viewport.scrollTo({
                top: viewport.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    const onClear = () => {
        if (activeTab === 'chat') {
            setMessages([]);
        } else {
            setCompletionInput('');
            setCompletion('');
        }
    }

    const hasMessages = messages.length > 0;

    return (
        <div id="model-playground" className="h-screen w-screen flex flex-col relative">
            <div className="absolute top-0 left-0 right-0 z-30">
                <div className={`${interFont.className} px-6 py-4 flex flex-nowrap items-center gap-2 mr-12 sm:mr-0`}>
                    <h2 className="text-lg sm:text-2xl font-semibold whitespace-nowrap">Fine-tune</h2>
                    {
                        _hasHydrated && (
                            <div className="flex items-center text-md sm:text-xl font-semibold min-w-0 mr-0">
                                <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-5 mr-2 object-contain rounded flex-shrink-0" />
                                <span className="whitespace-nowrap overflow-hidden text-ellipsis">{selectedModel.name}</span>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* Messages container */}
            <AnimatePresence>
                {hasMessages && activeTab === "chat" && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="flex-1 relative max-w-xl mx-4 sm:mx-auto rounded-md overflow-hidden bg-blue-100 backdrop-blur-sm mt-16 shadow-xs"
                        style={{ maxHeight: chatInputHeight > 0 ? `calc(100vh - ${chatInputHeight + 96}px)` : '100vh' }}
                    >
                        <ScrollArea
                            className="h-full w-full"
                            viewportRef={scrollViewportRef}
                            onScrollChange={handleScrollChange}
                            fadingEdges={true}
                            fadingEdgeClassNameTop="h-16 bg-gradient-to-b from-blue-100 to-transparent"
                            fadingEdgeClassNameBottom="h-16 bg-gradient-to-t from-blue-100 to-transparent"
                        >
                            <div className="flex flex-col w-full max-w-xl sm:w-xl pt-8 pb-8 px-4 mx-auto gap-4">
                                {messages.map((message, index) => (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: index * 0.1 }}
                                        className={`flex gap-3 last:mb-8 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                    >
                                        {/* Avatar */}
                                        {
                                            message.role === 'user' ?
                                                <Avatar>
                                                    <AvatarImage src={user?.photoURL || undefined} alt="User Avatar" />
                                                    <AvatarFallback className="bg-gradient-to-tr from-blue-200 to-blue-400">
                                                        <User2Icon className="size-4" />
                                                    </AvatarFallback>
                                                </Avatar> :
                                                <Avatar>
                                                    <AvatarImage src={selectedModelCompany.company_logo} />
                                                </Avatar>
                                        }

                                        {/* Message bubble */}
                                        <div className={`flex flex-col max-w-[70%] ${message.role === 'user' ? 'items-end' : 'items-start'
                                            }`}>
                                            <div className={`rounded-2xl px-4 py-2.5 ${message.role === 'user'
                                                ? 'bg-blue-500 text-white rounded-tr-sm'
                                                : 'bg-gray-100 text-gray-900 rounded-tl-sm'
                                                }`}>
                                                {message.parts.map((part, i) => {
                                                    switch (part.type) {
                                                        case 'text':
                                                            return (
                                                                <div key={`${message.id}-${i}`} className="whitespace-pre-wrap text-sm leading-relaxed">
                                                                    {part.text?.trim()}
                                                                </div>
                                                            );
                                                    }
                                                })}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                                {
                                    isLoading && (
                                        <ShimmeringText
                                            text="Loading..."
                                            className="text-sm"
                                            duration={3}
                                        />
                                    )
                                }
                                {
                                    chatError && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex gap-3 items-start"
                                        >
                                            <div className="flex items-center gap-4 px-4 py-2.5 bg-red-100 rounded-lg text-red-800">
                                                <XCircleIcon className="size-4 flex-shrink-0" />
                                                <div className="flex flex-col gap-1">
                                                    <p className="font-medium text-xs">Error occurred</p>
                                                    <p className="text-xs">{chatError.message}</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                }
                            </div>
                        </ScrollArea>

                        {/* Scroll to bottom button */}
                        <AnimatePresence>
                            {showScrollButton && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 10 }}
                                    transition={{ duration: 0.2 }}
                                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20"
                                >
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={scrollToBottom}
                                        className="border-none rounded-full shadow-lg bg-white hover:bg-gray-50 border-gray-200"
                                    >
                                        <ArrowDownIcon className="size-4" />
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Completion container */}
            <AnimatePresence>
                {completion && activeTab === "completion" && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="absolute w-[calc(100%-2rem)] sm:w-xl rounded-md overflow-hidden bg-blue-100 backdrop-blur-sm left-1/2 -translate-x-1/2 shadow-xs"
                        style={{
                            bottom: chatInputHeight > 0 ? `${chatInputHeight + 32}px` : '100px',
                            height: '300px',
                            maxHeight: '40vh'
                        }}
                    >
                        <ScrollArea
                            className="h-full w-full mx-auto"
                            viewportRef={scrollViewportRef}
                            onScrollChange={handleScrollChange}
                            fadingEdges={true}
                            fadingEdgeClassNameTop="h-16 bg-gradient-to-b from-blue-100 to-transparent"
                            fadingEdgeClassNameBottom="h-16 bg-gradient-to-t from-blue-100 to-transparent"
                        >
                            <div className="flex flex-col w-full max-w-3xl py-4 px-4 mx-auto gap-4">
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                    className={`flex gap-3 flex-row`}
                                >
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                                        {completion}
                                    </div>
                                </motion.div>
                                {
                                    isLoading && (
                                        <ShimmeringText
                                            text="Loading..."
                                            className="text-sm"
                                            duration={3}
                                        />
                                    )
                                }
                                {
                                    completionError && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex gap-3 items-start"
                                        >
                                            <div className="flex items-center gap-4 px-4 py-2.5 bg-red-100 rounded-lg text-red-800">
                                                <XCircleIcon className="size-4 flex-shrink-0" />
                                                <div className="flex flex-col gap-1">
                                                    <p className="font-medium text-xs">Error occurred</p>
                                                    <p className="text-xs">{completionError.message}</p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )
                                }
                            </div>
                        </ScrollArea>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Chat Input container */}
            <motion.div
                ref={chatInputRef}
                className="absolute left-1/2 w-full flex items-center justify-center px-4 z-10"
                initial={false}
                animate={{
                    y: (hasMessages && activeTab === 'chat') || (completion && activeTab === 'completion') ? "calc(100vh - 100% - 1rem)" : "50vh",
                    x: "-50%",
                }}
                transition={{
                    duration: 0.6,
                    ease: [0.4, 0, 0.2, 1],
                }}
            >
                <div className="w-full max-w-xl bg-blue-100 rounded-md flex flex-col shadow-xs">
                    <div className="flex items-center justify-between">
                        <SlidingTabs
                            tabs={playgroundTabs}
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            className="bg-blue-100"
                            tabClassName="text-sm"
                            tabIndicatorClassName="bg-blue-200"
                        />
                        <div className="p-2 flex items-center gap-2">
                            <AnimatePresence>
                                {
                                    ((hasMessages && activeTab === 'chat') || (completion && activeTab === 'completion')) && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.8 }}
                                        >
                                            <div
                                                onClick={onClear}
                                                className="h-[28px] flex items-center justify-center px-2 py-1 text-sm font-medium rounded-md bg-blue-200 cursor-pointer hover:bg-blue-300/50"
                                            >
                                                <TrashIcon className="size-4" />
                                            </div>
                                        </motion.div>
                                    )
                                }
                            </AnimatePresence>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <div className="h-[28px] flex items-center justify-center px-2 py-1 text-sm font-medium rounded-md bg-blue-200 cursor-pointer hover:bg-blue-300/50">
                                        <Settings2Icon className="size-4" />
                                    </div>
                                </PopoverTrigger>
                                <PopoverContent align="end" className='border-none w-80'>
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-semibold text-xs">Model Settings</h3>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={resetToDefaults}
                                                className="h-7 px-2 text-xs gap-1.5"
                                            >
                                                <RotateCcwIcon className="size-3.5" />
                                                Reset
                                            </Button>
                                        </div>

                                        {/* Temperature */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Temperature</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Controls randomness in the output. Lower values (0-0.5) make responses more focused and deterministic. Higher values (1-2) increase creativity and variability.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{temperature.toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                value={[temperature]}
                                                onValueChange={(values) => setTemperature(values[0])}
                                                min={0}
                                                max={2}
                                                step={0.01}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Top P */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Top P</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Nucleus sampling: only considers tokens whose cumulative probability adds up to this value. Lower values (0.1-0.5) focus on likely tokens, higher values (0.9-1) allow more diversity.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{topP.toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                value={[topP]}
                                                onValueChange={(values) => setTopP(values[0])}
                                                min={0}
                                                max={1}
                                                step={0.01}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Top K */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Top K</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Limits the model to consider only the top K most likely tokens. Lower values (10-20) make output more predictable, higher values (50-100) allow more variety.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{topK}</span>
                                            </div>
                                            <Slider
                                                value={[topK]}
                                                onValueChange={(values) => setTopK(Math.round(values[0]))}
                                                min={1}
                                                max={100}
                                                step={1}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Max Tokens */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Max Tokens</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Maximum number of tokens (words/subwords) in the model&apos;s response. One token ≈ 4 characters in English. Set lower for concise responses, higher for detailed ones.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{maxTokens}</span>
                                            </div>
                                            <Slider
                                                value={[maxTokens]}
                                                onValueChange={(values) => setMaxTokens(Math.round(values[0]))}
                                                min={1}
                                                max={4096}
                                                step={1}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Frequency Penalty */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Frequency Penalty</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Reduces the likelihood of repeating the same words or phrases. Positive values (0-2) discourage repetition, negative values (-2-0) encourage it. 0 means no penalty.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{frequencyPenalty.toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                value={[frequencyPenalty]}
                                                onValueChange={(values) => setFrequencyPenalty(values[0])}
                                                min={-2}
                                                max={2}
                                                step={0.01}
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Presence Penalty */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <label className="text-xs font-medium">Presence Penalty</label>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <InfoIcon className="size-3.5 text-muted-foreground cursor-help" />
                                                        </TooltipTrigger>
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            Encourages the model to talk about new topics. Positive values (0-2) promote discussing new subjects, negative values (-2-0) allow revisiting topics. 0 means no penalty.
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                                <span className="text-xs text-muted-foreground">{presencePenalty.toFixed(2)}</span>
                                            </div>
                                            <Slider
                                                value={[presencePenalty]}
                                                onValueChange={(values) => setPresencePenalty(values[0])}
                                                min={-2}
                                                max={2}
                                                step={0.01}
                                                className="w-full"
                                            />
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                    <Textarea
                        className="resize-none py-3 focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] shadow-none"
                        placeholder={activeTab === 'chat' ? "Chat with your model..." : "Enter your prompt for completion..."}
                        value={activeTab === 'chat' ? chatInput : completionInput}
                        onChange={(e) => activeTab === 'chat' ? setChatInput(e.target.value) : setCompletionInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        disabled={isCompleting && activeTab === 'completion'}
                    />
                    <div className="px-3 py-2 flex sm:items-center gap-2">
                        <ModelSelector
                            onBaseModelChange={() => {
                                setMessages([])
                            }}
                            onModelChange={(value) => {
                                setMessages([])
                                setSelectedUserModel(value)
                            }}
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            className="border-none h-9 flex self-end sm:self-center items-center justify-center ml-auto"
                            disabled={chatInput.trim() === "" || isLoading || isFetchingApiKey}
                            onClick={handleSendMessage}
                        >
                            {
                                isLoading || isFetchingApiKey ?
                                    <Loader2Icon className="animate-spin" /> :
                                    <SendIcon />
                            }
                        </Button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

export {
    ModelPlayground
}