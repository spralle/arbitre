import { describe, expect, it } from "vitest";
import { createSession } from "../session.js";

// ---------------------------------------------------------------------------
// Conformance: B2B logistics scenarios (ADR §15, §16)
// ---------------------------------------------------------------------------

describe("Conformance: B2B logistics scenarios", () => {
  it("hazmat shipment shows warning and requires hazmat form", () => {
    const session = createSession({
      initialState: {
        shipmentType: "hazmat",
        weight: 500,
      },
      rules: [
        {
          name: "hazmat-warning",
          when: { shipmentType: "hazmat" },
          then: [{ $set: { "$ui.hazmatWarning.visible": true, "$ui.hazmatForm.required": true } }],
        },
        {
          name: "standard-no-warning",
          when: { shipmentType: { $ne: "hazmat" } },
          then: [{ $set: { "$ui.hazmatWarning.visible": false, "$ui.hazmatForm.required": false } }],
        },
      ],
    });

    const result = session.fire();
    expect(result.rulesFired).toBeGreaterThanOrEqual(1);
    expect(session.getPath("$ui.hazmatWarning.visible")).toBe(true);
    expect(session.getPath("$ui.hazmatForm.required")).toBe(true);
  });

  it("weight-based surcharge calculation", () => {
    const session = createSession({
      initialState: { weight: 150, baseRate: 10 },
      rules: [
        {
          name: "heavy-surcharge",
          when: { weight: { $gt: 100 } },
          then: [{ $set: { "$state.surcharge": { $multiply: ["$weight", 0.5] } } }],
        },
        {
          name: "light-no-surcharge",
          when: { weight: { $lte: 100 } },
          then: [{ $set: { "$state.surcharge": 0 } }],
        },
      ],
    });
    session.fire();
    expect(session.getPath("$state.surcharge")).toBe(75);
  });

  it("conditional field visibility with else branch", () => {
    const session = createSession({
      initialState: { mode: "sea" },
      rules: [
        {
          name: "container-fields",
          when: { mode: "sea" },
          then: [{ $set: { "$ui.containerSize.visible": true, "$ui.vesselName.visible": true } }],
          else: [{ $set: { "$ui.containerSize.visible": false, "$ui.vesselName.visible": false } }],
        },
      ],
    });
    session.fire();
    expect(session.getPath("$ui.containerSize.visible")).toBe(true);

    session.update("mode", "air");
    expect(session.getPath("$ui.containerSize.visible")).toBe(false);
  });

  it("multi-rule chaining: line item totals", () => {
    const session = createSession({
      initialState: {
        quantity: 10,
        unitPrice: 25,
        taxRate: 0.08,
      },
      rules: [
        {
          name: "calc-subtotal",
          when: { quantity: { $gt: 0 }, unitPrice: { $gt: 0 } },
          then: [{ $set: { "$state.subtotal": { $multiply: ["$quantity", "$unitPrice"] } } }],
          salience: 10,
        },
        {
          name: "calc-tax",
          when: { "$state.subtotal": { $gt: 0 } },
          then: [{ $set: { "$state.tax": { $multiply: ["$state.subtotal", "$taxRate"] } } }],
          salience: 5,
        },
        {
          name: "calc-total",
          when: { "$state.subtotal": { $gt: 0 }, "$state.tax": { $exists: true } },
          then: [{ $set: { "$state.total": { $sum: ["$state.subtotal", "$state.tax"] } } }],
          salience: 1,
        },
      ],
    });
    const result = session.fire();
    expect(result.rulesFired).toBe(3);
    expect(session.getPath("$state.subtotal")).toBe(250);
    expect(session.getPath("$state.tax")).toBe(20);
    expect(session.getPath("$state.total")).toBe(270);
  });

  it("TMS auto-retract on $ui namespace when condition flips", () => {
    const session = createSession({
      initialState: { requiresApproval: true },
      rules: [
        {
          name: "approval-section",
          when: { requiresApproval: true },
          then: [{ $set: { "$ui.approvalSection.visible": true, "$ui.approverField.required": true } }],
        },
      ],
    });
    session.fire();
    expect(session.getPath("$ui.approvalSection.visible")).toBe(true);

    session.update("requiresApproval", false);
    expect(session.getPath("$ui.approvalSection.visible")).toBeUndefined();
    expect(session.getPath("$ui.approverField.required")).toBeUndefined();
  });

  it("salience-based conflict resolution fires both rules", () => {
    const session = createSession({
      initialState: { active: true },
      rules: [
        {
          name: "low-priority",
          when: { active: true },
          then: [{ $set: { "$state.order": "low" } }],
          salience: 1,
        },
        {
          name: "high-priority",
          when: { active: true },
          then: [{ $set: { "$state.order": "high" } }],
          salience: 10,
        },
      ],
    });
    const result = session.fire();
    expect(result.rulesFired).toBe(2);
  });

  it("reactive update triggers fire automatically", () => {
    const session = createSession({
      initialState: { count: 0 },
      rules: [
        {
          name: "count-check",
          when: { count: { $gt: 5 } },
          then: [{ $set: { "$ui.warning.visible": true } }],
        },
      ],
    });
    session.fire();
    expect(session.getPath("$ui.warning.visible")).toBeUndefined();

    const result = session.update("count", 10);
    expect(result.rulesFired).toBeGreaterThanOrEqual(1);
    expect(session.getPath("$ui.warning.visible")).toBe(true);
  });

  it("subscription notification after fire cycle", () => {
    let notified = false;
    const session = createSession({
      initialState: { trigger: false },
      rules: [
        {
          name: "trigger-rule",
          when: { trigger: true },
          then: [{ $set: { "$state.result": "fired" } }],
        },
      ],
    });

    session.subscribe("$state.result", () => {
      notified = true;
    });

    session.update("trigger", true);
    expect(notified).toBe(true);
  });

  it("rule removal retracts writes via TMS", () => {
    const session = createSession({
      initialState: { flag: true },
      rules: [
        {
          name: "removable-rule",
          when: { flag: true },
          then: [{ $set: { "$ui.panel.visible": true } }],
        },
      ],
    });
    session.fire();
    expect(session.getPath("$ui.panel.visible")).toBe(true);

    session.removeRule("removable-rule");
    expect(session.getPath("$ui.panel.visible")).toBeUndefined();
  });

  it("handles empty rule set gracefully", () => {
    const session = createSession({ initialState: { name: "test" } });
    const result = session.fire();
    expect(result.rulesFired).toBe(0);
    expect(result.cycles).toBe(0);
  });
});
