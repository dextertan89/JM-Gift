import { create } from "zustand";

export const TreeMorphState = {
  SCATTERED: "SCATTERED",
  TREE_SHAPE: "TREE_SHAPE",
} as const;

export type TreeMorphState =
  (typeof TreeMorphState)[keyof typeof TreeMorphState];

type TreeStore = {
  state: TreeMorphState;
  progress: number;
  toggle: () => void;
  setProgress: (p: number) => void;
  setState: (s: TreeMorphState) => void; // ✅ 这一行关键
  selectedPolaroid: number | null;
  setSelectedPolaroid: (i: number | null) => void;
  selectPolaroid: (i: number) => void;
  clearPolaroid: () => void;
};

export const useTreeStore = create<TreeStore>((set, get) => ({
  state: TreeMorphState.TREE_SHAPE,
  progress: 1,
  toggle: () =>
  set((prev) => {
    const nextState =
      prev.state === TreeMorphState.SCATTERED
        ? TreeMorphState.TREE_SHAPE
        : TreeMorphState.SCATTERED;

    return {
      state: nextState,
      progress: nextState === TreeMorphState.TREE_SHAPE ? 1 : 0,
    };
  }),
  setProgress: (p) => set({ progress: p }),
  setState: (s) => set({ state: s }),
  selectedPolaroid: null,
  setSelectedPolaroid: (i) => set({ selectedPolaroid: i }),
  selectPolaroid: (i) => set({ selectedPolaroid: i }),
  clearPolaroid: () => set({ selectedPolaroid: null }),
}));
    