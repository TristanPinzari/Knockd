import { describe, expect, it } from "vitest";
import { decodeBase64Url, decodeSessionClaims } from "./sessionToken";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("decodeSessionClaims", () => {
  it("reads sid and sub from the payload", () => {
    const token = `${b64({ alg: "HS256" })}.${b64({ sid: "s1", sub: "m1" })}.sig`;
    expect(decodeSessionClaims(token)).toEqual({ sessionId: "s1", memberId: "m1" });
  });
  it("returns null for malformed tokens", () => {
    expect(decodeSessionClaims("nope")).toBeNull();
    expect(decodeSessionClaims("a.!!!.c")).toBeNull();
    expect(decodeSessionClaims(`a.${b64({ sid: 1 })}.c`)).toBeNull();
  });
  it("decodes unicode", () => {
    expect(decodeBase64Url(Buffer.from("héllo").toString("base64url"))).toBe("héllo");
  });
});
