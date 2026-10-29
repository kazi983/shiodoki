// Runs the local Firebase CLI with a Java 21+ runtime, which the emulators need.
//
//   node scripts/firebase.mjs emulators:exec --only firestore "vitest run"
//
// The shell may point JAVA_HOME / PATH at an older JDK for other projects, so the JDK is chosen here:
// FIREBASE_JAVA_HOME if set, else the `java` on PATH when it is 21+, else the newest JDK 21+ under /usr/lib/jvm,
// else Android Studio's JBR. It only applies to the Firebase CLI and the command it runs.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, join } from "node:path";

const MIN_JAVA = 21;

/** Major version of a java binary ("17.0.2" -> 17, "1.8.0" -> 8), or 0 when it does not run. */
function javaMajor(java) {
  const { stderr, error } = spawnSync(java, ["-version"], { encoding: "utf8" });
  const match = !error && /version "(?:1\.)?(\d+)/.exec(stderr);
  return match ? Number(match[1]) : 0;
}

function javaIn(home) {
  return join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
}

/** JAVA_HOME to use, or null to keep the environment as it is. */
function chooseJavaHome() {
  if (process.env.FIREBASE_JAVA_HOME) return process.env.FIREBASE_JAVA_HOME;
  if (javaMajor("java") >= MIN_JAVA) return null;
  const jvmDir = "/usr/lib/jvm";
  const installed = existsSync(jvmDir) ? readdirSync(jvmDir).map((name) => join(jvmDir, name)) : [];
  const candidates = [...installed, "/snap/android-studio/current/jbr"]
    .filter((home) => existsSync(javaIn(home)))
    .map((home) => ({ home, major: javaMajor(javaIn(home)) }))
    .filter((c) => c.major >= MIN_JAVA)
    .sort((a, b) => b.major - a.major);
  if (candidates.length === 0) {
    console.warn(`No Java ${MIN_JAVA}+ found; set FIREBASE_JAVA_HOME to a JDK ${MIN_JAVA}+.`);
    return null;
  }
  return candidates[0].home;
}

const env = { ...process.env };
const javaHome = chooseJavaHome();
if (javaHome) {
  env.JAVA_HOME = javaHome;
  env.PATH = `${join(javaHome, "bin")}${delimiter}${env.PATH ?? ""}`;
}

const cli = createRequire(import.meta.url).resolve("firebase-tools/lib/bin/firebase.js");
const { status, signal } = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: "inherit" });
process.exit(status ?? (signal ? 1 : 0));
