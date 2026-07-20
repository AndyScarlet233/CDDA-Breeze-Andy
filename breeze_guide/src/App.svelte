<script lang="ts">
import Thing from "./Thing.svelte";
import {
  CddaData,
  data,
  loadProgress,
  localeVersion,
  mapType,
  singularName,
  modCatalog,
  enabledModIds,
  dataLoadError,
} from "./data";
import SearchResults from "./SearchResults.svelte";
import Catalog from "./Catalog.svelte";
import dontPanic from "./assets/dont_panic.png";
import InterpolatedTranslation from "./InterpolatedTranslation.svelte";
import { guideTypeName, t } from "./界面翻译";
import type { SupportedTypeMapped, SupportedTypesWithMapped } from "./types";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import { onDestroy } from "svelte";

let item: { type: string; id: string } | null = null;
let search: string = "";
let renderedSearch = search;
const updateRenderedSearch = debounce((value: string) => {
  renderedSearch = value;
}, 150);

function renderSearchNow() {
  updateRenderedSearch.cancel();
  renderedSearch = search;
}

$: if (search !== renderedSearch) {
  if (search) updateRenderedSearch(search);
  else renderSearchNow();
}

onDestroy(updateRenderedSearch.cancel);

const modSelectionStorageKey = "breeze-guide-enabled-mods-v2";

function readSavedModIds(): string[] | undefined {
  try {
    const saved = localStorage.getItem(modSelectionStorageKey);
    if (saved === null) return undefined;
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(String) : undefined;
  } catch {
    return undefined;
  }
}

const savedModIds = readSavedModIds();
let pendingModIds = savedModIds ?? [];
let modSelectionInitialized = false;

data.load(savedModIds);

$: if (!modSelectionInitialized && $modCatalog.length) {
  pendingModIds = [...$enabledModIds];
  modSelectionInitialized = true;
}

function isPendingMod(id: string): boolean {
  return pendingModIds.includes(id);
}

function setPendingMod(id: string, checked: boolean) {
  pendingModIds = checked
    ? [...new Set([...pendingModIds, id])]
    : pendingModIds.filter((candidate) => candidate !== id);
}

function selectAllMods() {
  pendingModIds = $modCatalog.map((mod) => mod.id);
}

function selectNoMods() {
  pendingModIds = $modCatalog
    .filter((mod) => mod.required)
    .map((mod) => mod.id);
}

async function applyModSelection() {
  try {
    localStorage.setItem(
      modSelectionStorageKey,
      JSON.stringify(pendingModIds),
    );
  } catch {
    // 隐私模式可能禁用本地存储，不影响当前会话使用。
  }
  await data.load(pendingModIds);
  pendingModIds = [...$enabledModIds];
}

async function restoreDefaultMods() {
  try {
    localStorage.removeItem(modSelectionStorageKey);
  } catch {
    // 同上。
  }
  await data.load(undefined);
  pendingModIds = [...$enabledModIds];
}

function decodeQueryParam(p: string) {
  return decodeURIComponent(p.replace(/\+/g, " "));
}

function load() {
  const path = location.pathname.slice(import.meta.env.BASE_URL.length - 1);
  let m: RegExpExecArray | null;
  if ((m = /^\/([^\/]+)(?:\/(.+))?$/.exec(path))) {
    const [, type, id] = m;
    if (type === "search") {
      item = null;
      search = decodeQueryParam(id ?? "");
      renderSearchNow();
    } else {
      item = { type, id: id ? decodeURIComponent(id) : "" };
    }

    window.scrollTo(0, 0);
  } else {
    item = null;
    search = "";
    renderSearchNow();
  }
}

$: if (item && item.id && $data && $data.byIdMaybe(item.type as any, item.id)) {
  const it = $data.byId(item.type as any, item.id);
  document.title = `${singularName(
    it,
  )} - 微风指南`;
} else if (item && !item.id && item.type) {
  document.title = `${guideTypeName(item.type)} - 微风指南`;
} else {
  document.title = "微风指南";
}

load();

