import { describe, it, expect } from "vitest";
import {
  buildAskPrompt,
  buildCheckPrompt,
  buildComparePrompt,
  buildAiDiffCodeExecutionPrompt,
} from "../../src/core/prompt.js";

describe("buildCheckPrompt", () => {
  it("includes single statement", () => {
    const prompt = buildCheckPrompt("The login button is visible");
    expect(prompt).toContain("The login button is visible");
    expect(prompt).toContain("JSON");
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"statements"');
  });

  it("includes multiple statements numbered", () => {
    const prompt = buildCheckPrompt(["Button visible", "Header exists"]);
    expect(prompt).toContain('1. "Button visible"');
    expect(prompt).toContain('2. "Header exists"');
  });

  it("includes issue schema instructions", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain('"priority"');
    expect(prompt).toContain('"category"');
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"suggestion"');
  });

  it("includes example for consistent output", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain("Example");
  });

  it("includes confidence field in output schema", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain("high");
    expect(prompt).toContain("medium");
    expect(prompt).toContain("low");
  });

  it("uses default role when none provided", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).toContain("visual QA assistant");
  });

  it("uses custom role when provided", () => {
    const prompt = buildCheckPrompt("test", {
      role: "You are a layout expert.",
    });
    expect(prompt).toContain("layout expert");
    expect(prompt).not.toContain("visual QA assistant");
  });

  it("includes instructions when provided", () => {
    const prompt = buildCheckPrompt("test", {
      instructions: ["Treat dark mode as valid.", "Ignore minor spacing."],
    });
    expect(prompt).toContain("Additional instructions:");
    expect(prompt).toContain("- Treat dark mode as valid.");
    expect(prompt).toContain("- Ignore minor spacing.");
  });

  it("omits instructions section when none provided", () => {
    const prompt = buildCheckPrompt("test");
    expect(prompt).not.toContain("Additional instructions:");
  });

  it("omits instructions section when empty array provided", () => {
    const prompt = buildCheckPrompt("test", { instructions: [] });
    expect(prompt).not.toContain("Additional instructions:");
  });
});

describe("buildAskPrompt", () => {
  it("includes user prompt", () => {
    const prompt = buildAskPrompt("Analyze this page");
    expect(prompt).toContain("Analyze this page");
  });

  it("requests JSON with summary and issues", () => {
    const prompt = buildAskPrompt("test");
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"issues"');
    expect(prompt).toContain("JSON");
  });

  it("includes priority guidance", () => {
    const prompt = buildAskPrompt("test");
    expect(prompt).toContain("critical");
    expect(prompt).toContain("major");
    expect(prompt).toContain("minor");
  });
});

describe("buildComparePrompt", () => {
  it("includes user prompt when provided", () => {
    const prompt = buildComparePrompt({ userPrompt: "Describe differences" });
    expect(prompt).toContain("Describe differences");
  });

  it("uses default evaluation when no prompt provided", () => {
    const prompt = buildComparePrompt();
    expect(prompt).toContain("Identify all visual differences");
  });

  it("mentions before and after", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).toContain("BEFORE");
    expect(prompt).toContain("AFTER");
  });

  it("requests CompareResult format with changes array", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).toContain('"pass"');
    expect(prompt).toContain('"changes"');
    expect(prompt).toContain('"description"');
    expect(prompt).toContain('"severity"');
  });

  it("does not request issues or statements arrays", () => {
    const prompt = buildComparePrompt({ userPrompt: "test" });
    expect(prompt).not.toContain('"issues"');
    expect(prompt).not.toContain('"statements"');
  });

  it("includes regression testing instructions", () => {
    const prompt = buildComparePrompt();
    expect(prompt).toContain("baseline");
    expect(prompt).toContain("Additional instructions:");
  });

  it("appends user-provided instructions to defaults", () => {
    const prompt = buildComparePrompt({
      instructions: ["Ignore favicon differences"],
    });
    expect(prompt).toContain("Ignore favicon differences");
    expect(prompt).toContain("baseline");
  });
});

