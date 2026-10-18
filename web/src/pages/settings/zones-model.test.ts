import { describe, expect, it } from "vitest";
import {
  addLastZone,
  deserializeZones,
  MAX_ZONES_COUNT,
  parseZonesImport,
  removeLastZone,
  removeZoneAt,
  serializeZones,
  setZoneBound,
  zoneDefinition,
  zonesError,
  type ZoneRange
} from "./zones-model";

const tenZones = (): ZoneRange[] => Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: (i + 1) * 10 }));

describe("zones editing (ZonesService)", () => {
  it("adds a last zone by splitting the last one", () => {
    const r = addLastZone(tenZones());
    if ("error" in r) throw new Error(r.error);
    expect(r.message).toBe("Zone 11 has been added.");
    expect(r.zones.length).toBe(11);
    expect(r.zones[10]).toEqual({ from: 95, to: 100 });
    expect(r.zones[9]).toEqual({ from: 90, to: 95 });
  });

  it("does not add a zone past the max count", () => {
    const zones = Array.from({ length: MAX_ZONES_COUNT }, (_, i) => ({ from: i, to: i + 1 }));
    expect(addLastZone(zones)).toEqual({ error: `You can't add more than ${MAX_ZONES_COUNT} zones...` });
  });

  it("removes the last zone", () => {
    const r = removeLastZone(tenZones());
    if ("error" in r) throw new Error(r.error);
    expect(r.message).toBe("Zone 10 has been removed.");
    expect(r.zones.length).toBe(9);
    expect(r.zones[8]).toEqual({ from: 80, to: 90 });
  });

  it("does not remove below the min count", () => {
    const three = tenZones().slice(0, 3);
    expect("error" in removeLastZone(three)).toBe(true);
    expect("error" in removeZoneAt(three, 1)).toBe(true);
  });

  it("removes a middle zone, the next zone absorbing its range", () => {
    const r = removeZoneAt(tenZones(), 5);
    if ("error" in r) throw new Error(r.error);
    expect(r.zones.length).toBe(9);
    expect(r.zones[4]).toEqual({ from: 40, to: 50 });
    expect(r.zones[5]).toEqual({ from: 50, to: 70 });
    expect(zonesError(r.zones)).toBeNull();
  });

  it("removes first and last zones", () => {
    const first = removeZoneAt(tenZones(), 0);
    const last = removeZoneAt(tenZones(), 9);
    if ("error" in first || "error" in last) throw new Error();
    expect(first.zones[0]).toEqual({ from: 10, to: 20 });
    expect(last.zones[8]).toEqual({ from: 80, to: 90 });
  });

  it("propagates a bound change to the neighbour (whisper)", () => {
    let z = setZoneBound(tenZones(), 3, "from", 25);
    expect(z[2].to).toBe(25);
    expect(z[3].from).toBe(25);
    z = setZoneBound(tenZones(), 3, "to", 45);
    expect(z[4].from).toBe(45);
    // first zone's "from" and last zone's "to" have no neighbour
    z = setZoneBound(tenZones(), 0, "from", 5);
    expect(z[0].from).toBe(5);
    z = setZoneBound(tenZones(), 9, "to", 120);
    expect(z[9].to).toBe(120);
    expect(zonesError(z)).toBeNull();
  });
});

describe("zones compliance", () => {
  it("accepts compliant zones", () => expect(zonesError(tenZones())).toBeNull());
  it("rejects gaps", () => {
    const z = tenZones();
    z[3].to = 35;
    expect(zonesError(z)).toBe("Not compliant zones provided: pattern is not respected.");
  });
  it("rejects too many / too few / empty", () => {
    expect(zonesError(Array.from({ length: 41 }, (_, i) => ({ from: i, to: i + 1 })))).toMatch(/at max 40/);
    expect(zonesError(tenZones().slice(0, 2))).toMatch(/at least 3/);
    expect(zonesError(null)).toBe("No zones provided");
  });
  it("rejects descending zones and out-of-range values", () => {
    expect(zonesError(setZoneBound(tenZones(), 2, "to", 15))).toMatch(/lower/);
    const pace = zoneDefinition("pace");
    expect(zonesError(setZoneBound(tenZones(), 9, "to", 4000), pace)).toMatch(/between/);
  });
});

describe("serialization (UserZonesModel)", () => {
  it("round-trips boundaries", () => {
    const b = [95, 114, 133, 152, 171, 190, 209];
    const zones = deserializeZones(b);
    expect(zones[0]).toEqual({ from: 95, to: 114 });
    expect(zones.length).toBe(6);
    expect(serializeZones(zones)).toEqual(b);
  });
});

describe("import", () => {
  it("imports {from,to} lists and boundaries", () => {
    expect(parseZonesImport('[{"from":0,"to":10},{"from":10,"to":20},{"from":20,"to":30}]')).toHaveLength(3);
    expect(parseZonesImport("[0, 10, 20, 30]")).toHaveLength(3);
  });
  it("rejects bad JSON and non-compliant zones", () => {
    expect(parseZonesImport("[{")).toBe("Provided zones do not respect expected format");
    expect(parseZonesImport('[{"from":0,"to":10},{"from":11,"to":20},{"from":20,"to":30}]')).toMatch(/not respected/);
  });
});
