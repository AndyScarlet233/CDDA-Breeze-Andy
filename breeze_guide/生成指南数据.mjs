import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const guideDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(guideDir, "..");
const gameJsonDir = path.join(repoRoot, "data", "json");
const bundledModsDir = path.join(repoRoot, "data", "mods");
const uploadDir = path.join(guideDir, "模组上传");
const extractDir = path.join(guideDir, ".模组展开缓存");
const outputDir = path.join(guideDir, "public", "data");
const configPath = path.join(guideDir, "模组发布清单.json");
const versionPath = path.join(repoRoot, "src", "version.h");

const repository = process.env.GITHUB_REPOSITORY || "AndyScarlet233/CDDA-Breeze-Andy";
const sourceRef = process.env.GITHUB_SHA || process.env.GITHUB_REF_NAME || "test/next-release";
const generatedAt = new Date().toISOString();
const zhTranslations = readPoTranslations(
  path.join(repoRoot, "lang", "po", "zh_CN.po"),
);
const guideIgnoredOnlyTypes = new Set([
  "EXTERNAL_OPTION",
  "MONSTER_WHITELIST",
  "MONSTER_FACTION",
  "region_settings",
  "region_overlay",
  "mod_tileset",
  "skill_boost",
  "effect_on_condition",
  "event_statistic",
  "score",
]);

const config = readJson(configPath);
if (config["格式版本"] !== 1) {
  throw new Error(`不支持的模组发布清单格式版本：${config["格式版本"]}`);
}

const versionText = fs.readFileSync(versionPath, "utf8");
const version = versionText.match(/#define\s+VERSION\s+"([^"]+)"/)?.[1] ?? "CDDA-Breeze-unknown";

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });

console.log(`正在生成微风指南数据：${version}`);

const coreRecords = collectJsonDirectory(gameJsonDir, {
  sourceType: "本体",
  sourceId: "dda",
  sourceName: "CDDA-Breeze 本体",
  sourceRoot: repoRoot,
});

writeDataPack(path.join(outputDir, "本体", "all.json"), {
  build_number: version,
  release: {
    version,
    generated_at: generatedAt,
    repository,
    ref: sourceRef,
  },
  data: coreRecords,
});
console.log(`本体：${coreRecords.length} 个 JSON 对象`);

const indexEntries = [];
const entryById = new Map();
const defaultIds = new Set(config["默认启用模组"] ?? []);
const requiredIds = new Set(config["必需启用模组"] ?? []);
const excludedBundled = new Set(config["排除内置模组"] ?? []);

if (config["收录内置模组"] === "全部" || Array.isArray(config["收录内置模组"])) {
  const allowList = Array.isArray(config["收录内置模组"])
    ? new Set(config["收录内置模组"])
    : null;

  for (const child of sortedDirectories(bundledModsDir)) {
    const modInfos = readModInfos(child);
    for (const info of modInfos) {
      if (allowList && !allowList.has(info.id)) continue;
      if (excludedBundled.has(info.id)) continue;
      publishMod({
        root: info.root,
        info: info.value,
        sourceType: "内置模组",
        sourcePath: path.relative(repoRoot, info.root).replaceAll("\\", "/"),
        override: {},
        replaceExisting: false,
      });
    }
  }
}

