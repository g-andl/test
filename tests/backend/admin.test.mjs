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
    options: { data: { username, display_name: name, contact_email: `${username}@mail.test` } },
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
  await admin.from('recovery_requests').delete().gte('created_at', '2000-01-01');
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

test('админ ставит отметку за пользователя, друг получает уведомление', async () => {
  const friend = await signUp(`frd_${run}`, 'Друг');
  await friend.c.rpc('send_friend_request', { p_addressee: user.id });
  const { data: fr } = await user.c.from('friendships').select('id').eq('requester_id', friend.id).single();
  await user.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
  const { error } = await boss.c.rpc('admin_create_entry', {
    p_user: user.id, p_date: today, p_time: new Date().toISOString(), p_part: 'day', p_mood: 5, p_note: 'от админа',
  });
  assert.ifError(error);
  const { data } = await admin.from('mood_entries').select('note').eq('user_id', user.id).eq('note', 'от админа');
  assert.equal(data.length, 1);
  const { data: n } = await friend.c.from('notifications').select('type').eq('type', 'friend_mood');
  assert.equal(n.length, 1, 'друг получил уведомление');
  const deny = await user.c.rpc('admin_create_entry', {
    p_user: other.id, p_date: today, p_time: new Date().toISOString(), p_part: 'day', p_mood: 1, p_note: '',
  });
  assert.ok(deny.error, 'обычный пользователь не может ставить отметки за других');
});

test('имена с admin/support занять нельзя', async () => {
  for (const n of ['admin', 'my_admin', 'support1', 'root']) {
    const { data } = await anon().rpc('username_available', { p_username: n });
    assert.equal(data, false, `${n} недоступно`);
  }
  const r = await user.c.from('profiles').update({ username: `admin_${run}` }).eq('id', user.id);
  assert.ok(r.error, 'нельзя переименоваться в admin');
  const bad = await anon().auth.signUp({ email: `u_x${run}@users.nastroy.local`, password: 'Passw0rd!x', options: { data: { username: `support_${run}`, display_name: 'x' } } });
  assert.ok(bad.error, 'нельзя зарегистрироваться с запрещённым именем');
});

test('почта для восстановления: видит владелец и админ, не другие', async () => {
  const own = await user.c.from('user_contacts').select('email').single();
  assert.equal(own.data.email, `${user.username}@mail.test`);
  const foreign = await other.c.from('user_contacts').select('email').eq('user_id', user.id);
  assert.equal((foreign.data ?? []).length, 0);
  const upd = await user.c.from('user_contacts').update({ email: `new_${run}@mail.test` }).eq('user_id', user.id).select();
  assert.equal(upd.data.length, 1);
  const { data } = await boss.c.rpc('admin_list_users', { p_search: `new_${run}@mail.test` });
  assert.equal(data.length, 1, 'админ находит по почте');
  assert.equal(data[0].contact_email, `new_${run}@mail.test`);
});

test('заявка по почте привязывается к аккаунту', async () => {
  await admin.from('recovery_requests').delete().gte('created_at', '2000-01-01');
  const s = await anon().rpc('submit_recovery_request', { p_username: `new_${run}@mail.test`, p_contact: '@by_mail', p_message: 'Не помню имя пользователя' });
  assert.ifError(s.error);
  const empty = await anon().rpc('submit_recovery_request', { p_username: '', p_contact: '@x_y_z', p_message: 'нет ни имени ни почты' });
  assert.ok(empty.error, 'без имени и почты заявка не принимается');
  const { data } = await boss.c.rpc('admin_list_recovery');
  assert.equal(data.find((r) => r.contact === '@by_mail').user_id, user.id);
});

test('активность: заходы фиксируются сеансами, админ ищет по датам', async () => {
  await user.c.rpc('touch_activity', { p_user_agent: 'test-agent' });
  await user.c.rpc('touch_activity', { p_user_agent: 'test-agent' });
  const { data } = await boss.c.rpc('admin_user_activity', { p_user: user.id });
  assert.equal(data.length, 1, 'повторный заход в течение 30 минут — тот же сеанс');
  // Сеанс старше 30 минут — новый заход
  await admin.from('user_sessions').update({ last_seen_at: new Date(Date.now() - 3600_000).toISOString() }).eq('user_id', user.id);
  await user.c.rpc('touch_activity', { p_user_agent: 'test-agent' });
  const { data: two } = await boss.c.rpc('admin_user_activity', { p_user: user.id });
  assert.equal(two.length, 2);
  const tomorrow = new Date(Date.now() + 86400_000).toISOString();
  const { data: none } = await boss.c.rpc('admin_user_activity', { p_user: user.id, p_from: tomorrow });
  assert.equal(none.length, 0, 'поиск по дате: после завтра заходов нет');
  const hide = await other.c.rpc('admin_user_activity', { p_user: user.id });
  assert.ok(hide.error, 'обычному пользователю активность чужого аккаунта недоступна');
  const direct = await user.c.from('user_sessions').select('*');
  assert.ok(direct.error || direct.data.length === 0, 'таблица сеансов закрыта');
});