// Throttle replaceState to avoid browser warnings.
// |throttle| isn't defined when running tests for some reason.
const replaceState = throttle
  ? throttle(history.replaceState.bind(history), 100, {
      trailing: true,
    })
  : history.replaceState.bind(history);

const clearItem = () => {
  if (item)
    history.pushState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  else
    replaceState(
      null,
      "",
      import.meta.env.BASE_URL +
        (search ? "search/" + encodeURIComponent(search) : "") +
        location.search,
    );
  item = null;
};

function maybeNavigate(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const anchor = target?.closest("a") as HTMLAnchorElement | null;
  if (anchor && anchor.href) {
    const { origin, pathname } = new URL(anchor.href);
    if (
      origin === location.origin &&
      pathname.startsWith(import.meta.env.BASE_URL)
    ) {
      event.preventDefault();
      history.pushState(null, "", pathname + location.search);
      load();
    }
  }
}

window.addEventListener("popstate", () => {
  load();
});

let deferredPrompt: any;
window.addEventListener("beforeinstallprompt", (e) => {
  deferredPrompt = e;
});

function maybeFocusSearch(e: KeyboardEvent) {
  if (e.key === "/" && document.activeElement?.id !== "search") {
    document.getElementById("search")?.focus();
    e.preventDefault();
  }
}

const randomableItemTypes = new Set<keyof SupportedTypesWithMapped>([
  "item",
  "monster",
  "furniture",
  "terrain",
  "vehicle_part",
  "tool_quality",
  "mutation",
  "martial_art",
  "json_flag",
  "achievement",
  "conduct",
  "proficiency",
]);
async function getRandomPage() {
  const d = await new Promise<CddaData>((resolve) => {
    const unsubscribe = data.subscribe((v) => {
      if (v) {
        resolve(v);
        setTimeout(() => unsubscribe());
      }
    });
  });
  const items = d
    .all()
    .filter(
      (x) => "id" in x && randomableItemTypes.has(mapType(x.type)),
    ) as (SupportedTypeMapped & { id: string })[];
  return items[(Math.random() * items.length) | 0];
}

let randomPage: string | null = null;
function newRandomPage() {
  getRandomPage().then((r) => {
    randomPage = `${import.meta.env.BASE_URL}${mapType(r.type)}/${r.id}${
      location.search
    }`;
  });
}
newRandomPage();
</script>

<svelte:window on:click={maybeNavigate} on:keydown={maybeFocusSearch} />

<header>
  <nav>
    <div class="title">
      <!-- svelte-ignore a11y-invalid-attribute -->
      <strong>
        <a
          href={import.meta.env.BASE_URL + location.search}
          on:click={() => (search = "")}
          ><span class="wide">微风指南</span><span
            class="narrow">微</span
          ></a>
      </strong>
    </div>
    <div class="search">
      <input
        style="margin: 0; width: 100%"
        placeholder={t("搜索...")}
        type="search"
        bind:value={search}
        on:input={clearItem}
        id="search" />
    </div>
  </nav>
