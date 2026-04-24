import { create } from 'zustand';
import type { Field } from '@/types/entities';
import { mockFields } from '@/data/mockSeed';

interface FieldState {
  fields: Field[];
  create: (field: Omit<Field, 'id'>) => Field;
  update: (id: number, patch: Partial<Omit<Field, 'id'>>) => void;
  remove: (id: number) => void;
  getById: (id: number) => Field | undefined;
  byUser: (userId: number) => Field[];
}

let nextId = 1000;

export const useFieldStore = create<FieldState>((set, get) => ({
  fields: [...mockFields],

  create: (field) => {
    const newField: Field = { ...field, id: ++nextId };
    set((state) => ({ fields: [...state.fields, newField] }));
    return newField;
  },

  update: (id, patch) =>
    set((state) => ({
      fields: state.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),

  remove: (id) =>
    set((state) => ({ fields: state.fields.filter((f) => f.id !== id) })),

  getById: (id) => get().fields.find((f) => f.id === id),

  byUser: (userId) => get().fields.filter((f) => f.userId === userId),
}));
