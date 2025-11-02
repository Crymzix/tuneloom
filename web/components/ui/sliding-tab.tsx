import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

const SlidingTabs = ({
    tabs,
    defaultActiveTab,
    activeTab: controlledActiveTab,
    onTabChange,
    className,
    tabClassName,
    tabIndicatorClassName,
}: {
    tabs: { id: string; label: string }[]
    defaultActiveTab?: string
    activeTab?: string
    onTabChange?: (tabId: string) => void
    className?: string
    tabClassName?: string
    tabIndicatorClassName?: string
}) => {
    const [internalActiveTab, setInternalActiveTab] = useState(defaultActiveTab || tabs[0].id);
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
    const indicatorRef = useRef<HTMLDivElement | null>(null);

    // Use controlled value if provided, otherwise use internal state
    const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalActiveTab;

    useEffect(() => {
        const activeElement = tabsRef.current.find(tab => tab?.id === activeTab);
        if (activeElement && indicatorRef.current) {
            indicatorRef.current.style.width = `${activeElement.offsetWidth}px`;
            indicatorRef.current.style.left = `${activeElement.offsetLeft}px`;
        }
    }, [activeTab]);

    const handleTabClick = (tabId: string) => {
        if (onTabChange) {
            onTabChange(tabId);
        } else {
            setInternalActiveTab(tabId);
        }
    };

    return (
        <div className={cn("relative flex p-2 bg-gray-100 rounded-md", className)}>
            {tabs.map((tab, index) => (
                <button
                    key={tab.id}
                    id={tab.id}
                    ref={el => { tabsRef.current[index] = el; }}
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(`px-2 py-1 text-sm font-medium rounded-md focus:outline-none z-10
            ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-600 hover:text-gray-900'}`, tabClassName)}
                >
                    {tab.label}
                </button>
            ))}
            <div
                ref={indicatorRef}
                className={cn("absolute bg-blue-100 rounded-md transition-all duration-300 ease-in-out", tabIndicatorClassName)}
                style={{ top: '0.5rem', bottom: '0.5rem' }}
            ></div>
        </div>
    );
};

export default SlidingTabs;