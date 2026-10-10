import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const workspaceDir = "/home/satyamchauhan/2ndyr/hackathon_TRG";
const skillDir = "/home/satyamchauhan/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations";
const runtimeNodeModules = "/home/satyamchauhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
process.env.RUNTIME_NODE_MODULES = runtimeNodeModules;
const inputPath = path.join(workspaceDir, "National Hackathon 6.0.pptx");
const finalPath = path.join(workspaceDir, "output", "hackathon-latest.pptx");
const stagingDir = path.join(workspaceDir, ".pptx-build", "updated-finalizer");
const { makeNativeBulletParagraphs, finalizePresentation } = await import(pathToFileURL(path.join(skillDir, "container_tools/artifact_tool_utils.mjs")).href);
const presentation = await PresentationFile.importPptx(await FileBlob.load(inputPath));

const coverTitle = presentation.resolve("sh/547294r6");
coverTitle.text = "Screenshot Graveyard Solver";
coverTitle.text.style = { typeface: "Corbel", fontSize: 58, bold: true, color: "#FFFFFF", autoFit: "shrinkText" };
const coverSubtitle = presentation.resolve("sh/k3yl0zql");
coverSubtitle.text = "Turning Digital Clutter into Actionable Productivity\nAn AI-Powered Cross-Platform Task Extraction Ecosystem\nTeam TRG · Table CB09 · COER University / College of Smart Computing";
coverSubtitle.text.style = { typeface: "Corbel", fontSize: 19, color: "#D9F1F6", autoFit: "none" };

const originalSlides = [
  {
    titleId: "sh/9072xkry",
    title: "The Problem",
    bodyId: "sh/ozy1ofad",
    size: 24,
    items: [
      "People screenshot important tasks, bills, meetings and ideas to remember them.",
      "Those screenshots get buried in phone galleries and build up into a screenshot graveyard.",
      "The result is forgotten deadlines, lost information and lower personal productivity."
    ]
  },
  {
    titleId: "sh/cza94vmx",
    title: "Our Solution",
    bodyId: "sh/d0jax03i",
    size: 24,
    items: [
      "A seamless ecosystem watches screenshot folders automatically.",
      "AI processes images and extracts actionable tasks as they arrive.",
      "Tasks are organized in a secure, accessible dashboard across mobile, web and desktop."
    ]
  },
  {
    titleId: "sh/1cj2d8b6",
    title: "Key Features",
    bodyId: "sh/0ba143al",
    size: 21,
    items: [
      "AI-powered OCR uses Gemini 2.0 Vision to identify tasks, priorities and deadlines.",
      "Cross-platform sync connects the PC desktop app, web dashboard and Android app.",
      "Passwordless email OTP authentication avoids hardcoded passwords.",
      "Visual task review lets users edit extracted details while viewing the actual source screenshot inside the app.",
      "UI edits sync instantly with the interactive dashboard calendar.",
      "Automatic folder monitoring processes useful screenshots and ignores irrelevant ones."
    ]
  },
  {
    titleId: "sh/dgbulwnm",
    title: "Technology Stack",
    bodyId: "sh/cf2tcr61",
    size: 20,
    items: [
      "Rust and Axum power robust API routing and secure JWT authentication.",
      "C++ with Crow and SQLite handles task storage, data migration and retrieval.",
      "Python and FastAPI connect the AI service to Google Gemini Vision for OCR.",
      "Clients include an Electron PC app with local file watchers and a vanilla HTML/CSS/JavaScript light-mode web app.",
      "Docker containers run on AWS EC2. Precompiled multi-stage images work around cloud hardware build constraints."
    ]
  },
  {
    titleId: "sh/yhg7epsj",
    title: "SDG Alignment",
    bodyId: "sh/zi98nu94",
    size: 21,
    items: [
      "SDG 8, Decent Work and Economic Growth: Automating task extraction can improve individual and team productivity, reduce manual entry and leave more time for higher-value work.",
      "SDG 12, Responsible Consumption and Production: Organizing and clearing unneeded screenshots can reduce stored digital clutter and its associated storage demand."
    ]
  }
];

function fillBody(shape, items, size) {
  shape.text = makeNativeBulletParagraphs(items, {
    marginLeftPoints: 24,
    hangingPoints: 12,
    spaceAfterPoints: 10,
  });
  shape.text.style = { typeface: "Corbel", fontSize: size, color: "#595959", autoFit: "shrinkText" };
}

for (const entry of originalSlides) {
  presentation.resolve(entry.titleId).text = entry.title;
  fillBody(presentation.resolve(entry.bodyId), entry.items, entry.size);
}

function addContentSlide(title, items, size = 23) {
  const slide = presentation.slides.add({ layout: "Title and Content" });
  slide.placeholders.addFromLayout();
  slide.placeholders.getItem("title").text = title;
  fillBody(slide.placeholders.getItem("content placeholder 2"), items, size);
}

addContentSlide("Market Potential", [
  "Integrate with Google Calendar, Notion and Slack.",
  "Automatically sort screenshots into personal, work and finance categories.",
  "Expand to B2B teams that share visual information across offices."
]);

addContentSlide("Thank You", [
  "Ready to empty your graveyard?",
  "Try the live AWS web dashboard or download the PC or Android app today."
], 26);

await fs.mkdir(path.dirname(finalPath), { recursive: true });
await fs.mkdir(stagingDir, { recursive: true });
const candidatePath = path.join(stagingDir, "candidate.pptx");
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: "/home/satyamchauhan/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3",
  integrityValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_package_integrity.py"),
  layoutValidatorPath: path.join(skillDir, "container_tools/inspect_presentation_layout_geometry.py"),
  layoutArgs: ["--expected-slide-size-emu", "12192000,6858000", "--validate-bullet-geometry", "--validate-heading-fit"],
  requiredNativeTableOwnerSlides: [],
  explicitTotalSlideCount: 8,
  fontPolicy: { basis: "reference", families: ["Corbel"], referencePath: inputPath, referenceSha256: "ff6e1cc3fa8eb19387ead569fec2225cba129675faa8aa35f55d5dae98ca380e" },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, "hackathon-latest.pptx.validation.json"),
});
console.log(JSON.stringify(result, null, 2));

const after = await presentation.inspect({ kind: "slide,textbox,shape", maxChars: 20000 });
await fs.writeFile(path.join(stagingDir, "inspection.ndjson"), after.ndjson);
for (let i = 0; i < presentation.slides.items.length; i++) {
  const image = await presentation.export({ slide: presentation.slides.items[i], format: "png", scale: 1 });
  await fs.writeFile(path.join(stagingDir, `slide-${i + 1}.png`), new Uint8Array(await image.arrayBuffer()));
}
