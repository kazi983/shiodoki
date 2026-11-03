import { describe, expect, test } from "vitest";
import { clockSkewMinutes, parseUtcOffset } from "../src/main/clockCheck";

describe("parseUtcOffset", () => {
  test("reads date +%z output", () => {
    expect(parseUtcOffset("+0900\n")).toBe(540);
    expect(parseUtcOffset("-0700")).toBe(-420);
    expect(parseUtcOffset("+0530")).toBe(330);
    expect(parseUtcOffset("+0000")).toBe(0);
  });

  test("anything else is unknown", () => {
    expect(parseUtcOffset("")).toBeNull();
    expect(parseUtcOffset("PDT")).toBeNull();
    expect(parseUtcOffset("+09:00")).toBeNull();
  });
});

describe("clockSkewMinutes", () => {
  const fakeNow = (offsetMinutesWest: number) => ({ getTimezoneOffset: () => offsetMinutesWest }) as Date;

  test("zero when the app and the OS agree", () => {
    expect(clockSkewMinutes(fakeNow(420), -420)).toBe(0);
  });

  test("old time zone data: the app is on PST (-8) while the OS is on UTC-7", () => {
    expect(clockSkewMinutes(fakeNow(480), -420)).toBe(-60);
  });
});
