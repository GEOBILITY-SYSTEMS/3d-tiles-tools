//
// NOTE: None of the functionality that is shown here is part of the
// public API of the 3D Tiles tools. The functions that are shown here
// use an INTERNAL API that may change at any point in time.
//
import fs from "fs";
import path from "path";
import { TileContentProcessing } from "./src/tools/tilesetProcessing/TileContentProcessing";
import { GltfUtilities, TilesetOperations } from "./src/tools";
import { GltfTransform } from "./src/tools";
import { TileFormats } from "./src/tilesets";
import { ContentDataTypes, Paths } from "./src/base";

import { KHRMaterialsUnlit } from "@gltf-transform/extensions";
import { Tileset } from "./src/structure/structure/Tileset";

// Read a glTF-Transform document from the given input GLB buffer,
// add the 'KHR_materials_unlit' extension to all materials, and return
// a new buffer that was created from the modified document
async function modifyMaterialsInGlb(inputGlb: Buffer) {
  const io = await GltfTransform.getIO();
  io.registerExtensions([KHRMaterialsUnlit]);
  const document = await io.readBinary(inputGlb);

  // Add the KHR_materials_unlit extension to the document
  const extension = document
    .createExtension(KHRMaterialsUnlit)
    .setRequired(true);

  const root = document.getRoot();
  const materials = root.listMaterials();
  const unlitExtension = extension.createUnlit();
  for (const material of materials) {
    material.setExtension("KHR_materials_unlit", unlitExtension);
  }

  const outputGlb = await io.writeBinary(document);
  return outputGlb;
}

// Read the tile data from the given input B3DM buffer,
// extract the payload (GLB data), modify it by calling
// `modifyMaterialsInGlb`, and create a new B3DM buffer
// with the modified GLB data
async function modifyMaterialsInB3dm(inputB3dm: Buffer) {
  const inputTileData = TileFormats.readTileData(inputB3dm);
  const inputGlb = inputTileData.payload;
  const glb = await GltfUtilities.replaceCesiumRtcExtension(inputGlb);
  const outputGlb = await modifyMaterialsInGlb(glb);
  const outputTileData = TileFormats.createB3dmTileDataFromGlb(
    Buffer.from(outputGlb),
    inputTileData.featureTable.json,
    inputTileData.featureTable.binary,
    inputTileData.batchTable.json,
    inputTileData.batchTable.binary
  );
  const outputB3dm = TileFormats.createTileDataBuffer(outputTileData);
  return outputB3dm;
}

async function runConversion() {
  const tilesetSourceName = "./input/tileset.json";
  const tilesetTargetName = "./output/tileset.json";
  const overwrite = true;

  // Create a `TileContentProcessor` that calls modifyMaterialsInB3dm
  // for all B3DM files
  const tileContentProcessor = async (
    content: Buffer,
    type: string | undefined
  ) => {
    if (type !== ContentDataTypes.CONTENT_TYPE_B3DM) {
      return content;
    }
    // pragmatic try-catch block for the actual modification.
    console.log("Modifying materials...");
    try {
      const modifiedB3dm = await modifyMaterialsInB3dm(content);
      console.log("Modifying materials... DONE");
      return modifiedB3dm;
    } catch (e) {
      console.log(`ERROR: ${e}`);
      return content;
    }
  };

  // Process the tileset source, and write it to the tileset target,
  // applying the `TileContentProcessor` to all tile contents
  await TileContentProcessing.process(
    tilesetSourceName,
    tilesetTargetName,
    overwrite,
    tileContentProcessor
  );
}

// Upgrades a single tileset JSON file to the latest version
async function upgradeTilesetJson(fileName: string) {
    const inputBuffer = fs.readFileSync(fileName);
    const tileset = JSON.parse(inputBuffer.toString()) as Tileset;
  
    console.log(`Upgrading JSON file: ${fileName}`);
  
    const targetVersion = "1.0";
    await TilesetOperations.upgradeTileset(tileset, targetVersion);
  
    const resultJsonString = JSON.stringify(tileset, null, 2);
    const outputBuffer = Buffer.from(resultJsonString);
    Paths.ensureDirectoryExists(path.dirname(fileName));
    fs.writeFileSync(fileName, outputBuffer);
  }

// Recursively upgrades all JSON files in a directory
async function upgradeTilesetJsonInDirectory(directory: string) {
    const files = fs.readdirSync(directory);
  
    for (const file of files) {
      const fullPath = path.join(directory, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        // Recursively process subdirectories
        await upgradeTilesetJsonInDirectory(fullPath);
      } else if (stat.isFile() && path.extname(file).toLowerCase() === ".json") {
        // Process JSON files
        await upgradeTilesetJson(fullPath);
      }
    }
  }

  async function main() {
    // Step 1: Upgrade all JSON files in the input directory
    await upgradeTilesetJsonInDirectory("./input");
  
    // Step 2: Run the material modification conversion
    await runConversion();
  }
  
  main().catch((error) => {
    console.error("An error occurred during conversion:", error);
  });
