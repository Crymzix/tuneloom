"use client"

import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { ArrowDownIcon, Loader2Icon, SendIcon, User2Icon, XCircleIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useChat } from '@ai-sdk/react';
import { motion, AnimatePresence } from "motion/react";
import { ScrollArea } from "../ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar"
import { ShimmeringText } from "../ui/shadcn-io/shimmering-text"
import { interFont } from "../../lib/utils"
import { useModelStore } from "../../lib/store/model-store"
import { useAuth } from "../../contexts/auth-context"
import { ModelSelector } from "../model-selector"
import { useGetApiKey } from "../../hooks/use-fine-tune"
import { UserModel } from "../../lib/fine-tune-jobs"

function ChatInput() {
    const { user } = useAuth()
    const [chatInput, setChatInput] = useState("")
    const {
        selectedModel,
        getSelectedModelCompany,
        selectedUserModel,
        setSelectedUserModel,
        _hasHydrated
    } = useModelStore();
    const { messages, setMessages, sendMessage, status, error } = useChat();
    const isLoading = status === 'streaming' || status === 'submitted';

    const [isAtBottom, setIsAtBottom] = useState(true);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const scrollViewportRef = useRef<HTMLDivElement>(null);

    const selectedModelCompany = getSelectedModelCompany()

    const { data: apiKeyData, isFetching: isFetchingApiKey } = useGetApiKey(
        selectedUserModel?.apiKeyId,
        !!selectedUserModel?.apiKeyId
    )

    const handleSendMessage = async () => {
        const token = await user?.getIdToken();
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
                }
            });
        }
        setChatInput('');
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

    useEffect(() => {
        if (isAtBottom && messages.length > 0) {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [messages, isAtBottom]);

    const hasMessages = messages.length > 0;

    return (
        <div id="chat-input" className="h-screen w-screen flex flex-col relative">
            <div className="absolute top-0 left-0 right-0 z-30">
                <div className={`${interFont.className} px-6 py-4 flex items-center gap-2`}>
                    <h2 className="text-2xl font-semibold">Fine-tune</h2>
                    {
                        _hasHydrated && (
                            <div className="flex items-center text-xl font-semibold">
                                <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-5 mr-2 object-contain rounded" />
                                {selectedModel.name}
                            </div>
                        )
                    }
                </div>
            </div>

            {/* Messages container */}
            <AnimatePresence>
                {hasMessages && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="flex-1 relative"
                    >
                        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-white to-transparent pointer-events-none z-10" />
                        <ScrollArea
                            className="h-screen sm:w-1/2 mx-auto"
                            viewportRef={scrollViewportRef}
                            onScrollChange={handleScrollChange}
                        >
                            <div className="flex flex-col w-full max-w-3xl pt-8 pb-45 px-4 mx-auto gap-4">
                                {messages.map((message, index) => (
                                    <motion.div
                                        key={message.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.3, delay: index * 0.1 }}
                                        className={`flex gap-3 first:mt-8 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
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
                                    error && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="flex gap-3 items-start"
                                        >
                                            <div className="flex items-center gap-4 px-4 py-2.5 bg-red-100 rounded-lg text-red-800">
                                                <XCircleIcon className="size-4 flex-shrink-0" />
                                                <div className="flex flex-col gap-1">
                                                    <p className="font-medium text-xs">Error occurred</p>
                                                    <p className="text-xs">{error.message}</p>
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
                                    className="absolute bottom-45 left-1/2 -translate-x-1/2 z-20"
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
            <div className="absolute bottom-0 left-0 -z-10 right-0 h-32 bg-gradient-to-t from-white to-transparent pointer-events-none z-10" />

            <motion.div
                className="absolute left-1/2 w-full flex items-center justify-center px-4 z-10"
                initial={false}
                animate={{
                    y: hasMessages ? "calc(100vh - 100% - 1rem)" : "50vh",
                    x: "-50%",
                }}
                transition={{
                    duration: 0.6,
                    ease: [0.4, 0, 0.2, 1],
                }}
            >
                <div className="w-full max-w-xl bg-blue-100 rounded-md flex flex-col shadow-xs">
                    <Textarea
                        className="resize-none py-3 focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] shadow-none"
                        placeholder="Chat with your model..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                    />
                    <div className="px-3 py-2 flex items-center gap-2">
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
                            className="border-none h-9 flex items-center justify-center ml-auto"
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
    ChatInput
}