// Запросы к Supabase. Все ограничения доступа проверяются в базе (RLS + функции).
import { supabase } from "./supabase";
import type {
  ActivityRow, EntryLite, FriendRequest, FriendRow, MoodEntry, NotificationRow,
  NotificationSettings, PrivacySettings, Profile, UserProfileView, DayPart, MoodValue,
} from "./types";
import { compressImage } from "./image";

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

export const keys = {
  entries: (uid: string) => `entries:${uid}`,
  profile: (uid: string) => `profile:${uid}`,
  friends: "friends",
  requests: "requests",
  activity: "activity",
  notifications: "notifications",
  unread: "unread",
  privacy: "privacy",
  notifSettings: "notifSettings",
  user: (username: string) => `user:${username}`,
  userEntries: (id: string) => `userEntries:${id}`,
  photo: (path: string) => `photo:${path}`,
};

// ---------- Профиль ----------
export async function fetchProfile(uid: string): Promise<Profile | null> {
  return check(await supabase.from("profiles").select("*").eq("id", uid).maybeSingle()) as Profile | null;
}

export async function updateProfile(uid: string, patch: Partial<Pick<Profile, "username" | "display_name" | "avatar_url" | "timezone" | "onboarded">>) {
  return check(await supabase.from("profiles").update(patch).eq("id", uid).select().single()) as Profile;
}

export async function usernameAvailable(username: string): Promise<boolean> {
  return Boolean(check(await supabase.rpc("username_available", { p_username: username })));
}

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  const blob = await compressImage(file, 512, 0.85, true);
  // Удаляем старые аватары, чтобы не копить файлы
  const { data: old } = await supabase.storage.from("avatars").list(uid);
  const path = `${uid}/avatar-${Date.now()}.jpg`;
  check(await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true }));
  if (old?.length) await supabase.storage.from("avatars").remove(old.map((o) => `${uid}/${o.name}`));
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

// ---------- Записи настроения ----------
/** Мои записи, новые сверху (в день может быть несколько отметок) */
export async function fetchMyEntries(uid: string): Promise<MoodEntry[]> {
  return check(
    await supabase.from("mood_entries").select("*").eq("user_id", uid).order("mood_time", { ascending: false }).limit(10000),
  ) as MoodEntry[];
}

export interface EntryInput {
  entry_date: string;
  mood_value: MoodValue;
  note: string | null;
  mood_time: string;
  day_part: DayPart;
  photo?: File | null; // новое фото
  removePhoto?: boolean;
}

export async function saveEntry(uid: string, input: EntryInput, existing?: MoodEntry | null): Promise<MoodEntry> {
  let photo_path = existing?.photo_path ?? null;
  const oldPhoto = photo_path;

  if (input.photo) {
    const blob = await compressImage(input.photo);
    const path = `${uid}/${input.entry_date}-${Date.now()}.jpg`;
    check(await supabase.storage.from("mood-photos").upload(path, blob, { contentType: "image/jpeg" }));
    photo_path = path;
  } else if (input.removePhoto) {
    photo_path = null;
  }

  const row = {
    mood_value: input.mood_value,
    note: input.note?.trim() ? input.note.trim() : null,
    mood_time: input.mood_time,
    day_part: input.day_part,
    photo_path,
  };

  let saved: MoodEntry;
  if (existing) {
    saved = check(await supabase.from("mood_entries").update(row).eq("id", existing.id).select().single()) as MoodEntry;
  } else {
    const res = await supabase
      .from("mood_entries")
      .insert({ ...row, user_id: uid, entry_date: input.entry_date })
      .select()
      .single();
    if (res.error && photo_path) await supabase.storage.from("mood-photos").remove([photo_path]);
    saved = check(res) as MoodEntry;
  }
  if (oldPhoto && oldPhoto !== photo_path) await supabase.storage.from("mood-photos").remove([oldPhoto]);
  return saved;
}

export async function deleteEntry(entry: MoodEntry) {
  check(await supabase.from("mood_entries").delete().eq("id", entry.id));
  if (entry.photo_path) await supabase.storage.from("mood-photos").remove([entry.photo_path]);
}

/** Временная ссылка на приватное фото (доступ проверяет база) */
export async function photoUrl(path: string): Promise<string> {
  const res = await supabase.storage.from("mood-photos").createSignedUrl(path, 3600);
  if (res.error) throw res.error;
  return res.data.signedUrl;
}

