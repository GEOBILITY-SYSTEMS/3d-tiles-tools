import fs from "fs";
import path from "path";
import { Paths } from "./src/base";
import { Tileset } from "./src/structure/structure/Tileset";
import { Tile } from "./src/structure";

function recomputeGeometricError(tileset: Tileset, scaleFactor: number) {
  const processTile = (tile: Tile) => {
    // Compute the geometric error based on the bounding volume box taking the diagonal length in the horizontal x-y plane (z is up)
    if (tile.boundingVolume.box) {
      const box = tile.boundingVolume.box;
      const xAxisHalf = [box[3], box[4]]; // X-axis half-length vector in x-y plane
      const yAxisHalf = [box[6], box[7]]; // Y-axis half-length vector in x-y plane
      const cornerVector = [
        xAxisHalf[0] + yAxisHalf[0],
        xAxisHalf[1] + yAxisHalf[1],
      ];
      const halfDiagonal = Math.hypot(cornerVector[0], cornerVector[1]);
      tile.geometricError = 2 * halfDiagonal * scaleFactor;
      return tile.geometricError;
    }
    return 0;
  };

  const processChildren = (tile: Tile) => {
    if (tile.children) {
      for (const child of tile.children) {
        processTile(child);
        if (child.children) {
          processChildren(child);
        }
      }
    }
  };

  const root = tileset.root;
  if (root) {
    root.geometricError = processTile(root);
    processChildren(root);
  }
}

// Upgrades a single tileset JSON file to the latest version
async function processTilesetJson(fileName: string, scaleFactor: number) {
  const inputBuffer = fs.readFileSync(fileName);
  const tileset = JSON.parse(inputBuffer.toString()) as Tileset;

  console.log(`Processing JSON file: ${fileName}`);

  recomputeGeometricError(tileset, scaleFactor);

  const resultJsonString = JSON.stringify(tileset, null, 2);
  const outputBuffer = Buffer.from(resultJsonString);
  Paths.ensureDirectoryExists(path.dirname(fileName));
  fs.writeFileSync(fileName, outputBuffer);
}

// Recursively upgrades all JSON files in a directory
async function processTilesetJsonInDirectory(directory: string, scaleFactor: number) {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Recursively process subdirectories
      await processTilesetJsonInDirectory(fullPath, scaleFactor);
    } else if (stat.isFile() && path.extname(file).toLowerCase() === ".json") {
      // Process JSON files
      await processTilesetJson(fullPath, scaleFactor);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0] || "./input";
  const scaleFactor = parseFloat(args[1]) || 1.0;
  await processTilesetJsonInDirectory(inputPath, scaleFactor);
}

main().catch((error) => {
  console.error("An error occurred during conversion:", error);
});
