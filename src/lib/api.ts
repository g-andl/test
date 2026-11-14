// Запросы к Supabase. Все ограничения доступа проверяются в базе (RLS + функции).
import { supabase } from "./supabase";
import type {
  ActivityRow, EntryLite, FriendRequest, FriendRow, MoodEntry, NotificationRow,
  NotificationSettings, PrivacySettings, Profile, UserProfileView, DayPart, MoodValue,
  AdminUser, RecoveryRequest, BlockStatus, SupportWall, Badge,
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
  support: (id: string) => `support:${id}`,
  badges: "badges",
  photo: (path: string) => `photo:${path}`,
};

// ---------- Профиль ----------
// Дата создания аккаунта закрыта на уровне базы — выбираем только разрешённые колонки
const PROFILE_COLS = "id, username, display_name, avatar_url, timezone, onboarded, is_admin";

export async function fetchProfile(uid: string): Promise<Profile | null> {
  return check(await supabase.from("profiles").select(PROFILE_COLS).eq("id", uid).maybeSingle()) as Profile | null;
}

export async function updateProfile(uid: string, patch: Partial<Pick<Profile, "username" | "display_name" | "avatar_url" | "timezone" | "onboarded">>) {
  return check(await supabase.from("profiles").update(patch).eq("id", uid).select(PROFILE_COLS).single()) as Profile;
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
      .select("id, username, display_name, avatar_url, is_admin")
      .or(`username.ilike.${clean}%,display_name.ilike.%${clean}%`)
      .neq("id", myId)
      .order("username")
      .limit(20),
  ) as Pick<Profile, "id" | "username" | "display_name" | "avatar_url" | "is_admin">[];
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

// ---------- Вход без почты ----------
/** Домен служебных адресов для аккаунтов без почты */
export const LOGIN_DOMAIN = "users.nastroy.local";

/** Новый служебный адрес для регистрации без почты */
export function makeLoginEmail() {
  const rnd = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `u_${rnd}@${LOGIN_DOMAIN}`;
}

/** Имя пользователя или почта → служебный адрес для входа (ищет база) */
export async function resolveLoginEmail(login: string): Promise<string | null> {
  const v = login.trim().toLowerCase();
  if (!v) return null;
  return (check(await supabase.rpc("login_email", { p_username: v })) as string | null) ?? null;
}

/** Почта для восстановления (видят только владелец и администратор) */
export async function fetchContactEmail(): Promise<string | null> {
  const { data, error } = await supabase.from("user_contacts").select("email").maybeSingle();
  if (error) throw error;
  return (data?.email as string | null) ?? null;
}
export async function updateContactEmail(uid: string, email: string) {
  check(await supabase.from("user_contacts").update({ email: email.trim().toLowerCase() }).eq("user_id", uid));
}
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function submitRecoveryRequest(username: string, contact: string, message: string) {
  check(await supabase.rpc("submit_recovery_request", { p_username: username, p_contact: contact, p_message: message }));
}

// ---------- Админ-панель (права проверяет база) ----------
export async function amIAdmin(): Promise<boolean> {
  return Boolean(check(await supabase.rpc("am_i_admin")));
}
export async function adminListUsers(search: string, limit = 50, offset = 0): Promise<AdminUser[]> {
  return (check(await supabase.rpc("admin_list_users", { p_search: search, p_limit: limit, p_offset: offset })) ?? []) as AdminUser[];
}
export async function adminUserEntries(userId: string): Promise<MoodEntry[]> {
  return (check(await supabase.rpc("admin_user_entries", { p_user: userId })) ?? []) as MoodEntry[];
}
export async function adminUpdateEntry(entryId: string, mood: number, note: string) {
  check(await supabase.rpc("admin_update_entry", { p_entry: entryId, p_mood: mood, p_note: note }));
}
/** Отметка за пользователя (дата и время — по часовому поясу администратора) */
export async function adminCreateEntry(userId: string, date: string, time: Date, part: DayPart, mood: number, note: string) {
  check(
    await supabase.rpc("admin_create_entry", {
      p_user: userId, p_date: date, p_time: time.toISOString(), p_part: part, p_mood: mood, p_note: note,
    }),
  );
}
export async function adminSetContactEmail(userId: string, email: string) {
  check(await supabase.rpc("admin_set_contact_email", { p_user: userId, p_email: email }));
}
export async function adminUpdatePrivacy(userId: string, visibility: string, photos: boolean, notes?: boolean) {
  check(await supabase.rpc("admin_update_privacy", { p_user: userId, p_visibility: visibility, p_photos: photos, p_notes: notes ?? null }));
}
export async function adminUserPrivacy(userId: string): Promise<{ public_visibility: string; photos_public: boolean; notes_public: boolean } | null> {
  const rows = (check(await supabase.rpc("admin_user_privacy", { p_user: userId })) ?? []) as { public_visibility: string; photos_public: boolean; notes_public: boolean }[];
  return rows[0] ?? null;
}
export interface ActivitySession { id: string; started_at: string; last_seen_at: string; user_agent: string | null }
export async function adminUserActivity(userId: string, from?: string, to?: string): Promise<ActivitySession[]> {
  return (check(await supabase.rpc("admin_user_activity", { p_user: userId, p_from: from ?? null, p_to: to ?? null })) ?? []) as ActivitySession[];
}
export async function touchActivity() {
  // Тихо; отсутствие сессии (вышел из системы) не должно показывать ошибку
  try {
    await supabase.rpc("touch_activity", { p_user_agent: navigator.userAgent });
  } catch {
    /* не критично */
  }
}
export async function adminDeleteEntry(entry: MoodEntry) {
  if (entry.photo_path) await supabase.storage.from("mood-photos").remove([entry.photo_path]);
  check(await supabase.rpc("admin_delete_entry", { p_entry: entry.id }));
}
export async function adminSetPassword(userId: string, password: string) {
  check(await supabase.rpc("admin_set_password", { p_user: userId, p_password: password }));
}
export async function adminUpdateProfile(userId: string, displayName: string, username: string) {
  check(await supabase.rpc("admin_update_profile", { p_user: userId, p_display_name: displayName, p_username: username }));
}
export async function adminDeleteUser(userId: string) {
  // Сначала файлы (фото и аватары), затем аккаунт — данные удалятся каскадно
  for (const bucket of ["mood-photos", "avatars"]) {
    for (;;) {
      const { data } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
      if (!data?.length) break;
      await supabase.storage.from(bucket).remove(data.map((f) => `${userId}/${f.name}`));
      if (data.length < 100) break;
    }
  }
  check(await supabase.rpc("admin_delete_user", { p_user: userId }));
}
export async function adminListRecovery(): Promise<RecoveryRequest[]> {
  return (check(await supabase.rpc("admin_list_recovery")) ?? []) as RecoveryRequest[];
}
export async function adminDeleteRecovery(id: string) {
  check(await supabase.rpc("admin_delete_recovery", { p_id: id }));
}
export async function adminUpdateRecovery(id: string, status: RecoveryRequest["status"], note: string) {
  check(await supabase.rpc("admin_update_recovery", { p_id: id, p_status: status, p_note: note }));
}