// ---------- Друзья ----------
export async function fetchFriends(): Promise<FriendRow[]> {
  return (check(await supabase.rpc("get_friends")) ?? []) as FriendRow[];
}
export async function fetchRequests(): Promise<FriendRequest[]> {
  return (check(await supabase.rpc("get_friend_requests")) ?? []) as FriendRequest[];
}
export async function fetchActivity(): Promise<ActivityRow[]> {
  return (check(await supabase.rpc("get_friends_activity", { p_limit: 40 })) ?? []) as ActivityRow[];
}
export async function searchUsers(q: string, myId: string) {
  // Убираем символы, ломающие фильтр PostgREST; «_» оставляем — он бывает в username
  const clean = q.trim().toLowerCase().replace(/^@/, "").replace(/[%\\,()*"]/g, "");
  if (clean.length < 2) return [];
  return check(
    await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.${clean}%,display_name.ilike.%${clean}%`)
      .neq("id", myId)
      .order("username")
      .limit(20),
  ) as Pick<Profile, "id" | "username" | "display_name" | "avatar_url">[];
}
export async function sendFriendRequest(userId: string): Promise<"pending" | "friends"> {
  return check(await supabase.rpc("send_friend_request", { p_addressee: userId })) as "pending" | "friends";
}
export async function acceptRequest(friendshipId: string) {
  const data = check(await supabase.from("friendships").update({ status: "accepted" }).eq("id", friendshipId).select());
  if (!data?.length) throw new Error("Заявка не найдена или уже обработана");
}
/** Отклонить, отменить заявку или удалить из друзей */
export async function removeFriendship(friendshipId: string) {
  check(await supabase.from("friendships").delete().eq("id", friendshipId));
}
export async function fetchUserProfile(username: string): Promise<UserProfileView | null> {
  return check(await supabase.rpc("get_user_profile", { p_username: username })) as UserProfileView | null;
}
/** Записи другого пользователя — база сама отдаёт только разрешённое */
export async function fetchUserEntries(userId: string, from = "2000-01-01", to = "2100-01-01"): Promise<EntryLite[]> {
  return (check(await supabase.rpc("get_user_entries", { p_user: userId, p_from: from, p_to: to })) ?? []) as EntryLite[];
}
export async function setMuted(myId: string, friendId: string, muted: boolean) {
  if (muted) {
    // Обычная вставка: права на изменение строк у пользователя нет (upsert требует UPDATE).
    // Повтор (уже отключено) — не ошибка.
    const res = await supabase.from("muted_friends").insert({ user_id: myId, muted_id: friendId });
    if (res.error && res.error.code !== "23505") throw res.error;
  }
  else check(await supabase.from("muted_friends").delete().eq("user_id", myId).eq("muted_id", friendId));
}

// ---------- Уведомления ----------
export async function fetchNotifications(): Promise<NotificationRow[]> {
  return check(
    await supabase
      .from("notifications")
      .select("*, actor:profiles!notifications_actor_id_fkey(id, username, display_name, avatar_url)")
      .order("created_at", { ascending: false })
      .limit(100),
  ) as NotificationRow[];
}
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}
export async function markRead(ids: string[] | "all") {
  let q = supabase.from("notifications").update({ is_read: true }).eq("is_read", false);
  if (ids !== "all") q = q.in("id", ids);
  check(await q);
}

// ---------- Настройки ----------
export async function fetchPrivacy(): Promise<PrivacySettings> {
  return check(await supabase.from("privacy_settings").select("*").single()) as PrivacySettings;
}
export async function updatePrivacy(uid: string, patch: Partial<PrivacySettings>) {
  return check(await supabase.from("privacy_settings").update(patch).eq("user_id", uid).select().single()) as PrivacySettings;
}
export async function fetchNotifSettings(): Promise<NotificationSettings> {
  return check(await supabase.from("notification_settings").select("*").single()) as NotificationSettings;
}
export async function updateNotifSettings(uid: string, patch: Partial<NotificationSettings>) {
  return check(
    await supabase.from("notification_settings").update(patch).eq("user_id", uid).select().single(),
  ) as NotificationSettings;
}

// ---------- Аккаунт ----------
async function removeAllFiles(bucket: string, uid: string) {
  for (;;) {
    const { data } = await supabase.storage.from(bucket).list(uid, { limit: 100 });
    if (!data?.length) return;
    await supabase.storage.from(bucket).remove(data.map((f) => `${uid}/${f.name}`));
    if (data.length < 100) return;
  }
}

export async function deleteAccount(uid: string) {
  await removeAllFiles("mood-photos", uid);
  await removeAllFiles("avatars", uid);
  check(await supabase.rpc("delete_account"));
  await supabase.auth.signOut({ scope: "local" });
}