describe("buildCheckPrompt with video media context", () => {
  const videoContext = {
    kind: "video" as const,
    frameTimestamps: [0.5, 1.5, 2.5],
    durationSeconds: 3.0,
  };

  it("uses the video role when media is a video", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: videoContext });
    expect(prompt).toContain("sequence of video frames");
    expect(prompt).toContain("chronological timeline");
  });

  it("includes the timeline section listing every frame timestamp", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: videoContext });
    expect(prompt).toContain("Video timeline");
    expect(prompt).toContain("Total duration: 3.00s");
    expect(prompt).toContain("3 frames sampled");
    expect(prompt).toContain("0: 0.50s");
    expect(prompt).toContain("1: 1.50s");
    expect(prompt).toContain("2: 2.50s");
  });

  it("documents the timestampSeconds output field", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: videoContext });
    expect(prompt).toContain('"timestampSeconds"');
    expect(prompt).toContain("seconds from the start");
  });

  it("says nothing about dropped frames when none were dropped", () => {
    const withZero = buildCheckPrompt("A toast appears", {
      media: { ...videoContext, droppedUnchanged: 0 },
    });
    const withoutField = buildCheckPrompt("A toast appears", { media: videoContext });
    expect(withZero).toBe(withoutField);
    expect(withZero).not.toContain("dropped");
    expect(withZero).not.toContain("until the clip ended");
  });

  it("explains dropped unchanged frames and the static tail", () => {
    const prompt = buildCheckPrompt("A toast appears", {
      media: { ...videoContext, droppedUnchanged: 2 },
    });
    expect(prompt).toContain(
      "5 frames sampled (in chronological order); 2 were dropped because they did not visibly change from the preceding kept frame, so 3 images are attached",
    );
    expect(prompt).toContain("Frame index → timestamp:\n  0: 0.50s\n  1: 1.50s\n  2: 2.50s");
    expect(prompt).toContain(
      "Frames sampled between two consecutive listed timestamps looked the same as the earlier listed frame, and frames sampled after the last listed timestamp looked the same as the last attached image until the clip ended at 3.00s.",
    );
  });

  it("falls back to the image role and schema when media kind is image", () => {
    const prompt = buildCheckPrompt("Something is visible", { media: { kind: "image" } });
    expect(prompt).not.toContain("Video timeline");
    expect(prompt).toContain("Evaluate the provided image");
  });
});

describe("buildCheckPrompt with native video media context", () => {
  const nativeContext = { kind: "native-video" as const, durationSeconds: 15 };

  it("uses the recording role and section instead of a frame timeline", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: nativeContext });
    expect(prompt).toContain("Evaluate the provided video recording");
    expect(prompt).toContain("Video recording:\n- Total duration: 15.00s");
    expect(prompt).toContain("The attached file is the complete video recording");
    expect(prompt).not.toContain("Video timeline");
    expect(prompt).not.toContain("frames sampled");
  });

  it("phrases the video schema in moments rather than frames", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: nativeContext });
    expect(prompt).toContain("true at ANY moment of the video");
    expect(prompt).toContain("the timestamp of the moment that most clearly demonstrates it");
    expect(prompt).toContain('"timestampSeconds"');
    expect(prompt).not.toContain("ANY frame of the timeline");
    expect(prompt).not.toContain("at the 3.5s frame");
  });

  it("keeps the frame wording for the sampled-frames context", () => {
    const prompt = buildCheckPrompt("A toast appears", {
      media: { kind: "video", frameTimestamps: [0.5], durationSeconds: 1 },
    });
    expect(prompt).toContain("true at ANY frame of the timeline");
    expect(prompt).toContain("at the 3.5s frame");
  });

  it("honours a custom role over the native default", () => {
    const prompt = buildCheckPrompt("A toast appears", { media: nativeContext, role: "Custom" });
    expect(prompt.startsWith("Custom")).toBe(true);
  });
});

describe("buildAskPrompt with video media context", () => {
  const videoContext = {
    kind: "video" as const,
    frameTimestamps: [0.5, 1.5],
    durationSeconds: 2.0,
  };

  it("uses the video role and adds a frameReferences output field", () => {
    const prompt = buildAskPrompt("What happened?", { media: videoContext });
    expect(prompt).toContain("sequence of video frames");
    expect(prompt).toContain('"frameReferences"');
    expect(prompt).toContain("Video timeline");
    expect(prompt).not.toContain("dropped");
  });

  it("explains dropped unchanged frames", () => {
    const prompt = buildAskPrompt("What happened?", {
      media: { ...videoContext, droppedUnchanged: 1 },
    });
    expect(prompt).toContain(
      "3 frames sampled (in chronological order); 1 was dropped because it did not visibly change from the preceding kept frame, so 2 images are attached",
    );
    expect(prompt).toContain("until the clip ended at 2.00s");
  });

  it("falls back to the image schema when no video context is supplied", () => {
    const prompt = buildAskPrompt("What's broken?");
    expect(prompt).not.toContain("Video timeline");
    expect(prompt).not.toContain("frameReferences");
  });

  it("asks for timestampReferences instead of frameReferences for native video", () => {
    const prompt = buildAskPrompt("What happened?", {
      media: { kind: "native-video", durationSeconds: 4 },
    });
    expect(prompt).toContain("Analyze the provided video recording");
    expect(prompt).toContain("Video recording:\n- Total duration: 4.00s");
    expect(prompt).toContain('"timestampReferences"');
    expect(prompt).not.toContain("frameReferences");
    expect(prompt).not.toContain("Video timeline");
  });
});

describe("buildAiDiffCodeExecutionPrompt", () => {
  it("instructs model to write Python code with matplotlib", () => {
    const prompt = buildAiDiffCodeExecutionPrompt();
    expect(prompt).toContain("Python");
    expect(prompt).toContain("matplotlib");
  });

  it("includes annotation requirements", () => {
    const prompt = buildAiDiffCodeExecutionPrompt();
    expect(prompt).toContain("red");
    expect(prompt).toContain("differences");
  });
});
