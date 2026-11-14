// Проверка всей цепочки push: отметка друга → триггер → pg_net → Edge Function → Web Push.
// Вместо настоящего push-сервиса (FCM/Apple) поднимаем свой приёмник и расшифровываем сообщение.
// Запуск: npx supabase functions serve --env-file supabase/functions/.env  (в другом терминале)
//         npm run test:push
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  execSync("npx supabase status -o env", { encoding: "utf8" })
    .split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
const fnEnv = Object.fromEntries(
  readFileSync("supabase/functions/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const run = Date.now().toString(36);
const b64u = (buf) => Buffer.from(buf).toString("base64url");

/** Расшифровка aes128gcm (RFC 8291) — так же, как это делает браузер */
function decrypt(body, ecdh, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const serverKey = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(serverKey);
  const clientPub = ecdh.getPublicKey();
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), clientPub, serverKey]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, authSecret, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString("utf8");
}

test("push доходит до устройства и не раскрывает заметку", async () => {
  // Приёмник push на хосте; доступен из контейнеров через шлюз docker-сети
  const gateway = execSync("docker network inspect supabase_network_nastroy -f '{{range .IPAM.Config}}{{.Gateway}}{{end}}'", { encoding: "utf8" }).trim();
  const received = new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        res.writeHead(201).end();
        srv.close();
        resolve({ headers: req.headers, body: Buffer.concat(chunks) });
      });
    });
    srv.listen(0, "0.0.0.0", () => (srv.portNumber = srv.address().port));
    received.srv = srv;
  });
  await new Promise((r) => setTimeout(r, 100));
  const port = received.srv.address().port;

  // Секреты Vault: куда триггеру отправлять запрос
  const sql = (q) => execSync(`docker exec supabase_db_nastroy psql -U postgres -tAc "${q}"`, { encoding: "utf8" });
  sql("delete from vault.secrets where name in ('push_function_url','push_webhook_secret')");
  sql("select vault.create_secret('http://supabase_kong_nastroy:8000/functions/v1/send-push','push_function_url')");
  sql(`select vault.create_secret('${fnEnv.PUSH_WEBHOOK_SECRET}','push_webhook_secret')`);

  const mk = async (name) => {
    const { data } = await admin.auth.admin.createUser({
      email: `${name}_${run}@test.local`, password: "Passw0rd!x", email_confirm: true,
      user_metadata: { username: `${name}_${run}`.slice(0, 24), display_name: name === "pa" ? "Аня" : "Петя" },
    });
    return data.user.id;
  };
  const anya = await mk("pa");
  const petya = await mk("pp");
  await admin.from("friendships").insert({ requester_id: anya, addressee_id: petya });
  await admin.from("friendships").update({ status: "accepted" }).eq("requester_id", anya);

  // Подписка «устройства» Пети
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  await admin.from("notification_settings").update({ push_enabled: true }).eq("user_id", petya);
  await admin.from("push_subscriptions").insert({
    user_id: petya,
    endpoint: `http://${gateway}:${port}/push/${run}`,
    subscription: { endpoint: `http://${gateway}:${port}/push/${run}`, keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(authSecret) } },
  });

  // Аня отмечает настроение с секретной заметкой
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  const ins = await admin.from("mood_entries").insert({
    user_id: anya, entry_date: today, mood_value: 2, note: "СЕКРЕТНАЯ ЗАМЕТКА",
    mood_time: new Date().toISOString(), day_part: "day",
  });
  assert.ifError(ins.error);

  const got = await Promise.race([received, new Promise((_, rej) => setTimeout(() => rej(new Error("push не пришёл за 20 с")), 20000))]);
  assert.equal(got.headers["content-encoding"], "aes128gcm");
  assert.match(got.headers.authorization, /^vapid t=.+, k=.+/);
  const payload = JSON.parse(decrypt(got.body, ecdh, authSecret));
  assert.equal(payload.body, "Аня сегодня чувствует себя немного грустно");
  assert.ok(!JSON.stringify(payload).includes("СЕКРЕТНАЯ"), "заметка не попала в push");
  assert.match(payload.url, /\/user\/\?u=pa_/);
  console.log("push:", payload);

  sql("delete from vault.secrets where name in ('push_function_url','push_webhook_secret')");
});
