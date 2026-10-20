import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUserId } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Analysis, Family, InboxItem, Member, Profile, Report, Result } from "@/lib/types";

const must = <T,>(res: { data: T | null; error: { message: string } | null }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

export const keys = {
  profile: ["profile"] as const,
  family: ["family"] as const,
  members: ["members"] as const,
  reports: (memberId?: string) => ["reports", memberId ?? "all"] as const,
  report: (id: string) => ["report", id] as const,
  analysis: (id: string) => ["analysis", id] as const,
  results: (id: string) => ["results", id] as const,
  memberResults: (memberId: string) => ["memberResults", memberId] as const,
  analyses: ["analyses"] as const,
  inbox: ["inbox"] as const,
};

export function useProfile() {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.profile,
    enabled: !!uid,
    queryFn: async () => must<Profile>(await supabase.from("profiles").select("*").eq("id", uid!).single()),
  });
}

export function useFamily() {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.family,
    enabled: !!uid,
    queryFn: async () => {
      const rows = must<Family[]>(await supabase.from("families").select("*").eq("owner_id", uid!).order("created_at").limit(1));
      if (rows[0]) return rows[0];
      // The signup trigger creates a family; this covers accounts made before it existed.
      return must<Family>(await supabase.from("families").insert({ owner_id: uid!, name: "My family" }).select().single());
    },
  });
}

export function useMembers() {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.members,
    enabled: !!uid,
    queryFn: async () => {
      const rows = must<Member[]>(await supabase.from("members").select("*").order("created_at"));
      return [...rows].sort((a, b) => Number(b.is_self) - Number(a.is_self));
    },
  });
}

export function useMember(id: string | undefined) {
  const members = useMembers();
  return { ...members, data: members.data?.find((m) => m.id === id) };
}

const hasPending = (rows: Report[] | undefined) => rows?.some((r) => r.status === "processing" || r.status === "uploaded");

export function useReports(memberId?: string) {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.reports(memberId),
    enabled: !!uid,
    queryFn: async () => {
      let q = supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(200);
      if (memberId) q = q.eq("member_id", memberId);
      return must<Report[]>(await q);
    },
    refetchInterval: (query) => (hasPending(query.state.data as Report[] | undefined) ? 3000 : false),
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: keys.report(id),
    queryFn: async () => must<Report>(await supabase.from("reports").select("*").eq("id", id).single()),
    refetchInterval: (query) => {
      const s = (query.state.data as Report | undefined)?.status;
      return s === "processing" || s === "uploaded" ? 1500 : false;
    },
  });
}

export function useAnalysis(reportId: string, enabled = true) {
  return useQuery({
    queryKey: keys.analysis(reportId),
    enabled,
    queryFn: async () => must<Analysis | null>(await supabase.from("analyses").select("*").eq("report_id", reportId).maybeSingle()),
  });
}

/** Latest analyses for every member, used on Home and Family. */
export function useAnalyses() {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.analyses,
    enabled: !!uid,
    queryFn: async () =>
      must<Analysis[]>(
        (await supabase
          .from("analyses")
          .select("report_id, member_id, status, summary, findings, hidden_tests, next_steps, red_flags, advice, updated_at")
          .order("updated_at", { ascending: false })
          .limit(100)) as unknown as { data: Analysis[] | null; error: { message: string } | null },
      ),
  });
}

export function useResults(reportId: string, enabled = true) {
  return useQuery({
    queryKey: keys.results(reportId),
    enabled,
    queryFn: async () => must<Result[]>(await supabase.from("results").select("*").eq("report_id", reportId).order("id")),
  });
}

export function useMemberResults(memberId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.memberResults(memberId ?? ""),
    enabled: enabled && !!memberId,
    queryFn: async () =>
      must<Result[]>(
        await supabase
          .from("results")
          .select("*")
          .eq("member_id", memberId!)
          .not("value", "is", null)
          .order("collected_at", { ascending: true })
          .limit(2000),
      ),
  });
}

export function useInbox() {
  const uid = useUserId();
  return useQuery({
    queryKey: keys.inbox,
    enabled: !!uid,
    queryFn: async () => must<InboxItem[]>(await supabase.from("inbox").select("*").order("created_at", { ascending: false }).limit(100)),
  });
}

// ---------- Mutations ----------

export type MemberInput = {
  name: string;
  relation: Member["relation"];
  sex: Member["sex"];
  birth_date: string | null;
  color: string;
  is_self?: boolean;
};

export function useSaveMember() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async ({ id, familyId, input }: { id?: string; familyId: string; input: MemberInput }) => {
      if (id) return must<Member>(await supabase.from("members").update(input).eq("id", id).select().single());
      return must<Member>(
        await supabase
          .from("members")
          .insert({ ...input, family_id: familyId, owner_id: uid! })
          .select()
          .single(),
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members }),
  });
}

export function useDeleteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: reports } = await supabase.from("reports").select("files").eq("member_id", id);
      const paths = (reports ?? []).flatMap((r) => ((r.files ?? []) as { path: string }[]).map((f) => f.path));
      if (paths.length) await supabase.storage.from("reports").remove(paths);
      must(await supabase.from("members").delete().eq("id", id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.members });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: keys.analyses });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (report: Report) => {
      const paths = (report.files ?? []).map((f) => f.path);
      if (paths.length) await supabase.storage.from("reports").remove(paths);
      must(await supabase.from("reports").delete().eq("id", report.id));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: keys.analyses });
      qc.invalidateQueries({ queryKey: ["memberResults"] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const uid = useUserId();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, "full_name" | "locale" | "onboarded" | "notifications_enabled">>) =>
      must<Profile>(await supabase.from("profiles").update(patch).eq("id", uid!).select().single()),
    onSuccess: (profile) => qc.setQueryData(keys.profile, profile),
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      must(await supabase.from("inbox").update({ read_at: new Date().toISOString() }).in("id", ids));
    },
    onMutate: (ids) => {
      const now = new Date().toISOString();
      qc.setQueryData<InboxItem[]>(keys.inbox, (rows) => rows?.map((r) => (ids.includes(r.id) && !r.read_at ? { ...r, read_at: now } : r)));
    },
  });
}
