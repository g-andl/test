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
  assert.equal((await admin.from('user_badges').select('user_id').eq('user_id', user.id)).data.length, 0, 'снят');
  assert.ifError((await boss.c.rpc('admin_delete_badge', { p_id: id })).error);
  assert.equal((await admin.from('user_badges').select('user_id').eq('badge_id', id)).data.length, 0, 'у второго тоже снят');
  assert.ok((await boss.c.rpc('admin_set_user_badge', { p_user: user.id, p_badge: id })).error, 'удалённый выдать нельзя');
  assert.ok((await boss.c.rpc('admin_set_user_badge', { p_user: '00000000-0000-0000-0000-000000000000', p_badge: null })).error, 'нет такого пользователя');
  const x = await mk('xx');
  const { data: keep } = await admin.from('badges').select('id').limit(1).single();
  await boss.c.rpc('admin_set_user_badge', { p_user: x.id, p_badge: keep.id });
  await admin.auth.admin.deleteUser(x.id);
  assert.equal((await admin.from('user_badges').select('user_id').eq('user_id', x.id)).data.length, 0);
});
