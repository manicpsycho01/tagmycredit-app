/** Local worker: runs the tick every 60 s (deployed environments call /api/cron/tick instead). */
import { closeDb, getDb } from "@tmc/db";
import { now } from "@tmc/db/clock";
import { runTick } from "@tmc/db/jobs";

const INTERVAL_MS = 60_000;
let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const result = await runTick(getDb(), now());
    const changed = Object.entries(result).filter(([, n]) => n > 0);
    if (changed.length) console.log(new Date().toISOString(), "tick", Object.fromEntries(changed));
  } catch (e) {
    console.error(new Date().toISOString(), "tick failed", e);
  } finally {
    running = false;
  }
}

const timer = setInterval(tick, INTERVAL_MS);
void tick();
console.log("TagMyCredit worker: tick every 60 s");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(timer);
    void closeDb().then(() => process.exit(0));
  });
}
