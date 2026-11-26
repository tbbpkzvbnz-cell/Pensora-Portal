import { describe, expect, it } from "vitest";
import { DEFAULT_GRANTS, LOCKED_GL_PERMISSIONS, PERMISSIONS, ROLES, ROLE_SCOPE } from "@/server/authz/permissions";

describe("Berechtigungen", () => {
  it("every role has a scope and only known permissions", () => {
    for (const r of ROLES) {
      expect(ROLE_SCOPE[r]).toBeDefined();
      for (const p of DEFAULT_GRANTS[r]) expect(PERMISSIONS).toHaveProperty(p);
    }
  });
  it("Pensora GL holds the lock-out-protected permissions", () => {
    for (const p of LOCKED_GL_PERMISSIONS) expect(DEFAULT_GRANTS.pensora_gl).toContain(p);
  });
  it("Closer is prepared but disabled", () => {
    expect(DEFAULT_GRANTS.pensora_closer).toEqual([]);
    expect(ROLE_SCOPE.pensora_closer).toBe("none");
  });
  it("only Pensora GL may change outcome statuses and transmit is back-office/GL", () => {
    const holders = (p: keyof typeof PERMISSIONS) => ROLES.filter((r) => DEFAULT_GRANTS[r].includes(p));
    expect(holders("applications.change_outcome")).toEqual(["pensora_gl"]);
    expect(holders("review.transmit").sort()).toEqual(["pensora_backoffice", "pensora_gl"]);
  });
  it("brokers never see internal notes and are scoped to firm/own", () => {
    expect(DEFAULT_GRANTS.broker_gl).not.toContain("notes.view_internal");
    expect(DEFAULT_GRANTS.broker_advisor).not.toContain("notes.view_internal");
    expect(ROLE_SCOPE.broker_gl).toBe("firm");
    expect(ROLE_SCOPE.broker_advisor).toBe("own");
  });
});