for (const upload of config["上传模组"] ?? []) {
  if (!upload || upload["发布"] !== true) continue;
  const filename = String(upload["文件"] ?? "").trim();
  if (!filename) throw new Error("上传模组条目缺少“文件”字段");

  const archivePath = safeChildPath(uploadDir, filename);
  if (!fs.existsSync(archivePath)) {
    throw new Error(`已批准的模组文件不存在：${path.relative(guideDir, archivePath)}`);
  }

  let preparedRoot = archivePath;
  if (fs.statSync(archivePath).isFile()) {
    if (path.extname(archivePath).toLowerCase() !== ".zip") {
      throw new Error(`目前只支持 ZIP 模组压缩包：${filename}`);
    }
    preparedRoot = path.join(
      extractDir,
      `${safeSegment(path.basename(filename, path.extname(filename)))}-${shortHash(filename)}`,
    );
    extractZipSafely(archivePath, preparedRoot);
  }

  const infos = readModInfos(preparedRoot);
  if (infos.length === 0) {
    throw new Error(`模组中没有找到有效的 modinfo.json：${filename}`);
  }

  const requestedId = upload["模组标识"];
  const selectedInfos = requestedId
    ? infos.filter((candidate) => candidate.value.id === requestedId)
    : infos;
  if (selectedInfos.length === 0) {
    throw new Error(`压缩包 ${filename} 中没有 MOD_INFO id：${requestedId}`);
  }

  for (const info of selectedInfos) {
    publishMod({
      root: info.root,
      info: info.value,
      sourceType: "开发者上传模组",
      sourcePath: `breeze_guide/模组上传/${filename}`,
      override: upload,
      replaceExisting: upload["替换同名内置模组"] === true,
    });
  }
}

const orderedEntries = [...indexEntries].sort((a, b) =>
  a["名称"].localeCompare(b["名称"], "zh-CN"),
);

const modIndex = {
  "格式版本": 1,
  "游戏版本": version,
  "生成时间": generatedAt,
  "仓库": repository,
  "源码引用": sourceRef,
  "默认启用": orderedEntries.filter((x) => x["默认启用"]).map((x) => x["标识"]),
  "必需启用": orderedEntries.filter((x) => x["必需启用"]).map((x) => x["标识"]),
  "模组": orderedEntries,
};
writeJson(path.join(outputDir, "模组索引.json"), modIndex);
writeJson(path.join(outputDir, "构建信息.json"), {
  "游戏版本": version,
  "生成时间": generatedAt,
  "本体对象数": coreRecords.length,
  "已发布模组数": orderedEntries.length,
  "模组对象总数": orderedEntries.reduce((sum, x) => sum + x["对象数量"], 0),
});

fs.rmSync(extractDir, { recursive: true, force: true });
console.log(`已发布 ${orderedEntries.length} 个只读模组数据包`);
console.log(`输出目录：${path.relative(repoRoot, outputDir)}`);

function publishMod({ root, info, sourceType, sourcePath, override, replaceExisting }) {
  const id = String(info.id ?? "").trim();
  if (!id) throw new Error(`MOD_INFO 缺少 id：${root}`);
  if (id === "dda") return;

  if (entryById.has(id)) {
    if (!replaceExisting) {
      console.warn(`跳过重复模组 id：${id}（已有来源优先）`);
      return;
    }
    const previous = entryById.get(id);
    indexEntries.splice(indexEntries.indexOf(previous), 1);
  }

  const sourceDisplayName = cleanDisplayName(
    textValue(override["名称"] ?? info.name ?? id),
  );
  const displayName = override["名称"]
    ? sourceDisplayName
    : cleanDisplayName(zhTranslations.get(sourceDisplayName) || sourceDisplayName);
  const sourceDescription = textValue(override["说明"] ?? info.description ?? "");
  const description = override["说明"]
    ? sourceDescription
    : zhTranslations.get(sourceDescription) || sourceDescription;
  const slug = safeSegment(id) || `mod-${shortHash(id)}`;
  const sourceName = displayName || id;
  const records = collectJsonDirectory(root, {
    sourceType,
    sourceId: id,
    sourceName,
    sourceRoot: root,
    sourceArchivePath:
      sourceType === "开发者上传模组" ? sourcePath : undefined,
  }).filter((record) => record.type !== "MOD_INFO");

  const guideVisibleRecords = records.filter(
    (record) => !guideIgnoredOnlyTypes.has(record.type),
  );
  if (guideVisibleRecords.length === 0) {
    console.log(`跳过无可检索内容的模组：${displayName}（${id}）`);
    return;
  }

  const dataPath = `模组/${slug}/all.json`;
  const payload = {
    build_number: version,
    release: {
      version,
      mod_id: id,
      mod_name: displayName,
      generated_at: generatedAt,
    },
    data: records,
  };
  const sha = writeDataPack(path.join(outputDir, dataPath), payload);

  const entry = {
    "标识": id,
    "名称": displayName,
    "说明": description,
    "作者": normalizeTextArray(info.authors),
    "维护者": normalizeTextArray(info.maintainers),
    "版本": textValue(info.version ?? ""),
    "分类": textValue(info.category ?? ""),
    "依赖": normalizeTextArray(info.dependencies).filter((x) => x !== "dda"),
    "数据路径": dataPath,
    "对象数量": records.length,
    "哈希": sha,
    "默认启用": override["默认启用"] ?? defaultIds.has(id),
    "必需启用": override["必需启用"] ?? requiredIds.has(id),
    "来源类型": sourceType,
    "来源路径": sourcePath,
  };
  indexEntries.push(entry);
  entryById.set(id, entry);
  console.log(`模组：${displayName}（${id}），${records.length} 个对象`);
}

