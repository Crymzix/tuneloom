import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { modelGroups } from '../models';

export interface Model {
    name: string;
    hf_id: string;
    params: string;
    license: string;
    type: string;
}

export interface ModelGroup {
    company_name: string;
    company_logo: string;
    models: Model[];
}

interface ModelStore {
    selectedModel: Model;
    setSelectedModel: (model: Model) => void;
    getSelectedModelCompany: () => ModelGroup;
    _hasHydrated: boolean;
    setHasHydrated: (state: boolean) => void;
}

export const useModelStore = create<ModelStore>()(
    persist(
        (set, get) => ({
            selectedModel: modelGroups[0].models[0],
            _hasHydrated: false,

            setSelectedModel: (model: Model) => set({ selectedModel: model }),

            getSelectedModelCompany: () => {
                const { selectedModel } = get();
                return modelGroups.find(group =>
                    group.models.some(m => m.hf_id === selectedModel.hf_id)
                ) || modelGroups[0]
            },

            setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
        }),
        {
            name: 'model-store',
            storage: createJSONStorage(() => localStorage),
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
