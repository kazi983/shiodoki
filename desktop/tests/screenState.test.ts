import { describe, expect, test } from "vitest";
import { parseScreenSaverLine, ScreenState } from "../src/main/screenState";

function track() {
  const events: string[] = [];
  const state = new ScreenState({ onOff: () => events.push("off"), onOn: () => events.push("on") });
  return { state, events };
}

describe("ScreenState", () => {
  test("lock and unlock", () => {
    const { state, events } = track();
    state.setLocked(true);
    state.setLocked(true);
    state.setLocked(false);
    expect(events).toEqual(["off", "on"]);
  });

  test("suspend and resume without a lock", () => {
    const { state, events } = track();
    state.setSuspended(true);
    state.setSuspended(false);
    expect(events).toEqual(["off", "on"]);
  });

  test("resuming to the lock screen waits for the unlock", () => {
    const { state, events } = track();
    state.setLocked(true);
    state.setSuspended(true);
    state.setSuspended(false);
    expect(events).toEqual(["off"]);
    state.setLocked(false);
    expect(events).toEqual(["off", "on"]);
  });
});

describe("parseScreenSaverLine", () => {
  test("reads ActiveChanged", () => {
    expect(parseScreenSaverLine("/org/gnome/ScreenSaver: org.gnome.ScreenSaver.ActiveChanged (true,)")).toBe(true);
    expect(parseScreenSaverLine("/org/gnome/ScreenSaver: org.gnome.ScreenSaver.ActiveChanged (false,)")).toBe(false);
    expect(parseScreenSaverLine("/org/gnome/ScreenSaver: org.gnome.ScreenSaver.WakeUpScreen ()")).toBeNull();
    expect(parseScreenSaverLine("The name org.gnome.ScreenSaver is owned by :1.42")).toBeNull();
  });
});