test('админ меняет приватность и почту пользователя', async () => {
  const { error } = await boss.c.rpc('admin_update_privacy', { p_user: user.id, p_visibility: 'none', p_photos: false });
  assert.ifError(error);
  const { data: s } = await admin.from('privacy_settings').select('public_visibility').eq('user_id', user.id).single();
  assert.equal(s.public_visibility, 'none');
  const bad = await boss.c.rpc('admin_update_privacy', { p_user: user.id, p_visibility: 'hack', p_photos: false });
  assert.ok(bad.error);
  const deny = await other.c.rpc('admin_update_privacy', { p_user: user.id, p_visibility: 'all', p_photos: true });
  assert.ok(deny.error, 'обычный пользователь не меняет чужую приватность');
  await boss.c.rpc('admin_set_contact_email', { p_user: user.id, p_email: `fixed_${run}@mail.test` });
  const { data: c } = await admin.from('user_contacts').select('email').eq('user_id', user.id).single();
  assert.equal(c.email, `fixed_${run}@mail.test`);
});

test('админ удаляет заявку, обычный пользователь — нет', async () => {
  await admin.from('recovery_requests').delete().gte('created_at', '2000-01-01');
  await anon().rpc('submit_recovery_request', { p_username: user.username, p_contact: '@to_delete', p_message: 'заявка на удаление' });
  const { data } = await boss.c.rpc('admin_list_recovery');
  const id = data.find((r) => r.contact === '@to_delete').id;
  const deny = await user.c.rpc('admin_delete_recovery', { p_id: id });
  assert.ok(deny.error);
  const ok = await boss.c.rpc('admin_delete_recovery', { p_id: id });
  assert.ifError(ok.error);
  const { data: left } = await admin.from('recovery_requests').select('id').eq('id', id);
  assert.equal(left.length, 0);
});

test('блокировка: заблокированный входит, но ничего не может', async () => {
  const victim = await signUp(`blk_${run}`, 'Нарушитель');
  const friend = await signUp(`bf_${run}`, 'Друг нарушителя');
  await victim.c.rpc('send_friend_request', { p_addressee: friend.id });
  const { data: fr } = await friend.c.from('friendships').select('id').eq('requester_id', victim.id).single();
  await friend.c.from('friendships').update({ status: 'accepted' }).eq('id', fr.id);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
  const row = (v) => ({ user_id: victim.id, entry_date: today, mood_value: v, mood_time: new Date().toISOString(), day_part: 'day' });

  assert.equal((await victim.c.rpc('my_block_status')).data.blocked, false);
  assert.ifError((await victim.c.from('mood_entries').insert(row(4))).error, 'до блокировки отметки ставятся');

  // Права: только администратор, себя и админов блокировать нельзя
  assert.ok((await user.c.rpc('admin_block_user', { p_user: victim.id, p_until: null, p_reason: 'x' })).error);
  assert.ok((await boss.c.rpc('admin_block_user', { p_user: boss.id, p_until: null, p_reason: '' })).error);
  assert.ok((await boss.c.rpc('admin_block_user', { p_user: victim.id, p_until: new Date(Date.now() - 1000).toISOString(), p_reason: '' })).error, 'срок в прошлом');

  // Блокировка на сутки
  const until = new Date(Date.now() + 86400_000).toISOString();
  assert.ifError((await boss.c.rpc('admin_block_user', { p_user: victim.id, p_until: until, p_reason: 'Спам' })).error);
  const st = (await victim.c.rpc('my_block_status')).data;
  assert.equal(st.blocked, true);
  assert.equal(st.reason, 'Спам');
  assert.equal(new Date(st.until).toISOString(), until);

  // Заблокированный не может писать
  assert.ok((await victim.c.from('mood_entries').insert({ ...row(2), mood_time: new Date(Date.now() - 1000).toISOString() })).error, 'новая отметка запрещена');
  const { data: mine } = await admin.from('mood_entries').select('id').eq('user_id', victim.id);
  assert.ok((await victim.c.from('mood_entries').update({ mood_value: 1 }).eq('id', mine[0].id).select()).data.length === 0, 'правка запрещена');
  assert.ok((await victim.c.rpc('send_friend_request', { p_addressee: other.id })).error, 'заявка запрещена');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  assert.ok((await victim.c.storage.from('mood-photos').upload(`${victim.id}/b.png`, png, { contentType: 'image/png' })).error, 'загрузка запрещена');
  const prof = await victim.c.rpc('get_user_profile', { p_username: friend.username });
  assert.equal(prof.data.access, 'none', 'чужие профили для заблокированного закрыты');
  assert.equal((await victim.c.rpc('get_friends')).data.length, 0, 'список друзей пуст');
  assert.equal((await victim.c.from('profiles').select('id').eq('id', friend.id)).data.length, 0, 'чужие профили не читаются');
  assert.equal((await victim.c.from('profiles').select('id').eq('id', victim.id)).data.length, 1, 'свой профиль читается');

  // В админке блокировка видна
  const { data: list } = await boss.c.rpc('admin_list_users', { p_search: victim.username });
  assert.equal(list[0].is_blocked, true);
  assert.equal(list[0].block_reason, 'Спам');

  // Срок истёк — блокировка снимается сама
  await admin.from('user_blocks').update({ blocked_until: new Date(Date.now() - 1000).toISOString() }).eq('user_id', victim.id);
  assert.equal((await victim.c.rpc('my_block_status')).data.blocked, false);
  assert.ifError((await victim.c.from('mood_entries').insert({ ...row(3), mood_time: new Date(Date.now() - 2000).toISOString() })).error, 'после срока снова можно');

  // Бессрочная блокировка и разблокировка
  await boss.c.rpc('admin_block_user', { p_user: victim.id, p_until: null, p_reason: '' });
  const perm = (await victim.c.rpc('my_block_status')).data;
  assert.equal(perm.blocked, true);
  assert.equal(perm.until, null, 'навсегда');
  await boss.c.rpc('admin_unblock_user', { p_user: victim.id });
  assert.equal((await victim.c.rpc('my_block_status')).data.blocked, false);
  await boss.c.rpc('admin_block_user', { p_user: victim.id, p_until: null, p_reason: '' });
  assert.ok((await user.c.rpc('admin_unblock_user', { p_user: victim.id })).error, 'обычный пользователь не снимает блокировку');
  assert.equal((await victim.c.rpc('my_block_status')).data.blocked, true, 'блокировка осталась');
});

