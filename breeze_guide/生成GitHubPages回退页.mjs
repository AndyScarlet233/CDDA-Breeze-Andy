import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const guideDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(guideDir, "dist");
const indexPath = path.join(distDir, "index.html");
const fallbackPath = path.join(distDir, "404.html");

if (!fs.existsSync(indexPath)) {
  throw new Error("dist/index.html 不存在，请先运行 Vite 构建");
}
fs.copyFileSync(indexPath, fallbackPath);
console.log("已生成 GitHub Pages 单页路由回退文件：dist/404.html");
