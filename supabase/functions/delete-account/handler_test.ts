import { makeHandler } from "./handler.ts";

const call = (h: (r: Request) => Promise<Response>, init: RequestInit & { headers?: Record<string, string> }) =>
  h(new Request("http://localhost/delete-account", init));

function fake(users: Record<string, string>) {
  const deleted: string[] = [];
  return {
    deleted,
    admin: {
      getUser: (t: string) => Promise.resolve(users[t] ? { id: users[t] } : null),
      deleteUser: (id: string) => { deleted.push(id); return Promise.resolve(null); },
    },
  };
}

Deno.test("deletes only the user the token belongs to", async () => {
  const f = fake({ "tok-a": "user-a", "tok-b": "user-b" });
  const res = await call(makeHandler(f.admin), { method: "POST", headers: { authorization: "Bearer tok-a" }, body: JSON.stringify({ confirm: true }) });
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  if (JSON.stringify(f.deleted) !== JSON.stringify(["user-a"])) throw new Error(`deleted ${f.deleted}`);
});

Deno.test("refuses without a token, with a bad token, without confirmation, or with the wrong method", async () => {
  const f = fake({ "tok-a": "user-a" });
  const h = makeHandler(f.admin);
  const cases: [RequestInit, number][] = [
    [{ method: "POST", body: JSON.stringify({ confirm: true }) }, 401],
    [{ method: "POST", headers: { authorization: "Bearer nope" }, body: JSON.stringify({ confirm: true }) }, 401],
    [{ method: "POST", headers: { authorization: "Bearer tok-a" }, body: "{}" }, 400],
    [{ method: "POST", headers: { authorization: "Bearer tok-a" } }, 400],
    [{ method: "GET", headers: { authorization: "Bearer tok-a" } }, 405],
  ];
  for (const [init, want] of cases) {
    const res = await call(h, init as never);
    if (res.status !== want) throw new Error(`${JSON.stringify(init)} -> ${res.status}, wanted ${want}`);
  }
  if (f.deleted.length) throw new Error("nothing may be deleted in any refused case");
});