</header>
<main>
  {#if $dataLoadError}
    <section class="load-error">
      <h2>{t("指南数据加载失败")}</h2>
      <p>{$dataLoadError}</p>
      <button type="button" on:click={() => data.load(pendingModIds)}>
        {t("重新加载")}
      </button>
    </section>
  {/if}
  {#key $localeVersion}
  {#if item}
    {#if $data}
      {#key `${item.type}/${item.id}/${$data.build_number}`}
        {#if item.id}
          <Thing {item} data={$data} />
        {:else}
          <Catalog type={item.type} data={$data} />
        {/if}
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("加载中...")}</em>
        {#if $loadProgress && $loadProgress[1] > 1024}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else if search}
    {#if $data}
      {#key `${renderedSearch}/${$data.build_number}`}
        <SearchResults data={$data} search={renderedSearch} />
      {/key}
    {:else}
      <span style="color: var(--cata-color-gray)">
        <em>{t("加载中...")}</em>
        {#if $loadProgress && $loadProgress[1] > 1024}
          ({($loadProgress[0] / 1024 / 1024).toFixed(1)}/{(
            $loadProgress[1] /
            1024 /
            1024
          ).toFixed(1)} MB)
        {/if}
      </span>
    {/if}
  {:else}
    <img
      src={dontPanic}
      height="200"
      width="343"
      style="float:right"
      alt="大大的友善字体写着'不要慌'" />
    <p>
      <InterpolatedTranslation
        str={t(
          `{hhg} 是 CDDA-Breeze 的指南。你可以搜索游戏中的物品（如{link_flashlight}）、家具（如{link_table}）或怪物（如{link_zombie}），并查看它们的详细信息。数据来源于游戏本身的 JSON 文件。`,
          {
            hhg: "{hhg}",
            link_flashlight: "{link_flashlight}",
            link_table: "{link_table}",
            link_zombie: "{link_zombie}",
          },
        )}
        slot0="hhg"
        slot1="link_flashlight"
        slot2="link_table"
        slot3="link_zombie">
        <strong slot="0">微风指南</strong>
        <a
          slot="1"
          href="{import.meta.env.BASE_URL}item/flashlight{location.search}"
          >{t("flashlight", { _comment: "Item name" })}</a>
        <a
          slot="2"
          href="{import.meta.env.BASE_URL}furniture/f_table{location.search}"
          >{t("table", { _comment: "Furniture" })}</a>
        <a
          slot="3"
          href="{import.meta.env.BASE_URL}monster/mon_zombie{location.search}"
          >{t("zombie", { _comment: "Monster name" })}</a>
      </InterpolatedTranslation>
    </p>
    <p>
      {t(`数据存储在本地，支持离线使用。`)}
      {#if deferredPrompt}
        <InterpolatedTranslation
          str={t(
            `也可以将其{installable_button}，脱离浏览器像普通应用一样使用。`,
            { installable_button: "{installable_button}" },
          )}
          slot0="installable_button">
          <button
            slot="0"
            class="disclosure"
            on:click={(e) => {
              e.preventDefault();
              deferredPrompt.prompt();
            }}
            >{t("安装")}</button>
        </InterpolatedTranslation>
      {/if}
    </p>

    <h2>{t("目录")}</h2>
    <ul>
      <li><a href="{import.meta.env.BASE_URL}item{location.search}">{t("物品")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}monster{location.search}">{t("怪物")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}furniture{location.search}">{t("家具")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}terrain{location.search}">{t("地形")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}vehicle_part{location.search}">{t("车辆部件")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}tool_quality{location.search}">{t("工具质量")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}mutation{location.search}">{t("变异")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}martial_art{location.search}">{t("武术")}</a></li>
      <li><a href="{import.meta.env.BASE_URL}json_flag{location.search}">{t("标志")}</a></li>
      <li>
        <a href="{import.meta.env.BASE_URL}achievement{location.search}">{t("成就")}</a> /
        <a href="{import.meta.env.BASE_URL}conduct{location.search}">{t("行为")}</a>
      </li>
      <li><a href="{import.meta.env.BASE_URL}proficiency{location.search}">{t("专精")}</a></li>
    </ul>

    <InterpolatedTranslation
      str={t(`或访问{link_random_page}。`, {
        link_random_page: "{link_random_page}",
      })}
      slot0="link_random_page">
      <a slot="0" href={randomPage} on:click={() => setTimeout(newRandomPage)}
        >{t("随机页面")}</a>
    </InterpolatedTranslation>
  {/if}

  {#if $modCatalog.length}
    <details class="mod-options">
      <summary>
        {t("模组数据")}（{pendingModIds.length}/{$modCatalog.length}）
      </summary>
      <p class="mod-note">
        {t("这里只显示维护者已经审核并发布、且包含可检索内容的模组。首次打开默认全选，玩家只能调整自己的检索范围，不能从网页上传模组。")}
      </p>
      <div class="mod-grid">
        {#each $modCatalog as mod (mod.id)}
          <label class:required-mod={mod.required} title={mod.description || mod.id}>
            <input
              type="checkbox"
              checked={mod.required || isPendingMod(mod.id)}
              disabled={mod.required}
              on:change={(event) =>
                setPendingMod(
                  mod.id,
                  (event.currentTarget as HTMLInputElement).checked,
                )} />
            <span>
              <strong>{mod.name}</strong>
              <small>
                {mod.id}，{mod.objectCount.toLocaleString()} {t("个对象")}
                {#if mod.required}，{t("必需")}{/if}
              </small>
            </span>
          </label>
        {/each}
      </div>
      <div class="mod-actions">
        <button type="button" class="secondary" on:click={selectAllMods} disabled={$loadProgress !== null}>
          {t("全选")}
        </button>
        <button type="button" class="secondary" on:click={selectNoMods} disabled={$loadProgress !== null}>
          {t("全不选")}
        </button>
        <button type="button" class="primary" on:click={applyModSelection} disabled={$loadProgress !== null}>
          {t("应用模组选择")}
        </button>
        <button type="button" class="secondary" on:click={restoreDefaultMods} disabled={$loadProgress !== null}>
          {t("恢复默认全选")}
        </button>
      </div>
    </details>
  {/if}

  <p class="data-options">
    {t("版本:")}
    {#if $data}
      <strong>{$data.build_number}</strong>
    {:else}
      <em style="color: var(--cata-color-gray)">({t("Loading...")})</em>
    {/if}
  </p>
  {/key}
</main>

<style>
main {
  text-align: left;
  padding: 1em;
  max-width: 1120px;
  margin: 0 auto;
  margin-top: 4.5rem;
}

main > img {
  border: 1px solid var(--cata-color-dark-gray);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
  padding: 0.6rem;
}

main > ul {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.75rem;
  padding: 0;
  list-style: none;
}

main > ul li {
  margin: 0;
  border: 1px solid var(--cata-color-dark-gray);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  padding: 0.72rem 0.85rem;
}

main > ul li:hover {
  border-color: var(--cata-color-light-green);
  background: rgba(95, 210, 120, 0.07);
}

header {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  box-shadow: 0px 0px 8px rgba(0, 0, 0, 0.5);
  width: 100%;
  height: 4rem;
  background: rgba(22, 24, 23, 0.97);
  border-bottom: 1px solid rgba(95, 210, 120, 0.26);
  backdrop-filter: blur(10px);
  padding: 0 calc(1em + 8px);
  box-sizing: border-box;
}

nav {
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
}

nav > .search {
  flex: 1;
  max-width: calc(0.5 * 980px);
}

nav > .title .narrow {
  display: none;
}

nav > .title {
  margin-right: 1em;
  letter-spacing: 0.04em;
}

nav > .title a {
  color: var(--cata-color-light-green);
  text-decoration: none;
}

@media (max-width: 600px) {
  nav > .title .wide {
    display: none;
  }
  nav > .title .narrow {
    display: inline;
  }

  nav > .search {
    flex: 1;
  }
}

.mod-options {
  margin-top: 2rem;
  border: 1px solid var(--cata-color-dark-gray);
  border-radius: 14px;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.022);
}

.mod-options > summary {
  cursor: pointer;
  font-weight: bold;
  color: var(--cata-color-light-green);
  font-size: 1.05rem;
}

.mod-note {
  color: var(--cata-color-light-gray);
}

.mod-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.5rem 1rem;
  margin: 1rem 0;
}

.mod-grid label {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  border: 1px solid var(--cata-color-dark-gray);
  border-radius: 10px;
  padding: 0.65rem;
  background: rgba(0, 0, 0, 0.14);
}

.mod-grid label:hover {
  border-color: rgba(95, 210, 120, 0.55);
}

.mod-grid label > span {
  display: flex;
  flex-direction: column;
}

.mod-grid small {
  color: var(--cata-color-gray);
}

.required-mod {
  opacity: 0.8;
}

.mod-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.mod-actions button {
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.mod-actions button.primary {
  border-color: var(--cata-color-light-green);
  background: rgba(95, 210, 120, 0.16);
  color: var(--cata-color-light-green);
}

.mod-actions button.secondary {
  background: rgba(255, 255, 255, 0.04);
}

.mod-actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.load-error {
  border: 1px solid var(--cata-color-light-red);
  padding: 1rem;
  margin-bottom: 1rem;
}

.data-options select {
  max-width: 100%;
}
</style>