// ---------- Блокировка аккаунтов ----------
export async function fetchBlockStatus(): Promise<BlockStatus> {
  return check(await supabase.rpc("my_block_status")) as BlockStatus;
}
/** until = null — навсегда */
export async function adminBlockUser(userId: string, until: string | null, reason: string) {
  check(await supabase.rpc("admin_block_user", { p_user: userId, p_until: until, p_reason: reason }));
}
export async function adminUnblockUser(userId: string) {
  check(await supabase.rpc("admin_unblock_user", { p_user: userId }));
}

// ---------- Окно поддержки ----------
export async function fetchSupportWall(userId: string): Promise<SupportWall> {
  return check(await supabase.rpc("get_support_wall", { p_user: userId, p_limit: 100 })) as SupportWall;
}
export async function postSupportMessage(userId: string, body: string) {
  check(await supabase.rpc("post_support_message", { p_user: userId, p_body: body }));
}
export async function deleteSupportMessage(id: string) {
  check(await supabase.rpc("delete_support_message", { p_id: id }));
}
export async function adminEditSupportMessage(id: string, body: string) {
  check(await supabase.rpc("admin_edit_support_message", { p_id: id, p_body: body }));
}
export async function adminPostSupportMessage(recipientId: string, authorUsername: string, body: string) {
  check(await supabase.rpc("admin_post_support_message", { p_recipient: recipientId, p_author_username: authorUsername, p_body: body }));
}

// ---------- Статусы пользователей ----------
export interface BadgeData {
  list: Badge[];
  /** пользователь → его статус */
  byUser: Record<string, Badge>;
  /** кому статус выдан вручную (автоматические система пересчитывает сама) */
  manual: Record<string, boolean>;
  /** сколько у каждого статуса владельцев */
  counts: Record<string, number>;
}
export async function fetchBadgeData(): Promise<BadgeData> {
  const [b, ub] = await Promise.all([
    supabase.from("badges").select("id, name, color, hint, auto_key").order("created_at"),
    supabase.from("user_badges").select("user_id, badge_id, source"),
  ]);
  if (b.error) throw b.error;
  if (ub.error) throw ub.error;
  const list = (b.data ?? []) as Badge[];
  const byId = new Map(list.map((x) => [x.id, x]));
  const byUser: Record<string, Badge> = {};
  const manual: Record<string, boolean> = {};
  const counts: Record<string, number> = {};
  for (const r of ub.data ?? []) {
    const badge = byId.get(r.badge_id as string);
    if (!badge) continue;
    byUser[r.user_id as string] = badge;
    if (r.source === "manual") manual[r.user_id as string] = true;
    counts[badge.id] = (counts[badge.id] ?? 0) + 1;
  }
  return { list, byUser, manual, counts };
}
export async function adminSaveBadge(id: string | null, name: string, color: string): Promise<string> {
  return check(await supabase.rpc("admin_save_badge", { p_id: id, p_name: name, p_color: color })) as string;
}
export async function adminRefreshBadges(): Promise<number> {
  return Number(check(await supabase.rpc("admin_refresh_badges")));
}
export async function adminDeleteBadge(id: string) {
  check(await supabase.rpc("admin_delete_badge", { p_id: id }));
}
export async function adminSetUserBadge(userId: string, badgeId: string | null) {
  check(await supabase.rpc("admin_set_user_badge", { p_user: userId, p_badge: badgeId }));
}
