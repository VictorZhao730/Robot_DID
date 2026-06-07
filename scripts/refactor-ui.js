/**
 * One-time refactor: split ui/js monoliths into organized modules.
 * Run: node scripts/refactor-ui.js
 */
const fs = require("fs");
const path = require("path");

const UI = path.join(__dirname, "..", "ui", "js");

function read(name) {
  return fs.readFileSync(path.join(UI, name), "utf8");
}

function write(relPath, content) {
  const full = path.join(UI, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content.trimStart() + "\n");
}

function sliceLines(source, ranges) {
  const lines = source.split("\n");
  const chunks = ranges.map(([start, end]) => lines.slice(start - 1, end).join("\n"));
  return chunks.join("\n\n");
}

function moveCore() {
  for (const file of ["abi.js", "config.js", "did.js"]) {
    write(`core/${file}`, read(file));
  }
}

function splitContracts() {
  const src = read("contracts.js");
  write(
    "registry/connections.js",
    sliceLines(src, [
      [23, 54],
      [358, 437],
      [802, 818],
      [1125, 1141],
    ])
  );
  write(
    "registry/nft-admin.js",
    sliceLines(src, [[106, 170], [783, 793], [795, 800]])
  );
  write(
    "registry/issuer-admin.js",
    sliceLines(src, [[172, 298]])
  );
  write(
    "registry/controllers.js",
    sliceLines(src, [[1, 21], [56, 104], [300, 356]])
  );
  write(
    "registry/did-queries.js",
    sliceLines(src, [[439, 696]])
  );
  write(
    "registry/robot-lifecycle.js",
    sliceLines(src, [
      [697, 761],
      [1019, 1060],
      [1062, 1123],
    ])
  );
  write(
    "registry/mint-register.js",
    sliceLines(src, [
      [763, 781],
      [820, 1017],
      [1143, 1156],
    ])
  );
}

function splitCredentials() {
  const src = read("credentials.js");
  write("credentials/build.js", sliceLines(src, [[1, 314]]));
  write("credentials/issue.js", sliceLines(src, [[316, 748]]));
  write("credentials/verify.js", sliceLines(src, [[750, 1066]]));
}

function splitRender() {
  const src = read("render.js");
  write("ui/display.js", sliceLines(src, [[1, 7]]));
  write("ui/mint-register-ui.js", sliceLines(src, [[9, 105]]));
  write(
    "ui/panel-helpers.js",
    sliceLines(src, [[107, 185], [187, 195]])
  );
  write("ui/format-helpers.js", sliceLines(src, [[197, 244]]));
  write("ui/matrices.js", sliceLines(src, [[246, 349]]));
  write("ui/robots-browser.js", sliceLines(src, [[351, 554]]));
  write("ui/panelRender.js", read("panelRender.js"));
}

function removeObsolete() {
  const obsolete = [
    "contracts.js",
    "credentials.js",
    "render.js",
    "panelRender.js",
    "abi.js",
    "config.js",
    "did.js",
    "onChainAnchor.js",
    "anchorTiming.js",
    "_patch_1082.js",
    "_patch_1201.js",
    "_patch_984.js",
    "_patch_979.js",
    "_patch_964.js",
    "_patch_939.js",
    "_mint_head.js",
    "_big_old.txt",
  ];
  for (const file of obsolete) {
    const full = path.join(UI, file);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  }
}

moveCore();
splitContracts();
splitCredentials();
splitRender();
removeObsolete();
console.log("UI refactor complete.");