function collectJsonDirectory(directory, source) {
  const files = findFiles(directory, (filename) => filename.toLowerCase().endsWith(".json"));
  const output = [];
  for (const filename of files) {
    const parsed = readJson(filename);
    const values = Array.isArray(parsed) ? parsed : [parsed];
    const relativeToSource = path.relative(source.sourceRoot, filename).replaceAll("\\", "/");
    const relativeToRepo = path.relative(repoRoot, filename).replaceAll("\\", "/");
    const sourceUrl = source.sourceArchivePath
      ? githubBlobUrl(source.sourceArchivePath)
      : githubBlobUrl(relativeToRepo);

    for (const value of values) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      value.__filename = relativeToSource;
      value.__source_type = source.sourceType;
      value.__source_id = source.sourceId;
      value.__source_name = source.sourceName;
      value.__source_url = sourceUrl;
      output.push(value);
    }
  }
  return output;
}

function readModInfos(root) {
  const candidates = findFiles(root, (filename) => path.basename(filename).toLowerCase() === "modinfo.json");
  const infos = [];
  for (const filename of candidates) {
    const parsed = readJson(filename);
    for (const value of Array.isArray(parsed) ? parsed : [parsed]) {
      if (value?.type === "MOD_INFO" && value.id) {
        infos.push({ root: path.dirname(filename), value });
      }
    }
  }
  return infos;
}

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => b.name.localeCompare(a.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && predicate(full)) output.push(full);
    }
  }
  return output.sort((a, b) => a.localeCompare(b));
}

function sortedDirectories(root) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function extractZipSafely(archive, destination) {
  const entries = inspectZipCentralDirectory(archive);
  const maxEntries = 100_000;
  const maxSingleSize = 256 * 1024 * 1024;
  const maxTotalSize = 1024 * 1024 * 1024;
  if (entries.length > maxEntries) {
    throw new Error(`ZIP 文件数量异常：${entries.length}，上限为 ${maxEntries}`);
  }

  let totalSize = 0;
  for (const entry of entries) {
    validateArchivePath(entry.name);
    if (entry.isSymlink) {
      throw new Error(`ZIP 中包含符号链接：${entry.name}`);
    }
    if (entry.uncompressedSize > maxSingleSize) {
      throw new Error(`ZIP 单个文件展开后过大：${entry.name}`);
    }
    totalSize += entry.uncompressedSize;
    if (totalSize > maxTotalSize) {
      throw new Error("ZIP 展开后的总大小超过 1 GiB，已拒绝处理");
    }
  }

  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });

  if (process.platform === "win32") {
    const escapePs = (value) => value.replaceAll("'", "''");
    const script = [
      `$archive='${escapePs(archive)}'`,
      `$destination='${escapePs(destination)}'`,
      "Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force",
    ].join("; ");
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      stdio: "inherit",
    });
  } else {
    execFileSync("unzip", ["-qq", "-o", archive, "-d", destination], { stdio: "inherit" });
  }

  for (const filename of findAllPaths(destination)) {
    if (fs.lstatSync(filename).isSymbolicLink()) {
      fs.rmSync(destination, { recursive: true, force: true });
      throw new Error(`ZIP 展开后发现符号链接：${path.relative(destination, filename)}`);
    }
  }
}

