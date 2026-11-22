import { applyKnockdTheme } from "../theme/applyKnockdTheme";
import { fixtureStyle } from "../testing/fixtures";

const themed = applyKnockdTheme(fixtureStyle);
const layer = (id: string) => themed.layers.find((l) => l.id === id)!;

describe("applyKnockdTheme", () => {
  it("does not mutate the input style", () => {
    expect(fixtureStyle.layers[0]!.paint).toEqual({ "background-color": "#cccccc" });
    expect(themed).not.toBe(fixtureStyle);
  });
  it("makes land near-white", () => {
    expect(layer("background").paint!["background-color"]).toBe("#F6F7F9");
    expect(layer("earth").paint!["fill-color"]).toBe("#F6F7F9");
  });
  it("tints parks, keeps other landuse as land", () => {
    expect(layer("landuse_park").paint!["fill-color"]).toBe("#DDEFE2");
    expect(layer("landuse_hospital").paint!["fill-color"]).toBe("#F6F7F9");
  });
  it("draws white roads with #DFE3E8 edges and #ECEEF2 hairlines", () => {
    expect(layer("roads_minor").paint!["line-color"]).toBe("#FFFFFF");
    expect(layer("roads_minor_casing").paint!["line-color"]).toBe("#DFE3E8");
    expect(layer("roads_rail").paint!["line-color"]).toBe("#ECEEF2");
    expect(layer("boundaries").paint!["line-color"]).toBe("#ECEEF2");
  });
  it("keeps unrelated paint properties", () => {
    expect(layer("roads_minor").paint!["line-width"]).toBe(2);
  });
  it("hides POI clutter", () => {
    expect(layer("pois").layout!.visibility).toBe("none");
  });
  it("colours labels #9AA3AD and letter-spaces uppercase district labels", () => {
    expect(layer("roads_labels_major").paint!["text-color"]).toBe("#9AA3AD");
    expect(layer("roads_labels_major").layout!["text-transform"]).toBeUndefined();
    const place = layer("places_subplace");
    expect(place.layout!["text-transform"]).toBe("uppercase");
    expect(place.layout!["text-letter-spacing"]).toBeGreaterThan(0);
    expect(place.layout!["text-field"]).toBe("{name}");
  });
  it("mutes buildings and water", () => {
    expect(layer("buildings").paint!["fill-color"]).toBe("#EEF0F3");
    expect(layer("water").paint!["fill-color"]).toBe("#E3ECF5");
  });
});
