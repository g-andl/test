// Тесты админ-панели и заявок на восстановление.
// Запуск: npm run test:admin (нужен локальный Supabase)
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  execSync('npx supabase status -o env', { encoding: 'utf8' })
    .split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36).slice(-6);
const anon = () => createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });

/** Регистрация без почты: служебный адрес на users.nastroy.local */
async function signUp(username, name) {
  const c = anon();
  const { data, error } = await c.auth.signUp({
    email: `u_${username}@users.nastroy.local`,
    password: 'Passw0rd!x',
    options: { data: { username, display_name: name } },
  });
  if (error) throw error;
  if (!data.session) {
    // локально подтверждение почты может быть включено — подтверждаем через сервисный ключ
    await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
    await c.auth.signInWithPassword({ email: `u_${username}@users.nastroy.local`, password: 'Passw0rd!x' });
  }
  return { c, id: data.user.id, username };
}

let boss, user, other;
before(async () => {
  boss = await signUp(`adm_${run}`, 'Иван Иванов');
  await admin.from('admins').insert({ user_id: boss.id });
  user = await signUp(`usr_${run}`, 'Пользователь');
  other = await signUp(`oth_${run}`, 'Другой');
});

test('вход по имени пользователя: служебный адрес находится, настоящая почта — нет', async () => {
  const { data } = await anon().rpc('login_email', { p_username: user.username });
  assert.equal(data, `u_${user.username}@users.nastroy.local`);
  const real = await admin.auth.admin.createUser({ email: `real_${run}@example.com`, password: 'Passw0rd!x', email_confirm: true, user_metadata: { username: `real_${run}`, display_name: 'R' } });
  const { data: none } = await anon().rpc('login_email', { p_username: `real_${run}` });
  assert.equal(none, null, 'настоящая почта не раскрывается');
  await admin.auth.admin.deleteUser(real.data.user.id);
});

test('дата создания аккаунта скрыта от пользователей', async () => {
  const r = await other.c.from('profiles').select('created_at').eq('id', user.id);
  assert.ok(r.error, 'колонка created_at недоступна');
  const ok = await other.c.from('profiles').select('id, username, is_admin').eq('id', boss.id).single();
  assert.equal(ok.data.is_admin, true, 'админ виден с пометкой');
});

test('обычный пользователь не может вызывать функции админа', async () => {
  for (const [fn, args] of [
    ['admin_list_users', {}],
    ['admin_user_entries', { p_user: other.id }],
    ['admin_set_password', { p_user: other.id, p_password: 'hacked123' }],
    ['admin_delete_user', { p_user: other.id }],
    ['admin_list_recovery', {}],
  ]) {
    const { error } = await user.c.rpc(fn, args);
    assert.ok(error, `${fn} запрещён`);
  }
  const t = await user.c.from('admins').select('*');
  assert.ok(t.error || t.data.length === 0, 'таблица admins закрыта');
  const flag = await user.c.from('profiles').update({ is_admin: true }).eq('id', user.id);
  assert.ok(flag.error, 'нельзя назначить себя админом');
});

test('админа нельзя добавить в друзья, и сам он не добавляет', async () => {
  const a = await user.c.rpc('send_friend_request', { p_addressee: boss.id });
  assert.ok(a.error);
  const b = await user.c.from('friendships').insert({ requester_id: user.id, addressee_id: boss.id });
  assert.ok(b.error);
  const c = await boss.c.rpc('send_friend_request', { p_addressee: user.id });
  assert.ok(c.error);
});

test('админ не ставит себе отметки', async () => {
  const r = await boss.c.from('mood_entries').insert({ user_id: boss.id, entry_date: '2026-11-14', mood_value: 5, mood_time: new Date().toISOString(), day_part: 'day' });
  assert.ok(r.error);
});

test('админ видит аккаунты с датой создания и всё о пользователе', async () => {
  await user.c.from('mood_entries').insert({ user_id: user.id, entry_date: '2026-11-14', mood_value: 2, note: 'тяжёлый день', mood_time: new Date().toISOString(), day_part: 'day' });
  const { data, error } = await boss.c.rpc('admin_list_users', { p_search: user.username });
  assert.ifError(error);
  assert.equal(data.length, 1);
  assert.ok(data[0].created_at);
  assert.equal(Number(data[0].entries_count), 1);
  const { data: entries } = await boss.c.rpc('admin_user_entries', { p_user: user.id });
  assert.equal(entries[0].note, 'тяжёлый день');
  await boss.c.rpc('admin_update_entry', { p_entry: entries[0].id, p_mood: 4, p_note: 'исправлено' });
  const { data: e2 } = await boss.c.rpc('admin_user_entries', { p_user: user.id });
  assert.equal(e2[0].mood_value, 4);
  await boss.c.rpc('admin_update_profile', { p_user: user.id, p_display_name: 'Новое имя', p_username: user.username });
  const { data: pr } = await admin.from('profiles').select('display_name').eq('id', user.id).single();
  assert.equal(pr.display_name, 'Новое имя');
});

test('заявка на восстановление → админ задаёт новый пароль', async () => {
  const s = await anon().rpc('submit_recovery_request', { p_username: `@${user.username}`, p_contact: '@tg_user', p_message: 'Забыл пароль после смены телефона' });
  assert.ifError(s.error);
  const bad = await anon().rpc('submit_recovery_request', { p_username: 'x', p_contact: '', p_message: 'короче' });
  assert.ok(bad.error, 'без контакта заявка не принимается');
  const { data: list } = await boss.c.rpc('admin_list_recovery');
  const req = list.find((r) => r.contact === '@tg_user');
  assert.equal(req.user_id, user.id, 'заявка привязана к аккаунту');
  const pw = await boss.c.rpc('admin_set_password', { p_user: user.id, p_password: 'NewPass2026' });
  assert.ifError(pw.error);
  const login = await anon().auth.signInWithPassword({ email: `u_${user.username}@users.nastroy.local`, password: 'NewPass2026' });
  assert.ifError(login.error, 'вход с новым паролем');
  await boss.c.rpc('admin_update_recovery', { p_id: req.id, p_status: 'done', p_note: 'связался в TG' });
  const { data: l2 } = await boss.c.rpc('admin_list_recovery');
  assert.equal(l2.find((r) => r.id === req.id).status, 'done');
});

test('админ удаляет аккаунт, но не себя', async () => {
  const self = await boss.c.rpc('admin_delete_user', { p_user: boss.id });
  assert.ok(self.error);
  const { error } = await boss.c.rpc('admin_delete_user', { p_user: other.id });
  assert.ifError(error);
  const { data } = await admin.from('profiles').select('id').eq('id', other.id);
  assert.equal(data.length, 0);
});
