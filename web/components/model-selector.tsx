import { useState } from "react";
import { useUserModelsByBaseModel } from "../hooks/use-fine-tune";
import { modelGroups } from "../lib/models"
import { useModelStore } from "../lib/store";
import { BorderBeam } from "./ui/border-beam"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "./ui/select"
import { UserModel } from "../lib/fine-tune-jobs";
import { BrainIcon, Loader2Icon } from "lucide-react";

function ModelSelector({
    onBaseModelChange,
    onModelChange
}: {
    onBaseModelChange?: (modelId: string) => void;
    onModelChange?: (model: UserModel | null) => void;
}) {
    const { selectedModel, setSelectedModel, getSelectedModelCompany, _hasHydrated } = useModelStore();
    const selectedModelCompany = getSelectedModelCompany()
    const { data: userModels = [], isLoading: isLoadingUserModels } = useUserModelsByBaseModel(
        selectedModel?.hf_id || ''
    )
    const [selectedUserModel, setSelectedUserModel] = useState<UserModel | null>(null);

    return (
        <div className="flex items-center gap-2">
            <Select
                value={selectedModel.hf_id}
                onValueChange={(value) => {
                    const model = modelGroups.flatMap(m => m.models).find(m => m.hf_id === value)
                    if (model) {
                        if (model.hf_id !== selectedModel.hf_id) {
                            onBaseModelChange?.(model.hf_id)
                        }
                        setSelectedModel(model)
                        setSelectedUserModel(null);
                    }
                }}
            >
                {
                    _hasHydrated && (
                        <SelectTrigger
                            className="focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none"
                        >
                            <img src={selectedModelCompany.company_logo} alt={selectedModelCompany.company_name} className="inline-block size-4 mr-2 object-contain" />
                            {selectedModel.name}
                            <BorderBeam duration={8} colorFrom="#60a5fa" colorTo="#dbeafe" size={60} borderWidth={2} />
                        </SelectTrigger>
                    )
                }
                <SelectContent
                    className="w-56 max-h-72 border-none"
                    align="start"
                >
                    {
                        modelGroups.map((group) => {
                            return (
                                <SelectGroup key={group.company_name}>
                                    <SelectLabel className="text-xs">
                                        <img src={group.company_logo} alt={group.company_name} className="inline-block size-4 mr-2 object-contain" />
                                        {group.company_name}
                                    </SelectLabel>
                                    {
                                        group.models.map((m) => {
                                            return (
                                                <SelectItem
                                                    key={m.hf_id}
                                                    value={m.hf_id}
                                                >
                                                    {m.name}
                                                </SelectItem>
                                            )
                                        })
                                    }
                                </SelectGroup>
                            )
                        })
                    }
                </SelectContent>
            </Select>
            <Select
                value={selectedUserModel?.id || 'base-model'}
                onValueChange={(value) => {
                    const model = userModels.find(m => m.id === value)
                    if (model) {
                        setSelectedUserModel(model);
                        onModelChange?.(model);
                    } else {
                        setSelectedUserModel(null);
                        onModelChange?.(null);
                    }
                }}
            >
                {
                    selectedModel && (
                        <SelectTrigger
                            className="focus-visible:border-none focus-visible:ring-none focus-visible:ring-[0px] relative bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border-none"
                        >
                            {
                                selectedUserModel && selectedUserModel.id !== 'base-model' ?
                                    <div className="flex items-center gap-2">
                                        {
                                            isLoadingUserModels ? <Loader2Icon className="animate-spin" /> : null
                                        }
                                        {selectedUserModel.name}
                                    </div> :
                                    <div className="text-slate-400 flex items-center gap-2">
                                        <BrainIcon className="text-slate-400 size-3" />
                                        Base Model
                                    </div>
                            }
                        </SelectTrigger>
                    )
                }
                {
                    userModels.length > 0 ? (
                        <SelectContent
                            className="w-56 max-h-72 border-none"
                            align="start"
                        >
                            <SelectItem
                                key={'base-model'}
                                value={'base-model'}
                                className="text-slate-400 focus:text-slate-400 hover:text-slate-400"
                            >
                                <BrainIcon className="text-slate-400 size-3" />
                                Base Model
                            </SelectItem>
                            {
                                userModels.map((model) => {
                                    return (
                                        <SelectItem
                                            key={model.id}
                                            value={model.id}
                                        >
                                            {model.name}
                                        </SelectItem>
                                    )
                                })
                            }
                        </SelectContent>
                    ) : null
                }
            </Select>
        </div>
    )
}

export {
    ModelSelector
}