test('админ удаляет аккаунт, но не себя', async () => {
  const self = await boss.c.rpc('admin_delete_user', { p_user: boss.id });
  assert.ok(self.error);
  const { error } = await boss.c.rpc('admin_delete_user', { p_user: other.id });
  assert.ifError(error);
  const { data } = await admin.from('profiles').select('id').eq('id', other.id);
  assert.equal(data.length, 0);
});

test('обычный аккаунт с правами администратора: друзья, соцсеть и админ-функции работают', async () => {
  const hyb = await signUp(`hyb_${run}`, 'Георгий');
  await admin.from('admins').insert({ user_id: hyb.id, service: false });
  const p = await other.c.from('profiles').select('is_admin').eq('id', hyb.id).single();
  assert.equal(p.data.is_admin, false, 'пометки «Администратор» у него нет');
  assert.equal((await hyb.c.rpc('am_i_admin')).data, true, 'права администратора есть');
  const list = await hyb.c.rpc('admin_list_users', {});
  assert.ok(!list.error && list.data.length > 0, 'список аккаунтов доступен');
  const peer = await signUp(`peer_${run}`, 'Друг');
  const fr = await hyb.c.rpc('send_friend_request', { p_addressee: peer.id });
  assert.ok(!fr.error, `в друзья добавлять можно: ${fr.error?.message}`);
  const toService = await hyb.c.rpc('send_friend_request', { p_addressee: boss.id });
  assert.ok(toService.error, 'служебного администратора в друзья по-прежнему нельзя');
  // обычный пользователь прав не получает
  assert.equal((await other.c.rpc('am_i_admin')).data, false);
});

test('назначать и снимать администраторов может только владелец', async () => {
  const owner = await signUp(`own_${run}`, 'Владелец');
  await admin.from('admins').insert({ user_id: owner.id, service: false, owner: true });
  const second = await signUp(`sec_${run}`, 'Второй админ');
  await admin.from('admins').insert({ user_id: second.id, service: false });
  const cand = await signUp(`cnd_${run}`, 'Кандидат');

  assert.equal((await owner.c.rpc('am_i_owner')).data, true);
  assert.equal((await second.c.rpc('am_i_owner')).data, false, 'у второго админа нет доступа владельца');

  const denied = await second.c.rpc('admin_set_admin', { p_user: cand.id, p_admin: true });
  assert.ok(denied.error, 'второй админ не назначает администраторов');
  const denied2 = await other.c.rpc('admin_set_admin', { p_user: cand.id, p_admin: true });
  assert.ok(denied2.error, 'обычный пользователь тоже');

  const ok = await owner.c.rpc('admin_set_admin', { p_user: cand.id, p_admin: true });
  assert.ok(!ok.error, ok.error?.message);
  assert.equal((await cand.c.rpc('am_i_admin')).data, true, 'кандидат стал администратором');
  assert.equal((await cand.c.rpc('am_i_owner')).data, false, 'но не владельцем');

  const self = await owner.c.rpc('admin_set_admin', { p_user: owner.id, p_admin: false });
  assert.ok(self.error, 'свои права менять нельзя');

  const off = await owner.c.rpc('admin_set_admin', { p_user: cand.id, p_admin: false });
  assert.ok(!off.error, off.error?.message);
  assert.equal((await cand.c.rpc('am_i_admin')).data, false, 'права сняты');
});
