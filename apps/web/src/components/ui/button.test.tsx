import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it.each(["primary", "secondary", "quiet", "destructive"] as const)(
    "exposes the %s action role",
    (variant) => {
      const markup = renderToStaticMarkup(
        <Button variant={variant}>{variant}</Button>,
      );

      expect(markup).toContain(`data-variant="${variant}"`);
      expect(markup).toContain(`>${variant}</button>`);
    },
  );

  it("exposes normal and compact control dimensions", () => {
    const normal = renderToStaticMarkup(<Button>Normal</Button>);
    const compact = renderToStaticMarkup(
      <Button size="compact">Compact</Button>,
    );

    expect(normal).toContain('data-size="default"');
    expect(compact).toContain('data-size="compact"');
  });
});
