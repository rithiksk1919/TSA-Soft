// Starts the SkillBridge app (the Python server): the school hub at /, the library at /library/.
// usage: node scripts/serve.mjs [port]      (same as: python3 run.py --port <port>)
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
let port = "5180";
const given = process.argv[2];
if (given && /^\d+$/.test(given)) {
  port = given;
}
let python = "python3";
if (process.platform === "win32") {
  python = "python";
}

const child = spawn(python, ["run.py", "--port", port, "--no-browser"], { cwd: root, stdio: "inherit" });
console.log("SkillBridge: open http://127.0.0.1:" + port + "/  (school hub)");
child.on("error", function (error) {
  console.error("Could not start Python (" + python + "). Install Python 3.10+ and try again. " + error.message);
  process.exit(1);
});
child.on("exit", function (code) {
  process.exit(code === null ? 0 : code);
});
process.on("SIGINT", function () {
  child.kill("SIGINT");
});