function inspectZipCentralDirectory(archive) {
  const buffer = fs.readFileSync(archive);
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const minEocdOffset = Math.max(0, buffer.length - 65_557);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minEocdOffset; offset--) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error(`无法读取 ZIP 中央目录：${path.basename(archive)}`);

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralOffset === 0xffffffff) {
    throw new Error("暂不支持 ZIP64 模组压缩包");
  }

  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralSignature) {
      throw new Error(`ZIP 中央目录损坏，条目序号：${index}`);
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error("ZIP 文件名字段越界");
    const encoding = flags & 0x0800 ? "utf8" : "latin1";
    const name = buffer.subarray(nameStart, nameEnd).toString(encoding);
    const unixMode = externalAttributes >>> 16;
    entries.push({
      name,
      uncompressedSize,
      isSymlink: (unixMode & 0o170000) === 0o120000,
    });
    offset = nameEnd + extraLength + commentLength;
  }
  return entries;
}

function validateArchivePath(rawName) {
  const name = rawName.replaceAll("\\", "/");
  if (
    !name ||
    name.includes("\0") ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes(":") ||
    name.split("/").includes("..")
  ) {
    throw new Error(`ZIP 中包含不安全路径：${rawName}`);
  }
}

function findAllPaths(root) {
  const output = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      output.push(full);
      if (entry.isDirectory()) stack.push(full);
    }
  }
  return output;
}

function cleanDisplayName(value) {
  return String(value ?? "")
    .replace(/<color_[^>]+>/gi, "")
    .replace(/<\/color>/gi, "")
    .trim();
}

function readPoTranslations(filename) {
  const translations = new Map();
  if (!fs.existsSync(filename)) return translations;

  const lines = fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  let entry = {};
  let active = null;

  const flush = () => {
    const msgid = entry.msgid;
    const msgstr = entry.msgstr || entry.msgstr0;
    if (msgid && msgstr && !translations.has(msgid)) {
      translations.set(msgid, msgstr);
    }
    entry = {};
    active = null;
  };

  const parseQuoted = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      return "";
    }
  };

  for (const line of lines) {
    if (line.startsWith("msgid ")) {
      entry.msgid = parseQuoted(line.slice(6).trim());
      active = "msgid";
    } else if (line.startsWith("msgstr ")) {
      entry.msgstr = parseQuoted(line.slice(7).trim());
      active = "msgstr";
    } else if (line.startsWith("msgstr[0] ")) {
      entry.msgstr0 = parseQuoted(line.slice(10).trim());
      active = "msgstr0";
    } else if (line.startsWith('"') && active) {
      entry[active] = (entry[active] || "") + parseQuoted(line.trim());
    } else if (line.trim() === "") {
      flush();
    }
  }
  flush();
  return translations;
}

function writeDataPack(filename, value) {
  const json = JSON.stringify(value);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, json);
  const sha = crypto.createHash("sha256").update(json).digest("hex");
  fs.writeFileSync(
    filename.replace(/\.json$/i, ".meta.json"),
    JSON.stringify({ buildNum: version, sha }),
  );
  return sha;
}

function writeJson(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + "\n");
}

function readJson(filename) {
  const text = fs.readFileSync(filename, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON 解析失败：${path.relative(repoRoot, filename)}\n${error.message}`);
  }
}

function safeChildPath(parent, child) {
  const resolved = path.resolve(parent, child);
  const relative = path.relative(parent, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`路径越过模组上传目录：${child}`);
  }
  return resolved;
}

function safeSegment(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10);
}

function githubBlobUrl(repoPath) {
  return `https://github.com/${repository}/blob/${sourceRef}/${repoPath.split("/").map(encodeURIComponent).join("/")}`;
}

function textValue(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    if (typeof value.str === "string") return value.str;
    if (typeof value.str_sp === "string") return value.str_sp;
  }
  return value == null ? "" : String(value);
}

function normalizeTextArray(value) {
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean);
  const single = textValue(value);
  return single ? [single] : [];
}
