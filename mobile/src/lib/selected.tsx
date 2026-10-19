import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMembers } from "@/lib/data";
import type { Member } from "@/lib/types";

const KEY = "labless.selectedMember";

type Ctx = { selected: Member | null; select: (id: string) => void };
const SelectedContext = createContext<Ctx>({ selected: null, select: () => {} });

/** Which family member the Home screen and uploads are about. Remembered between launches. */
export function SelectedMemberProvider({ children }: { children: ReactNode }) {
  const { data: members } = useMembers();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setId(v)).catch(() => {});
  }, []);

  const selected = useMemo(() => {
    if (!members?.length) return null;
    return members.find((m) => m.id === id) ?? members.find((m) => m.is_self) ?? members[0];
  }, [members, id]);

  const select = (next: string) => {
    setId(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  };

  return <SelectedContext.Provider value={{ selected, select }}>{children}</SelectedContext.Provider>;
}

export const useSelectedMember = () => useContext(SelectedContext);
