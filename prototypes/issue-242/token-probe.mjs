// PROTOTYPE ONLY. Reads a Clerk token from stdin so it never appears in argv.
const target = process.argv[2];
if (!target) {
  throw new Error("usage: printf '<token>' | node token-probe.mjs <https-url>");
}

let token = "";
for await (const chunk of process.stdin) token += chunk;
token = token.trim();
if (!token) throw new Error("token is required on stdin");

const response = await fetch(target, {
  headers: { Authorization: `Bearer ${token}` },
  redirect: "manual",
});

console.log(
  JSON.stringify({ status: response.status, body: await response.text() }),
);
