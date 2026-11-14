// Тесты статусов пользователей. Запуск: npm run test:badges (нужен локальный Supabase)
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
async function mk(name) {
  const username = `${name}_${run}`;
  const email = `u_${username}@users.nastroy.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!x', email_confirm: true, user_metadata: { username, display_name: name } });
  if (error) throw error;
  const c = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: 'Passw0rd!x' });
  return { c, id: data.user.id, username };
}
let boss, user, other;
before(async () => {
  boss = await mk('bs'); user = await mk('us'); other = await mk('ot');
  await admin.from('admins').insert({ user_id: boss.id });
});

test('готовые статусы есть, читать их может любой вошедший', async () => {
  const { data } = await user.c.from('badges').select('name, color');
  const names = data.map((b) => b.name);
  for (const n of ['Новичок', 'Старейшина']) assert.ok(names.includes(n), n);
  assert.ok(data.every((b) => /^#[0-9a-f]{6}$/.test(b.color)));
  const anon = createClient(env.API_URL, env.ANON_KEY, { auth: { persistSession: false } });
  assert.equal(((await anon.from('badges').select('*')).data ?? []).length, 0, 'без входа статусы не видны');
});

test('создавать, менять, выдавать и удалять статусы может только админ', async () => {
  for (const [fn, args] of [
    ['admin_save_badge', { p_id: null, p_name: 'Хакер', p_color: '#ff0000' }],
    ['admin_set_user_badge', { p_user: user.id, p_badge: null }],
    ['admin_delete_badge', { p_id: '00000000-0000-0000-0000-000000000000' }],
  ]) assert.ok((await user.c.rpc(fn, args)).error, `${fn} закрыт`);
  assert.ok((await user.c.from('badges').insert({ name: 'x', color: '#000000' })).error, 'прямая вставка закрыта');
  assert.ok((await user.c.from('user_badges').insert({ user_id: user.id, badge_id: '00000000-0000-0000-0000-000000000000' })).error, 'самовыдача закрыта');
});

test('админ создаёт свой статус с цветом и выдаёт пользователю', async () => {
  const { data: id, error } = await boss.c.rpc('admin_save_badge', { p_id: null, p_name: `  Легенда ${run}  `, p_color: '#8B7CF6' });
  assert.ifError(error);
  const { data: b } = await user.c.from('badges').select('name, color').eq('id', id).single();
  assert.equal(b.name, `Легенда ${run}`, 'имя обрезано');
  assert.equal(b.color, '#8b7cf6', 'цвет в нижнем регистре');
  assert.ifError((await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: id })).error);
  const { data: ub } = await other.c.from('user_badges').select('badge_id').eq('user_id', user.id).single();
  assert.equal(ub.badge_id, id, 'статус видят другие пользователи');
  // замена статуса: у пользователя только один
  const { data: id2 } = await boss.c.rpc('admin_save_badge', { p_id: null, p_name: `Мудрец ${run}`, p_color: '#d99a1e' });
  await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: id2 });
  const { data: all } = await admin.from('user_badges').select('badge_id').eq('user_id', user.id);
  assert.equal(all.length, 1);
  assert.equal(all[0].badge_id, id2);
  // изменить цвет и название
  assert.ifError((await boss.c.rpc('admin_save_badge', { p_id: id2, p_name: `Мудрец ${run}!`, p_color: '#112233' })).error);
  const { data: upd } = await user.c.from('badges').select('name, color').eq('id', id2).single();
  assert.equal(upd.color, '#112233');
});

test('проверка названия и цвета, повторов', async () => {
  for (const [name, color] of [['', '#ffffff'], ['х'.repeat(25), '#ffffff'], ['Нормально', 'red'], ['Нормально', '#12345'], ['Нормально', '#gggggg']]) {
    assert.ok((await boss.c.rpc('admin_save_badge', { p_id: null, p_name: name, p_color: color })).error, `${name.slice(0, 5)}/${color}`);
  }
  assert.ok((await boss.c.rpc('admin_save_badge', { p_id: null, p_name: ' новичок ', p_color: '#000000' })).error, 'повтор названия без учёта регистра');
  assert.ok((await boss.c.rpc('admin_save_badge', { p_id: '00000000-0000-0000-0000-000000000000', p_name: 'Нет такого', p_color: '#000000' })).error);
});

test('снять статус; удаление статуса снимает его у всех; удаление аккаунта чистит выдачу', async () => {
  const { data: id } = await boss.c.rpc('admin_save_badge', { p_id: null, p_name: `Временный ${run}`, p_color: '#36b5c9' });
  await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: id });
  await boss.c.rpc('admin_set_user_badge', { p_user: other.id, p_badge: id });
  assert.ifError((await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: null })).error);
  const after = (await admin.from('user_badges').select('source, badge_id').eq('user_id', user.id)).data;
  assert.ok(after.length === 0 || (after[0].source === 'auto' && after[0].badge_id !== id), 'ручной статус снят, остаться может только автоматический');
  assert.ifError((await boss.c.rpc('admin_delete_badge', { p_id: id })).error);
  assert.equal((await admin.from('user_badges').select('user_id').eq('badge_id', id)).data.length, 0, 'у второго тоже снят');
  assert.ok((await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: id })).error, 'удалённый выдать нельзя');
  assert.ok((await boss.c.rpc('admin_set_user_badge', { p_user: '00000000-0000-0000-0000-000000000000', p_badge: null })).error, 'нет такого пользователя');
  const x = await mk('xx');
  const { data: keep } = await admin.from('badges').select('id').is('auto_key', null).limit(1).single();
  await boss.c.rpc('admin_set_user_badge', { p_user: x.id, p_badge: keep.id });
  await admin.auth.admin.deleteUser(x.id);
  assert.equal((await admin.from('user_badges').select('user_id').eq('user_id', x.id)).data.length, 0);
});


// ---------- Автоматические статусы ----------
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);
const entry = (uid, date, v = 4) => ({ user_id: uid, entry_date: date, mood_value: v, mood_time: `${date}T12:00:00Z`, day_part: 'day' });
async function addEntries(uid, dates) {
  const { error } = await admin.from('mood_entries').insert(dates.map((d) => entry(uid, d)));
  if (error) throw error;
}
const currentBadge = async (u) => {
  await u.c.rpc('touch_activity', { p_user_agent: 'test' });      // пересчёт при заходе
  const { data } = await admin.from('user_badges').select('source, badges(name, auto_key)').eq('user_id', u.id);
  return data[0] ? { source: data[0].source, key: data[0].badges.auto_key } : null;
};

test('новичок получает «Новичок» автоматически при первом заходе', async () => {
  const u = await mk('nb');
  assert.deepEqual(await currentBadge(u), { source: 'auto', key: 'newbie' });
});

test('7 дней подряд — «Огонёк», 30 дней подряд — «Стойкий»', async () => {
  const u = await mk('sp');
  await addEntries(u.id, Array.from({ length: 7 }, (_, i) => daysAgo(i)));
  assert.equal((await currentBadge(u)).key, 'spark');
  // серия, закончившаяся вчера, ещё считается
  const v = await mk('sv');
  await addEntries(v.id, Array.from({ length: 7 }, (_, i) => daysAgo(i + 1)));
  assert.equal((await currentBadge(v)).key, 'spark', 'серия до вчера засчитывается');
  // разрыв: позавчера последняя отметка — серии нет
  const w = await mk('sw');
  await addEntries(w.id, Array.from({ length: 7 }, (_, i) => daysAgo(i + 2)));
  assert.notEqual((await currentBadge(w))?.key, 'spark', 'разрыв больше дня обрывает серию');
  const st = await mk('st');
  await addEntries(st.id, Array.from({ length: 30 }, (_, i) => daysAgo(i)));
  assert.equal((await currentBadge(st)).key, 'steadfast');
});

test('активность без серии — «Активист»; много отметок — «Летописец»', async () => {
  const a = await mk('ac');
  await addEntries(a.id, Array.from({ length: 10 }, (_, i) => daysAgo(i * 2 + 1)));
  assert.equal((await currentBadge(a)).key, 'activist');
  const c = await mk('ch');
  await addEntries(c.id, Array.from({ length: 100 }, (_, i) => daysAgo(i + 40)));
  assert.equal((await currentBadge(c)).key, 'chronicler');
});

test('давняя регистрация: «Свой человек» (месяц, 5+ отметок) и «Старейшина» (полгода, 30+ отметок)', async () => {
  const r = await mk('rg');
  const sql = (days) => execSync(`docker exec supabase_db_nastroy psql -U postgres -tAc "update auth.users set created_at = now() - interval '${days} days' where id = '${r.id}'"`);
  await addEntries(r.id, Array.from({ length: 5 }, (_, i) => daysAgo(i * 3 + 5)));
  sql(45);
  assert.equal((await currentBadge(r)).key, 'regular');
  const e = await mk('el');
  await addEntries(e.id, Array.from({ length: 30 }, (_, i) => daysAgo(i * 3 + 5)));
  execSync(`docker exec supabase_db_nastroy psql -U postgres -tAc "update auth.users set created_at = now() - interval '200 days' where id = '${e.id}'"`);
  assert.equal((await currentBadge(e)).key, 'elder');
});

test('друзья и тёплые слова: «Душа компании», «Добрая душа»', async () => {
  const s = await mk('so');
  const friends = await Promise.all([1, 2, 3, 4, 5].map((i) => mk(`fr${i}`)));
  await admin.from('friendships').insert(friends.map((f) => ({ requester_id: s.id, addressee_id: f.id, status: 'accepted' })));
  assert.equal((await currentBadge(s)).key, 'social');
  const k = await mk('kn');
  const recipients = await Promise.all([1, 2, 3, 4].map((i) => mk(`rc${i}`)));
  const rows = Array.from({ length: 10 }, (_, i) => ({ recipient_id: recipients[i % 4].id, author_id: k.id, body: `тёплое слово ${i}` }));
  await admin.from('support_messages').insert(rows);
  assert.equal((await currentBadge(k)).key, 'kind');
});

test('ручной статус система не перезаписывает; «снять» возвращает автоматический', async () => {
  const u = await mk('mn');
  const { data: manual } = await admin.from('badges').select('id').eq('auto_key', 'elder').single();
  await boss.c.rpc('admin_set_user_badge', { p_user: u.id, p_badge: manual.id });
  await addEntries(u.id, Array.from({ length: 7 }, (_, i) => daysAgo(i)));
  assert.deepEqual(await currentBadge(u), { source: 'manual', key: 'elder' }, 'ручной остаётся после захода');
  await boss.c.rpc('admin_refresh_badges');
  assert.equal((await currentBadge(u)).source, 'manual', 'и после общего пересчёта');
  await boss.c.rpc('admin_set_user_badge', { p_user: u.id, p_badge: null });
  assert.deepEqual(await currentBadge(u), { source: 'auto', key: 'spark' }, 'после снятия — автоматический по активности');
  assert.ok((await user.c.rpc('admin_refresh_badges')).error, 'пересчёт — только админу');
});

test('автоматические статусы нельзя удалить, но можно переименовать и перекрасить', async () => {
  const { data: b } = await admin.from('badges').select('id, name, color').eq('auto_key', 'spark').single();
  assert.ok((await boss.c.rpc('admin_delete_badge', { p_id: b.id })).error, 'встроенный не удаляется');
  assert.ifError((await boss.c.rpc('admin_save_badge', { p_id: b.id, p_name: b.name, p_color: '#f08a3d' })).error);
  await boss.c.rpc('admin_save_badge', { p_id: b.id, p_name: b.name, p_color: b.color });
  const { data: hint } = await user.c.from('badges').select('hint').eq('id', b.id).single();
  assert.match(hint.hint, /7 дней подряд/, 'подсказка видна всем');
});

test('пересчёт у всех: статус уходит, когда условие пропало (Новичок → ничего)', async () => {
  const u = await mk('ol');
  assert.equal((await currentBadge(u)).key, 'newbie');
  execSync(`docker exec supabase_db_nastroy psql -U postgres -tAc "update auth.users set created_at = now() - interval '20 days' where id = '${u.id}'"`);
  const { data: n } = await boss.c.rpc('admin_refresh_badges');
  assert.ok(n > 0);
  const { data } = await admin.from('user_badges').select('user_id').eq('user_id', u.id);
  assert.equal(data.length, 0, 'через две недели «Новичок» снимается');
});
